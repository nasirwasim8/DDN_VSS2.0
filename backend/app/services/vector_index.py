"""
VectorIndexService — FAISS-backed persistent vector index for DDN VSS.

Stores CLIP ViT-B/32 embeddings (512-dim float32, L2-normalized) alongside
per-frame metadata. Uses IndexFlatIP (inner product on L2-normalised vectors
equals cosine similarity) for exact nearest-neighbour search.

Thread-safe: RLock guards all writes; reads are lock-free after load.
GPU: uses faiss-gpu when CUDA is available; falls back to faiss-cpu silently.

Persistence:
    backend/data/faiss/index.faiss   — FAISS binary index
    backend/data/faiss/metadata.json — ID → asset metadata mapping
"""

import os
import json
import threading
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_THIS_DIR  = os.path.dirname(os.path.abspath(__file__))
INDEX_DIR  = os.path.normpath(os.path.join(_THIS_DIR, "../../../data/faiss"))
INDEX_PATH = os.path.join(INDEX_DIR, "index.faiss")
META_PATH  = os.path.join(INDEX_DIR, "metadata.json")

DIM = 512  # CLIP ViT-B/32 output dimension


# ---------------------------------------------------------------------------
# FAISS backend selection (GPU → CPU fallback)
# ---------------------------------------------------------------------------
def _load_faiss():
    """Import FAISS, preferring GPU build; silently fall back to CPU."""
    try:
        import faiss
        if faiss.get_num_gpus() > 0:
            logger.info(f"✅ FAISS GPU ready — {faiss.get_num_gpus()} GPU(s)")
        else:
            logger.info("ℹ️  FAISS loaded (CPU mode — no GPU detected)")
        return faiss
    except ImportError:
        raise RuntimeError(
            "FAISS not installed. Run:  pip install faiss-gpu  (or faiss-cpu)"
        )


# ---------------------------------------------------------------------------
# VectorIndexService
# ---------------------------------------------------------------------------
class VectorIndexService:
    """
    Thread-safe FAISS vector index with JSON metadata sidecar.

    Each entry stores a 512-dim CLIP embedding plus a metadata dict with
    keys: asset_id, media_type, s3_key, chunk_id, frame_id, timestamp,
    caption, tags, source.
    """

    def __init__(self):
        self._lock    = threading.RLock()
        self._faiss   = _load_faiss()
        self._index   = None
        self._meta: dict[str, dict] = {}   # str(faiss_id) → metadata
        self._next_id = 0
        os.makedirs(INDEX_DIR, exist_ok=True)
        self._load()

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _load(self) -> None:
        """Load existing index + metadata from disk (or create empty)."""
        if os.path.exists(INDEX_PATH) and os.path.exists(META_PATH):
            try:
                self._index = self._faiss.read_index(INDEX_PATH)
                with open(META_PATH, "r", encoding="utf-8") as f:
                    self._meta = json.load(f)
                self._next_id = self._index.ntotal
                logger.info(
                    f"✅ FAISS index loaded — {self._index.ntotal} vectors"
                )
                return
            except Exception as e:
                logger.warning(f"⚠️  Could not load FAISS index: {e} — creating new")

        # Fresh index
        self._index   = self._faiss.IndexFlatIP(DIM)
        self._meta    = {}
        self._next_id = 0
        logger.info("📦 Created new FAISS IndexFlatIP (dim=512)")

    def save(self) -> None:
        """Persist index + metadata to disk atomically."""
        with self._lock:
            try:
                self._faiss.write_index(self._index, INDEX_PATH)
                tmp = META_PATH + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(self._meta, f)
                os.replace(tmp, META_PATH)
                logger.debug(f"💾 FAISS saved — {self._index.ntotal} vectors")
            except Exception as e:
                logger.error(f"❌ FAISS save failed: {e}")

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def add(self, embedding: np.ndarray, metadata: dict) -> int:
        """
        Add one 512-dim embedding with associated metadata.

        Returns the FAISS ID assigned to this vector.
        """
        vec = self._normalise(embedding.astype(np.float32).reshape(1, -1))
        with self._lock:
            fid              = self._next_id
            self._index.add(vec)
            self._meta[str(fid)] = {**metadata, "faiss_id": fid}
            self._next_id   += 1
        return fid

    def add_batch(
        self,
        embeddings: np.ndarray,
        metadatas: list[dict],
    ) -> list[int]:
        """
        Add a batch of N embeddings.

        embeddings: np.ndarray of shape (N, 512)
        Returns list of assigned FAISS IDs.
        """
        if len(embeddings) == 0:
            return []
        vecs = self._normalise(embeddings.astype(np.float32))
        with self._lock:
            start = self._next_id
            self._index.add(vecs)
            for i, meta in enumerate(metadatas):
                fid = start + i
                self._meta[str(fid)] = {**meta, "faiss_id": fid}
            self._next_id += len(embeddings)
        return list(range(start, self._next_id))

    def delete_by_asset(self, asset_id: str) -> int:
        """
        Remove all vectors belonging to asset_id.

        FAISS IndexFlatIP does not support in-place deletion, so this
        rebuilds the index from scratch (cheap at demo scale).
        Returns the number of vectors removed.
        """
        with self._lock:
            keep = [
                k for k, v in self._meta.items()
                if v.get("asset_id") != asset_id
            ]
            removed = len(self._meta) - len(keep)
            if removed == 0:
                return 0

            new_index = self._faiss.IndexFlatIP(DIM)
            new_meta: dict[str, dict] = {}
            new_id = 0

            for old_id_str in keep:
                old_id = int(old_id_str)
                vec = np.zeros(DIM, dtype=np.float32)
                try:
                    self._index.reconstruct(old_id, vec)
                except Exception:
                    continue          # skip corrupted entries
                new_index.add(vec.reshape(1, -1))
                new_meta[str(new_id)] = {
                    **self._meta[old_id_str],
                    "faiss_id": new_id,
                }
                new_id += 1

            self._index   = new_index
            self._meta    = new_meta
            self._next_id = new_id

        self.save()
        logger.info(f"🗑️  Removed {removed} vectors for asset_id={asset_id}")
        return removed

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        query_embedding: np.ndarray,
        k: int = 20,
        min_score: float = 0.25,
        media_type: Optional[str] = None,
    ) -> list[dict]:
        """
        Search for the top-k nearest neighbours.

        Returns a list of metadata dicts each augmented with 'score'
        (cosine similarity, 0–1 range on L2-normalised vectors).

        Optionally filter by media_type ('video', 'image', 'rtsp', …).
        """
        if self._index.ntotal == 0:
            return []

        vec = self._normalise(
            query_embedding.astype(np.float32).reshape(1, -1)
        )
        actual_k = min(k * 3, self._index.ntotal)   # over-fetch to allow filtering
        scores, ids = self._index.search(vec, actual_k)

        results: list[dict] = []
        for score, fid in zip(scores[0], ids[0]):
            if fid < 0 or float(score) < min_score:
                continue
            meta = self._meta.get(str(fid))
            if meta is None:
                continue
            if media_type and meta.get("media_type") != media_type:
                continue
            results.append({**meta, "score": float(score)})
            if len(results) >= k:
                break

        return results

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def total_vectors(self) -> int:
        return self._index.ntotal if self._index else 0

    @property
    def index_size_mb(self) -> float:
        try:
            return os.path.getsize(INDEX_PATH) / 1_000_000
        except OSError:
            return 0.0

    def stats(self) -> dict:
        """Return a summary dict for the /api/search/index/stats endpoint."""
        return {
            "total_vectors": self.total_vectors,
            "index_size_mb": round(self.index_size_mb, 2),
            "index_path":    INDEX_PATH,
            "mode":          "faiss",
            "dim":           DIM,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalise(vecs: np.ndarray) -> np.ndarray:
        """L2-normalise rows of a (N, D) or (1, D) array in-place."""
        norms = np.linalg.norm(vecs, axis=-1, keepdims=True)
        norms[norms == 0] = 1.0
        return vecs / norms


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------
_instance: Optional[VectorIndexService] = None
_init_lock = threading.Lock()


def get_vector_index() -> VectorIndexService:
    """Return the process-wide VectorIndexService singleton."""
    global _instance
    if _instance is None:
        with _init_lock:
            if _instance is None:
                _instance = VectorIndexService()
    return _instance
