# Honest Technical Analysis: How This App Does Semantic Search Without a Vector DB

> **Audience**: Technical team wanting to understand the actual mechanics and whether the design is scalable.  
> **Tone**: No spin. Just facts from the code.  
> **Note**: This document is a post-GTC implementation roadmap. Read it before starting the vector persistence feature.

---

## The One-Line Honest Answer

> **This application uses a real AI model (CLIP) for embedding generation, but has no persistent vector index and falls back to plain keyword matching in standard production operation. It is a strong proof-of-concept — not yet a production search system.**

---

## What Actually Happens — Step by Step

### 1. Ingestion (Upload Time)

When a file is uploaded, the backend:

1. Runs **BLIP** (`Salesforce/blip-image-captioning-base`) on extracted keyframes → generates natural-language captions (e.g., *"a man standing in a server room"*).
2. Runs **ViT** (`google/vit-base-patch16-224`) → classifies the scene into ImageNet-style labels.
3. Runs **CLIP** (`openai/clip-vit-base-patch32`) → generates a **512-dimensional L2-normalized embedding vector** for each keyframe.

This is a real ML pipeline. The question is: **where does the CLIP embedding go?**

### What IS Stored on Infinia — The Manifest JSON

After processing, a `manifest_v1.json` file **is** written to Infinia at:
```
media/derived/manifests/{asset_id}/manifest_v1.json
```

This contains real, structured data:
- `video_summary` — BLIP-generated captions
- `detected_objects` — comma-separated labels
- `enriched_summary` / `enriched_tags` — LLM-generated rich semantic text
- `chunks[]` → `keyframes[]` → `caption`, `timestamp`, `s3_key`, `embedding_id`
- Processing status, duration, fps, LLM provider used

### What is NOT in the Manifest — The Critical Gap

`KeyframeMetadata` in `manifest.py`:

```python
class KeyframeMetadata(BaseModel):
    frame_id: str
    timestamp: float
    s3_key: str
    embedding_id: str      # ← a string ID placeholder only
    caption: str
    tags: Optional[StructuredTags]
    confidence_score: float
    # ❌ No 'embedding: List[float]' field — the 512 floats have nowhere to land
```

In `storage.py`, a helper exists but is **never called** at ingestion:

```python
def get_embeddings_key(self, asset_id: str, version: int = 1) -> str:
    return f"media/derived/embeddings/{asset_id}_v{version}.json"
    # ← Correct path, correct idea. Nothing writes to it yet.
```

| What's stored in Infinia | Format | Contains CLIP vector? |
|---|---|---|
| Raw media file | binary | N/A |
| `manifest_v1.json` | JSON | ❌ No — has `embedding_id` string but no float array |
| Keyframe images | JPEG | N/A |
| `media/derived/embeddings/` path | — | ❌ Never written to |

The manifest infrastructure is solid. **The missing step: writing the computed float vector into `media/derived/embeddings/`.**

---

### 2. Search Time — The Real Code

From `routes.py` (lines 1120–1340):

```python
# STEP 1: List ALL objects from the bucket (O(N) scan)
objects, msg = handler.list_objects(include_metadata=True)

# STEP 2: Real CLIP cosine similarity — only if local cache + .json sidecar exists
if use_semantic_search and embedding_file.exists():
    score = max(np.dot(query_embedding, frame_emb) for frame_emb in frame_data)

# STEP 3: Otherwise (normal production path) → keyword matching only
if score == 0.0:
    matches = sum(1 for word in query_words if word in searchable_text)
    score = matches / len(query_words)   # not a semantic score
```

| Scenario | What Actually Runs |
|---|---|
| Local cache mode + pre-computed `.json` sidecar file exists | ✅ Real CLIP cosine similarity |
| Standard DDN INFINIA mode (no sidecar files) | ⚠️ Plain keyword matching (like `grep`) |
| Embeddings file missing in local cache mode | Falls back to keyword matching |

---

## Scalability Assessment

### Current Architecture
```
Query → list_objects() [all of S3] → for each object:
         → S3 GET manifest (N round trips)
         → keyword match text
         → Python sort()
→ return top_k
```

| Scale | Current (keyword) | With Persisted CLIP + FAISS |
|---|---|---|
| 100 assets | Fast enough | Fast |
| 10,000 assets | **~minutes** | <100ms |
| 1,000,000 assets | **Unusable** | <500ms |
| Concurrent queries | Full re-scan per query | Shared in-memory index |

---

## Post-GTC: What Needs to Be Built

The CLIP model runs correctly. The ingestion pipeline is correct. Two things are missing:

### Fix 1 — Persist the Embedding Vector (Small Change)

**In `manifest.py`** — add embedding field to `KeyframeMetadata`:

```python
class KeyframeMetadata(BaseModel):
    # ... existing fields ...
    embedding: Optional[List[float]] = Field(default=None, description="CLIP 512-dim vector")
```

**In `routes.py` / `bucket_monitor.py`** — after `compute_clip_embedding()` is called, write it:

```python
embedding = image_analyzer.compute_clip_embedding(frame)
embedding_data = {
    "asset_id": asset_id,
    "frames": [{"frame_id": frame_id, "timestamp": ts, "embedding": embedding.tolist()}]
}
storage.upload_json(embedding_data, storage.get_embeddings_key(asset_id))
# ↑ get_embeddings_key() already exists in storage.py — just call it
```

### Fix 2 — Wire the Search Path to Read from Infinia (Not Just Local Cache)

In `routes.py` semantic search block, add DDN path alongside the existing local cache path:

```python
# Current: only checks local filesystem
embedding_file = embeddings_path / f"{video_filename}.json"

# Needed: also check media/derived/embeddings/{asset_id}_v1.json in Infinia
embedding_data, _ = storage.download_json(storage.get_embeddings_key(asset_id))
```

### Fix 3 — Optional: FAISS Index for Scale (Bigger Change)

For >10K assets, load all stored embeddings at startup into a FAISS flat index. Rebuild nightly or on each ingestion. This eliminates the O(N) S3 scan entirely.

```python
import faiss
index = faiss.IndexFlatIP(512)   # inner product = cosine on L2-normed vectors
# Populate from media/derived/embeddings/ at startup
```

---

## Summary for the Engineer Picking This Up

| Item | Status |
|---|---|
| CLIP model runs at ingestion | ✅ Working |
| BLIP captions saved to manifest | ✅ Working |
| LLM enrichment (OpenAI/Ollama) | ✅ Working |
| `manifest_v1.json` written to Infinia | ✅ Working |
| `get_embeddings_key()` helper in storage.py | ✅ Exists, not called |
| CLIP vector actually persisted | ❌ Missing |
| Search reads persisted vectors | ❌ Missing |
| ANN index (FAISS) | ❌ Not implemented |

**Estimated effort to fix Fixes 1 + 2**: 1–2 days of backend work.  
**Estimated effort to add FAISS (Fix 3)**: additional 2–3 days.  
**No new infrastructure dependencies required** if using FAISS flat index + DDN as the embedding store.

---

## Honest Framing Going Forward

> *"Embeddings are computed on GPU at ingestion using CLIP and stored as structured JSON alongside the media in DDN INFINIA. The post-GTC roadmap closes the loop: persisting the float vectors into `media/derived/embeddings/` and wiring the search path to read them — enabling full cosine similarity search with no external vector database dependency."*
