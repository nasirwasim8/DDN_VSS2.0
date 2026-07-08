"""
LLM Semantic Enrichment Service for VSS Video Intelligence.

Uses a local Ollama (llava:7b) or OpenAI GPT-4o-mini Vision model to transform
raw BLIP captions and ViT object labels into clean, search-optimized metadata.

Works 100% offline with Ollama — no internet required at conferences.
Falls back gracefully if the model is unavailable.
"""
import base64
import json
import logging
import time
from io import BytesIO
from typing import List, Optional
from PIL import Image
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)


ENRICHMENT_PROMPT = """You are a precise video analysis expert. Analyze the provided keyframes and context.

Perform these 6 reasoning steps:
1. SCENE: Identify the primary scene/environment (indoor, outdoor, urban, nature, etc.)
2. OBJECTS: Identify key objects that appear consistently across frames
3. EVENTS: Detect meaningful actions or events occurring
4. FILTER: Remove irrelevant, uncertain, or noisy observations
5. SUMMARY: Write a 2-3 sentence accurate, human-readable description
6. TAGS: Generate 8-12 search-optimized tags (lowercase, specific)

Additional context from CV models:
- BLIP captions: {captions}
- Detected objects: {objects}
- Video duration: {duration}s

IMPORTANT: Base your analysis ONLY on what you can see in the images and context above.
Do NOT invent or hallucinate details.

Respond with ONLY valid JSON (no markdown, no explanation):
{{
  "summary": "2-3 sentence description of the video content",
  "scene_type": "one of: urban_outdoor, indoor_office, nature, industrial, residential, transit, crowd, other",
  "key_events": ["event1", "event2"],
  "search_tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "dominant_subjects": ["subject1", "subject2"]
}}"""


class EnrichedMetadata:
    """Structured result from LLM enrichment."""
    def __init__(self, summary: str, scene_type: str,
                 key_events: List[str], search_tags: List[str],
                 dominant_subjects: List[str]):
        self.summary = summary
        self.scene_type = scene_type
        self.key_events = key_events
        self.search_tags = search_tags
        self.dominant_subjects = dominant_subjects


class LLMEnrichmentService:
    """
    Post-processing enrichment using a vision LLM.

    Supports:
      - Ollama (local, offline) — default, works at conferences
      - OpenAI GPT-4o-mini (cloud) — optional via OPENAI_API_KEY env var
    """

    def __init__(self, provider: str = "ollama", model: str = "llava:7b",
                 ollama_base_url: str = "http://localhost:11434",
                 openai_api_key: Optional[str] = None):
        self.provider = provider
        self.model = model
        self.ollama_base_url = ollama_base_url.rstrip("/")
        self.openai_api_key = openai_api_key
        self._available: Optional[bool] = None

    def is_available(self) -> bool:
        """Check if the LLM backend is reachable."""
        if self._available is not None:
            return self._available
        try:
            if self.provider == "ollama":
                url = f"{self.ollama_base_url}/api/tags"
                with urllib.request.urlopen(url, timeout=3) as resp:
                    data = json.loads(resp.read())
                    models = [m["name"] for m in data.get("models", [])]
                    self._available = any(self.model in m for m in models)
                    if not self._available:
                        logger.warning(f"Ollama running but '{self.model}' not found. Available: {models}")
            elif self.provider == "openai":
                self._available = bool(self.openai_api_key)
            else:
                self._available = False
        except Exception as e:
            logger.warning(f"LLM enrichment not available ({self.provider}): {e}")
            self._available = False
        return self._available

    def _select_keyframes(self, keyframe_paths: List[str], max_frames: int = 3) -> List[str]:
        """Select evenly-spaced frames for best temporal coverage."""
        if not keyframe_paths:
            return []
        if len(keyframe_paths) <= max_frames:
            return keyframe_paths
        step = len(keyframe_paths) / max_frames
        return [keyframe_paths[int(i * step)] for i in range(max_frames)]

    def _image_to_base64(self, image_path: str, max_size: int = 512) -> Optional[str]:
        """Load, resize, and encode image as base64 JPEG."""
        try:
            img = Image.open(image_path).convert("RGB")
            # Resize to max_size on longest edge (keeps aspect ratio, reduces tokens)
            w, h = img.size
            if max(w, h) > max_size:
                scale = max_size / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=85)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            logger.warning(f"Failed to encode image {image_path}: {e}")
            return None

    def _call_ollama(self, prompt: str, images_b64: List[str]) -> Optional[str]:
        """Call Ollama Vision API."""
        payload = json.dumps({
            "model": self.model,
            "prompt": prompt,
            "images": images_b64,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 512}
        }).encode()

        req = urllib.request.Request(
            f"{self.ollama_base_url}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return result.get("response", "")

    def _call_openai(self, prompt: str, images_b64: List[str]) -> Optional[str]:
        """Call OpenAI Vision API (GPT-4o-mini) with retry on 429 rate-limit."""
        import urllib.request
        import urllib.error

        if images_b64:
            # Vision mode — send images + text
            content = [{"type": "text", "text": prompt}]
            for img_b64 in images_b64:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_b64}", "detail": "low"}
                })
        else:
            # Text-only mode — rely on captions / detected objects in prompt
            content = [{"type": "text", "text": prompt}]

        payload = json.dumps({
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": content}],
            "max_tokens": 512,
            "temperature": 0.1
        }).encode()

        # Retry up to 3 times on 429 (rate-limit) with exponential backoff
        retry_waits = [5, 15, 30]   # seconds between retries
        for attempt, wait in enumerate(retry_waits + [None], start=1):
            try:
                req = urllib.request.Request(
                    "https://api.openai.com/v1/chat/completions",
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.openai_api_key}"
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    result = json.loads(resp.read())
                    return result["choices"][0]["message"]["content"]

            except urllib.error.HTTPError as e:
                if e.code == 429 and wait is not None:
                    # Read retry-after header if available
                    retry_after = int(e.headers.get("Retry-After", wait))
                    logger.warning(
                        f"OpenAI rate-limited (429) on attempt {attempt}/3 "
                        f"— retrying in {retry_after}s..."
                    )
                    time.sleep(retry_after)
                    continue
                elif e.code == 429:
                    logger.error("OpenAI still rate-limited after 3 retries — giving up")
                    return None
                else:
                    logger.error(f"OpenAI HTTP error {e.code}: {e.reason}")
                    return None
            except Exception as e:
                logger.error(f"OpenAI call failed: {e}")
                return None

        return None

    def _parse_response(self, raw: str) -> Optional[EnrichedMetadata]:
        """Parse LLM JSON response, handling common formatting issues."""
        try:
            # Strip markdown fences if present
            text = raw.strip()
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            # Find JSON object
            start = text.find("{")
            end = text.rfind("}") + 1
            if start == -1 or end == 0:
                return None
            data = json.loads(text[start:end])
            return EnrichedMetadata(
                summary=str(data.get("summary", "")).strip(),
                scene_type=str(data.get("scene_type", "")).strip(),
                key_events=[str(e) for e in data.get("key_events", [])],
                search_tags=[str(t).lower().strip() for t in data.get("search_tags", [])],
                dominant_subjects=[str(s) for s in data.get("dominant_subjects", [])]
            )
        except Exception as e:
            logger.warning(f"Failed to parse LLM response: {e}\nRaw: {raw[:300]}")
            return None

    def enrich(
        self,
        keyframe_paths: List[str],
        captions: List[str],
        detected_objects: List[str],
        duration_seconds: float
    ) -> Optional[EnrichedMetadata]:
        """
        Main enrichment entry point.

        Args:
            keyframe_paths: File paths to extracted keyframe images
            captions: BLIP-generated captions for keyframes
            detected_objects: ViT/simple object labels
            duration_seconds: Total video duration

        Returns:
            EnrichedMetadata or None if enrichment fails/unavailable
        """
        if not self.is_available():
            return None

        t0 = time.time()
        try:
            # Select 2-3 evenly-spaced keyframes
            selected_paths = self._select_keyframes(keyframe_paths, max_frames=3)
            images_b64 = [b64 for p in selected_paths if (b64 := self._image_to_base64(p))]

            if not images_b64:
                if captions or detected_objects:
                    logger.info("No encodeable keyframes — attempting text-only enrichment with captions/objects")
                    # text-only: for Ollama we skip (needs vision), for OpenAI we continue
                    if self.provider != "openai":
                        logger.warning("No images and provider is not OpenAI — skipping enrichment")
                        return None
                else:
                    logger.warning("No keyframe images and no captions — skipping enrichment")
                    return None

            prompt = ENRICHMENT_PROMPT.format(
                captions=" | ".join(captions[:5]) if captions else "not available",
                objects=", ".join(detected_objects[:10]) if detected_objects else "not available",
                duration=round(duration_seconds, 1)
            )

            # Call the appropriate backend
            if self.provider == "ollama":
                raw = self._call_ollama(prompt, images_b64)
            elif self.provider == "openai":
                raw = self._call_openai(prompt, images_b64)
            else:
                return None

            if not raw:
                return None

            result = self._parse_response(raw)
            elapsed = time.time() - t0
            if result:
                logger.info(f"✨ LLM enrichment ({self.provider}): {elapsed:.2f}s | scene={result.scene_type}")
            else:
                logger.warning(f"LLM enrichment parse failed after {elapsed:.2f}s")
            return result

        except Exception as e:
            logger.error(f"LLM enrichment failed: {e}", exc_info=True)
            return None


# ── Singleton factory ─────────────────────────────────────────────────────────

_enrichment_service: Optional[LLMEnrichmentService] = None

def get_enrichment_service() -> LLMEnrichmentService:
    """Return singleton enrichment service (lazy init).
    
    Priority:
      1. OpenAI (default — best quality, requires internet + OPENAI_API_KEY)
      2. Ollama  (auto-fallback — offline, runs locally on GPU)
    """
    global _enrichment_service
    if _enrichment_service is None:
        import os
        provider = os.getenv("LLM_PROVIDER", "openai")   # default: openai
        model = os.getenv("LLM_MODEL", "llava:7b")
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        openai_key = os.getenv("OPENAI_API_KEY", "")
        _enrichment_service = LLMEnrichmentService(
            provider=provider,
            model=model,
            ollama_base_url=ollama_url,
            openai_api_key=openai_key or None
        )
        avail = _enrichment_service.is_available()
        logger.info(f"🤖 LLM enrichment: provider={provider} model={model} available={avail}")
    return _enrichment_service


def enrich_with_fallback(
    keyframe_paths: List[str],
    captions: List[str],
    detected_objects: List[str],
    duration_seconds: float
):
    """
    Try the configured provider; auto-fallback to Ollama if OpenAI fails.

    Returns:
        Tuple of (EnrichedMetadata | None, provider_used_str)
        provider_used_str is 'openai', 'ollama', or 'none'
    """
    import os

    # ── Always load persisted config first so background tasks see the key ───
    # This is critical: background video processing runs in a thread that may
    # never have hit the /config/llm GET endpoint, so os.environ may be empty.
    try:
        _llm_config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "data", "llm_config.json"
        )
        if os.path.exists(_llm_config_path):
            import json as _json
            _cfg = _json.loads(open(_llm_config_path).read())
            _key_map = [
                ("LLM_PROVIDER",    "provider"),
                ("OPENAI_API_KEY",  "openai_api_key"),
                ("OLLAMA_BASE_URL", "ollama_url"),
                ("LLM_MODEL",       "model"),
            ]
            for _env_key, _json_key in _key_map:
                if _cfg.get(_json_key) and not os.environ.get(_env_key):
                    os.environ[_env_key] = _cfg[_json_key]
                    logger.info(f"🔑 Loaded {_env_key} from llm_config.json for enrichment")
    except Exception as _e:
        logger.warning(f"Could not load llm_config.json in enrich_with_fallback: {_e}")

    provider_pref = os.getenv("LLM_PROVIDER", "auto")   # "openai", "ollama", or "auto"
    openai_key = os.getenv("OPENAI_API_KEY", "")
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("LLM_MODEL", "llava:7b")

    logger.info(f"🤖 enrich_with_fallback: provider_pref={provider_pref} openai_key_set={bool(openai_key)}")

    try_openai = provider_pref in ("openai", "auto") and bool(openai_key)
    openai_succeeded = False

    # ── Try OpenAI first ──────────────────────────────────────────────────────
    if try_openai:
        try:
            svc = LLMEnrichmentService(
                provider="openai",
                openai_api_key=openai_key
            )
            result = svc.enrich(keyframe_paths, captions, detected_objects, duration_seconds)
            if result:
                logger.info("✅ Used OpenAI for enrichment")
                return result, "openai"
            logger.warning("OpenAI returned empty result — falling back to Ollama")
        except Exception as e:
            logger.warning(f"OpenAI enrichment failed ({e}) — falling back to Ollama")
    else:
        if not openai_key:
            logger.info("No OPENAI_API_KEY set — using Ollama directly")

    # ── Try Ollama: either as primary (provider=ollama/no key) or as fallback ─
    # Always try Ollama if: (a) provider=ollama, (b) no OpenAI key, OR (c) OpenAI just failed
    should_try_ollama = (
        provider_pref in ("ollama", "auto")
        or not bool(openai_key)          # no key → Ollama primary
        or try_openai                    # OpenAI was attempted (may have failed) → fallback
    )
    if should_try_ollama:
        try:
            svc = LLMEnrichmentService(
                provider="ollama",
                model=model,
                ollama_base_url=ollama_url
            )
            if svc.is_available():
                result = svc.enrich(keyframe_paths, captions, detected_objects, duration_seconds)
                if result:
                    logger.info("✅ Used Ollama for enrichment")
                    return result, "ollama"
                logger.warning("Ollama returned empty result")
            else:
                logger.warning("Ollama not available — enrichment skipped")
        except Exception as e:
            logger.warning(f"Ollama enrichment failed: {e}")

    return None, "none"




