"""
RTSPIngestor — Live RTSP stream ingestion service for DDN VSS.

Captures frames from one or more RTSP streams at a configurable rate,
runs CLIP embedding on each frame, and adds to the FAISS vector index.
Also uploads keyframes to INFINIA S3 for persistent storage.

Architecture
────────────
  RTSPIngestor (singleton)
    └── streams: dict[stream_id → StreamWorker]
          each StreamWorker runs in a daemon Thread:
            loop:
              grab frame every SAMPLE_INTERVAL seconds
              compute CLIP embedding  →  VectorIndexService.add()
              upload JPEG to INFINIA  (every UPLOAD_EVERY_N frames)
          emits live frames via a Queue → SSE endpoint can read them

Threading model
───────────────
  - One Thread per stream (daemon=True, dies with main process)
  - Frame queues are bounded (maxsize=2) — drops old frames if consumer is slow
  - FAISS writes are serialised by VectorIndexService's own RLock
"""

import os
import io
import time
import uuid
import logging
import threading
from dataclasses import dataclass, field
from queue import Queue, Full
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
SAMPLE_INTERVAL  = 2.0    # seconds between captured frames (user chose 1 frame/2s)
UPLOAD_EVERY_N   = 5      # upload every Nth frame to INFINIA (reduce S3 writes)
SAVE_INDEX_EVERY = 50     # save FAISS index every N indexed frames per stream
JPEG_QUALITY     = 75     # JPEG quality for keyframe uploads

# Public demo RTSP streams (free, no auth required, suitable for demo)
DEMO_STREAMS = [
    {
        "id":          "rtsp-traffic-01",
        "name":        "Traffic — Intersection View",
        "url":         "rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4",
        "description": "Public demo: traffic-like continuous stream",
        "tags":        ["traffic", "outdoor", "vehicles"],
    },
    {
        "id":          "rtsp-demo-02",
        "name":        "Big Buck Bunny (Demo)",
        "url":         "rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4",
        "description": "Public Wowza RTSP demo stream",
        "tags":        ["animation", "outdoor", "demo"],
    },
]


# ── Data classes ──────────────────────────────────────────────────────────────
@dataclass
class StreamInfo:
    stream_id:   str
    name:        str
    url:         str
    description: str = ""
    tags:        list = field(default_factory=list)
    status:      str = "stopped"       # stopped | starting | running | error
    frames_captured: int = 0
    frames_indexed:  int = 0
    frames_uploaded: int = 0
    error_msg:   str = ""
    started_at:  float = 0.0
    last_frame_at: float = 0.0


# ── StreamWorker thread ───────────────────────────────────────────────────────
class StreamWorker(threading.Thread):
    """Background thread that ingests one RTSP stream."""

    def __init__(self, info: StreamInfo, storage_config, frame_queue: Queue):
        super().__init__(daemon=True, name=f"rtsp-{info.stream_id}")
        self.info          = info
        self.storage_config = storage_config
        self.frame_queue   = frame_queue
        self._stop_event   = threading.Event()

    def stop(self):
        self._stop_event.set()

    def run(self):
        try:
            import cv2
            from PIL import Image
            from app.services.vector_index import get_vector_index
            from app.services.ai_models import get_image_analyzer
        except ImportError as e:
            self.info.status    = "error"
            self.info.error_msg = f"Missing dependency: {e}"
            logger.error(f"[{self.info.stream_id}] {e}")
            return

        self.info.status    = "starting"
        self.info.started_at = time.time()
        logger.info(f"[{self.info.stream_id}] Opening: {self.info.url}")

        cap = cv2.VideoCapture(self.info.url)
        if not cap.isOpened():
            self.info.status    = "error"
            self.info.error_msg = "Could not open RTSP stream"
            logger.error(f"[{self.info.stream_id}] Failed to open stream")
            return

        self.info.status = "running"
        logger.info(f"[{self.info.stream_id}] Stream open — ingesting…")

        vector_index   = get_vector_index()
        image_analyzer = get_image_analyzer()
        storage        = self._make_storage()

        last_sample    = 0.0
        frame_n        = 0
        indexed_since_save = 0

        while not self._stop_event.is_set():
            now = time.time()
            if now - last_sample < SAMPLE_INTERVAL:
                time.sleep(0.1)
                continue

            ret, bgr = cap.read()
            if not ret:
                logger.warning(f"[{self.info.stream_id}] Frame read failed — reconnecting…")
                time.sleep(2.0)
                cap.release()
                cap = cv2.VideoCapture(self.info.url)
                continue

            last_sample = now
            frame_n    += 1
            self.info.frames_captured += 1
            self.info.last_frame_at   = now

            # Convert BGR → RGB PIL Image
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            pil = Image.fromarray(rgb)

            # Encode JPEG for the live preview queue
            buf = io.BytesIO()
            pil.save(buf, "JPEG", quality=JPEG_QUALITY)
            jpeg_bytes = buf.getvalue()

            # Push to SSE queue (non-blocking, drop oldest if full)
            try:
                self.frame_queue.put_nowait({
                    "stream_id": self.info.stream_id,
                    "jpeg":      jpeg_bytes,
                    "ts":        now,
                })
            except Full:
                pass

            # CLIP embedding → FAISS
            if image_analyzer and image_analyzer.models_loaded:
                try:
                    emb = image_analyzer.compute_clip_embedding(pil)
                    if emb is not None and len(emb) == 512:
                        vector_index.add(emb, {
                            "asset_id":   self.info.stream_id,
                            "media_type": "rtsp",
                            "s3_key":     "",          # filled after upload
                            "chunk_id":   0,
                            "frame_id":   frame_n,
                            "timestamp":  now,
                            "caption":    "",
                            "tags":       self.info.tags,
                            "stream_name": self.info.name,
                            "source":     "rtsp",
                        })
                        self.info.frames_indexed += 1
                        indexed_since_save       += 1
                except Exception as e:
                    logger.warning(f"[{self.info.stream_id}] Embed error: {e}")

            # Periodic S3 upload of keyframe
            if storage and frame_n % UPLOAD_EVERY_N == 0:
                try:
                    ts_str  = f"{int(now)}"
                    s3_key  = f"rtsp/keyframes/{self.info.stream_id}/{ts_str}_{frame_n:06d}.jpg"
                    storage.upload_bytes(jpeg_bytes, s3_key,
                                         {"stream_id": self.info.stream_id, "frame": str(frame_n)},
                                         "image/jpeg")
                    self.info.frames_uploaded += 1
                except Exception as e:
                    logger.debug(f"[{self.info.stream_id}] Upload skipped: {e}")

            # Periodically save the FAISS index
            if indexed_since_save >= SAVE_INDEX_EVERY:
                try:
                    vector_index.save()
                    indexed_since_save = 0
                except Exception:
                    pass

        cap.release()
        self.info.status = "stopped"
        logger.info(f"[{self.info.stream_id}] Worker stopped")

    def _make_storage(self):
        """Try to create an S3 handler; return None if not configured."""
        try:
            from app.services.s3_handler import S3Handler
            from app.core.config import storage_config
            return S3Handler("ddn_infinia", storage_config.local_cache_config)
        except Exception:
            return None


# ── RTSPIngestor singleton ────────────────────────────────────────────────────
class RTSPIngestor:
    """Manages a pool of StreamWorker threads."""

    def __init__(self):
        self._lock    = threading.Lock()
        self._streams: dict[str, StreamInfo]    = {}
        self._workers: dict[str, StreamWorker]  = {}
        self._queues:  dict[str, Queue]         = {}

    # ── Public API ─────────────────────────────────────────────────────────────

    def add_stream(self, name: str, url: str, description: str = "",
                   tags: list | None = None, stream_id: str | None = None) -> StreamInfo:
        """Register and immediately start ingesting an RTSP stream."""
        sid  = stream_id or f"rtsp-{uuid.uuid4().hex[:8]}"
        info = StreamInfo(
            stream_id=sid, name=name, url=url,
            description=description, tags=tags or [],
        )
        q = Queue(maxsize=2)

        # Import here to avoid circular import at module load
        from app.core.config import storage_config
        worker = StreamWorker(info, storage_config, q)

        with self._lock:
            self._streams[sid] = info
            self._workers[sid] = worker
            self._queues[sid]  = q

        worker.start()
        logger.info(f"Started RTSP worker for stream {sid} ({url})")
        return info

    def remove_stream(self, stream_id: str) -> bool:
        """Stop and remove an RTSP stream."""
        with self._lock:
            worker = self._workers.pop(stream_id, None)
            self._streams.pop(stream_id, None)
            self._queues.pop(stream_id, None)

        if worker:
            worker.stop()
            worker.join(timeout=5)
            # Remove FAISS vectors for this stream
            try:
                from app.services.vector_index import get_vector_index
                get_vector_index().delete_by_asset(stream_id)
            except Exception:
                pass
            return True
        return False

    def list_streams(self) -> list[dict]:
        with self._lock:
            return [self._stream_dict(s) for s in self._streams.values()]

    def get_stream(self, stream_id: str) -> dict | None:
        with self._lock:
            s = self._streams.get(stream_id)
            return self._stream_dict(s) if s else None

    def get_frame_queue(self, stream_id: str) -> Queue | None:
        with self._lock:
            return self._queues.get(stream_id)

    def stop_all(self):
        with self._lock:
            sids = list(self._workers.keys())
        for sid in sids:
            self.remove_stream(sid)

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _stream_dict(s: StreamInfo) -> dict:
        return {
            "stream_id":       s.stream_id,
            "name":            s.name,
            "url":             s.url,
            "description":     s.description,
            "tags":            s.tags,
            "status":          s.status,
            "frames_captured": s.frames_captured,
            "frames_indexed":  s.frames_indexed,
            "frames_uploaded": s.frames_uploaded,
            "error_msg":       s.error_msg,
            "started_at":      s.started_at,
            "last_frame_at":   s.last_frame_at,
            "uptime_seconds":  round(time.time() - s.started_at, 1) if s.started_at else 0,
        }


# ── Singleton accessor ────────────────────────────────────────────────────────
_ingestor: RTSPIngestor | None = None
_ig_lock = threading.Lock()


def get_rtsp_ingestor() -> RTSPIngestor:
    global _ingestor
    if _ingestor is None:
        with _ig_lock:
            if _ingestor is None:
                _ingestor = RTSPIngestor()
    return _ingestor
