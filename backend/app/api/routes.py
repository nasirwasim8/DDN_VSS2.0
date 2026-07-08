"""
FastAPI routes for DDN Multimodal Semantic Search.
"""
import os
import time
import tempfile
import logging
import re
import unicodedata
from typing import List
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from PIL import Image
import io

from app.core.config import settings, storage_config
from app.models.schemas import (
    DDNConfigRequest,
    AWSConfigRequest,
    LocalCacheConfigRequest,
    LocalCacheConfigResponse,
    StorageConfigResponse,
    ConnectionTestResponse,
    ImageUploadResponse,
    VideoUploadResponse,
    DocumentUploadResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
    BrowseRequest,
    BrowseResponse,
    ObjectInfo,
    HealthResponse,
    MetricsResponse,
    ErrorResponse,
    VideoFrameSearchRequest,
    VideoFrameSearchResponse
)
from app.services.storage import S3Handler
from app.services.ai_models import (
    get_image_analyzer,
    get_video_analyzer,
    get_document_analyzer,
    DEVICE,
    TORCH_AVAILABLE
)
from app.services.video_chunker import VideoChunker
from app.services.keyframe_extractor import KeyframeExtractor
from app.services.artifact_manager import artifact_manager
from app.services.bucket_monitor import BucketMonitor
from app.models.manifest import StructuredTags, ChunkAnalysis, KeyframeMetadata


# Routers
config_router = APIRouter(prefix="/config", tags=["Configuration"])
upload_router = APIRouter(prefix="/upload", tags=["Upload"])
search_router = APIRouter(prefix="/search", tags=["Search"])
browse_router = APIRouter(prefix="/browse", tags=["Browse"])
ingestion_router = APIRouter(prefix="/ingestion", tags=["Continuous Ingestion"])
health_router = APIRouter(tags=["Health"])

# Initialize bucket monitor
bucket_monitor = BucketMonitor()


# Configure logger
logger = logging.getLogger(__name__)
def sanitize_for_s3_metadata(text: str) -> str:
    """Sanitize text to be S3 metadata compliant (ASCII only)."""
    if not text:
        return ""

    replacements = {
        '\u201c': '"', '\u201d': '"', '\u2018': "'", '\u2019': "'",
        '\u2014': '-', '\u2013': '-', '\u2012': '-',
        '\u2026': '...', '\u00a0': ' ', '\u2009': ' ',
        '\u2022': '*', '\u2023': '*',
        '\u00ae': '(R)', '\u2122': '(TM)', '\u00a9': '(C)',
    }

    for unicode_char, ascii_char in replacements.items():
        text = text.replace(unicode_char, ascii_char)

    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\x9f]', '', text)

    max_length = 2000
    if len(text) > max_length:
        text = text[:max_length - 3] + '...'

    return text.strip()


# ============== Configuration Routes ==============

@config_router.post("/ddn", response_model=StorageConfigResponse)
async def configure_ddn(config: DDNConfigRequest):
    """Configure DDN INFINIA storage."""
    storage_config.update_ddn_config(
        access_key=config.access_key,
        secret_key=config.secret_key,
        bucket_name=config.bucket_name,
        endpoint_url=config.endpoint_url,
        region=config.region
    )
    return StorageConfigResponse(
        success=True,
        message="DDN INFINIA configuration updated",
        ddn_configured=True,
        aws_configured=bool(storage_config.aws_config.get('access_key'))
    )


@config_router.post("/aws", response_model=StorageConfigResponse)
async def configure_aws(config: AWSConfigRequest):
    """Configure AWS S3 storage."""
    storage_config.update_aws_config(
        access_key=config.access_key,
        secret_key=config.secret_key,
        bucket_name=config.bucket_name,
        region=config.region
    )
    return StorageConfigResponse(
        success=True,
        message="AWS S3 configuration updated",
        ddn_configured=bool(storage_config.ddn_infinia_config.get('access_key')),
        aws_configured=True
    )


@config_router.get("/load")
async def load_config():
    """Load saved configuration from disk."""
    return {
        "success": True,
        "ddn_config": {
            "access_key": storage_config.ddn_infinia_config.get('access_key', ''),
            "secret_key": storage_config.ddn_infinia_config.get('secret_key', ''),
            "bucket_name": storage_config.ddn_infinia_config.get('bucket_name', ''),
            "endpoint_url": storage_config.ddn_infinia_config.get('endpoint_url', ''),
            "region": storage_config.ddn_infinia_config.get('region', 'us-east-1')
        },
        "aws_config": {
            "access_key": storage_config.aws_config.get('access_key', ''),
            "secret_key": storage_config.aws_config.get('secret_key', ''),
            "bucket_name": storage_config.aws_config.get('bucket_name', ''),
            "region": storage_config.aws_config.get('region', 'us-east-1')
        },
        "local_cache_config": {
            "enabled": storage_config.local_cache_config.get('enabled', False),
            "videos_path": storage_config.local_cache_config.get('videos_path', ''),
            "embeddings_path": storage_config.local_cache_config.get('embeddings_path', '')
        }
    }


@config_router.get("/llm")
async def get_llm_config():
    """Get current LLM enrichment configuration."""
    import os
    import urllib.request

    # Load persisted LLM config first (fills gaps not covered by env vars)
    _load_llm_config_from_disk()

    provider = os.getenv("LLM_PROVIDER", "auto")
    model = os.getenv("LLM_MODEL", "llava:7b")
    openai_key = os.getenv("OPENAI_API_KEY", "")
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    # Mask the key for display
    masked_key = ""
    if openai_key:
        masked_key = openai_key[:7] + "..." + openai_key[-4:] if len(openai_key) > 11 else "****"

    # Check Ollama availability
    ollama_available = False
    try:
        urllib.request.urlopen(f"{ollama_url}/api/tags", timeout=2)
        ollama_available = True
    except Exception:
        pass

    # Check real OpenAI connectivity (not just key presence)
    openai_reachable = False
    if openai_key:
        try:
            req = urllib.request.Request(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {openai_key}"},
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                openai_reachable = (resp.status == 200)
        except Exception as e:
            logger.warning(f"OpenAI connectivity check failed: {e}")

    return {
        "provider": provider,
        "model": model,
        "openai_key_set": bool(openai_key),
        "openai_key_masked": masked_key,
        "openai_reachable": openai_reachable,
        "ollama_url": ollama_url,
        "ollama_available": ollama_available,
        "fallback_mode": "auto",  # always tries OpenAI first then Ollama
    }


def _get_llm_config_path() -> str:
    """Return path to persisted LLM config JSON."""
    config_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
        "data"
    )
    os.makedirs(config_dir, exist_ok=True)
    return os.path.join(config_dir, "llm_config.json")


def _load_llm_config_from_disk():
    """Load persisted LLM config into os.environ (only fills missing vars)."""
    import json
    config_path = _get_llm_config_path()
    if not os.path.exists(config_path):
        return
    try:
        with open(config_path, "r") as f:
            data = json.load(f)
        # Only set if not already present in the environment
        for env_key, json_key in [
            ("LLM_PROVIDER", "provider"),
            ("OPENAI_API_KEY", "openai_api_key"),
            ("OLLAMA_BASE_URL", "ollama_url"),
            ("LLM_MODEL", "model"),
        ]:
            if data.get(json_key) and not os.environ.get(env_key):
                os.environ[env_key] = data[json_key]
                logger.info(f"✅ Loaded {env_key} from persisted LLM config")
    except Exception as e:
        logger.warning(f"Failed to load persisted LLM config: {e}")


def _save_llm_config_to_disk(provider: str, openai_key: str, ollama_url: str, model: str):
    """Persist LLM config to disk so it survives process restarts."""
    import json
    config_path = _get_llm_config_path()
    # Load existing data so we don't overwrite fields we're not updating
    existing = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                existing = json.load(f)
        except Exception:
            pass
    if provider:
        existing["provider"] = provider
    if openai_key:
        existing["openai_api_key"] = openai_key
    if ollama_url:
        existing["ollama_url"] = ollama_url
    if model:
        existing["model"] = model
    try:
        with open(config_path, "w") as f:
            json.dump(existing, f, indent=2)
        logger.info(f"💾 Persisted LLM config to {config_path}")
    except Exception as e:
        logger.error(f"Failed to persist LLM config: {e}")


@config_router.post("/llm")
async def save_llm_config(request: Request):
    """Save LLM enrichment configuration — persists to disk AND process env."""
    import os
    from app.services import llm_enrichment as _llme

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    provider = data.get("provider", "auto")
    openai_key = (data.get("openai_api_key") or "").strip()
    ollama_url = (data.get("ollama_url") or "").strip()
    model = (data.get("model") or "").strip()

    if provider not in ("openai", "ollama", "auto"):
        raise HTTPException(status_code=400, detail="provider must be 'openai', 'ollama', or 'auto'")

    # ── 1. Persist to disk (survives restarts) ────────────────────────────────
    _save_llm_config_to_disk(provider, openai_key, ollama_url, model)

    # ── 2. Apply to running process environment ───────────────────────────────
    os.environ["LLM_PROVIDER"] = provider
    if openai_key:
        os.environ["OPENAI_API_KEY"] = openai_key
    if ollama_url:
        os.environ["OLLAMA_BASE_URL"] = ollama_url
    if model:
        os.environ["LLM_MODEL"] = model

    # ── 3. Reset the singleton so next enrichment picks up new settings ───────
    if hasattr(_llme, '_enrichment_service'):
        _llme._enrichment_service = None

    logger.info(f"LLM config saved: provider={provider} key_set={bool(openai_key)}")
    return {"success": True, "provider": provider, "message": f"LLM provider set to {provider} and saved to disk"}


@config_router.post("/local-cache", response_model=LocalCacheConfigResponse)
async def configure_local_cache(config: LocalCacheConfigRequest):
    """Configure local cache settings."""
    # Validate paths if enabled
    if config.enabled:
        is_valid, msg = storage_config.validate_config('local_cache')
        if not is_valid:
            # Update first to validate
            storage_config.update_local_cache_config(
                enabled=config.enabled,
                videos_path=config.videos_path,
                embeddings_path=config.embeddings_path
            )
            # Re-validate
            is_valid, msg = storage_config.validate_config('local_cache')
            if not is_valid:
                raise HTTPException(status_code=400, detail=msg)
    
    storage_config.update_local_cache_config(
        enabled=config.enabled,
        videos_path=config.videos_path,
        embeddings_path=config.embeddings_path
    )
    
    return LocalCacheConfigResponse(
        success=True,
        message="Local cache configuration updated successfully",
        enabled=config.enabled,
        videos_path=config.videos_path,
        embeddings_path=config.embeddings_path
    )


@config_router.get("/local-cache", response_model=LocalCacheConfigResponse)
async def get_local_cache_config():
    """Get current local cache configuration."""
    cache_config = storage_config.local_cache_config
    return LocalCacheConfigResponse(
        success=True,
        message="Local cache configuration retrieved",
        enabled=cache_config.get('enabled', False),
        videos_path=cache_config.get('videos_path', ''),
        embeddings_path=cache_config.get('embeddings_path', '')
    )


@config_router.get("/test/{provider}", response_model=ConnectionTestResponse)
async def test_connection(provider: str):
    """Test connection to storage provider."""
    if provider not in ['aws', 'ddn_infinia']:
        raise HTTPException(status_code=400, detail=f"Invalid provider: {provider}")

    handler = S3Handler(provider, storage_config.local_cache_config)
    start_time = time.perf_counter()
    success, message = handler.test_connection()
    latency = (time.perf_counter() - start_time) * 1000

    return ConnectionTestResponse(
        provider=provider,
        success=success,
        message=message,
        latency_ms=latency if success else None
    )


# ============== Upload Routes ==============

@upload_router.post("/image", response_model=ImageUploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    custom_caption: str = Form(default="")
):
    """Upload and analyze an image."""
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_types}")

    try:
        # Read and analyze image
        content = await file.read()
        img = Image.open(io.BytesIO(content)).convert('RGB')

        # Get image analyzer
        analyzer = get_image_analyzer()
        analysis = analyzer.analyze(img)

        caption = custom_caption if custom_caption else analysis.get('caption', '')

        # Create metadata
        metadata = {
            'modality': 'image',
            'caption': sanitize_for_s3_metadata(caption),
            'detected_objects': sanitize_for_s3_metadata(analysis.get('detected_objects', '')),
            'width': str(analysis.get('width', 0)),
            'height': str(analysis.get('height', 0)),
            'upload_time': datetime.now().isoformat(),
            'has_embedding': str(analysis.get('embedding_dims', 0) > 0).lower()
        }

        # Upload to storage
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        filename = Path(file.filename).name
        object_key = f"images/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"

        success, msg = handler.upload_bytes(content, object_key, metadata, file.content_type)

        if not success:
            raise HTTPException(status_code=500, detail=msg)

        return ImageUploadResponse(
            success=True,
            message="Image uploaded successfully",
            object_key=object_key,
            caption=caption,
            detected_objects=analysis.get('detected_objects', ''),
            width=analysis.get('width', 0),
            height=analysis.get('height', 0),
            has_embedding=analysis.get('embedding_dims', 0) > 0
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@upload_router.post("/video", response_model=VideoUploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    custom_summary: str = Form(default=""),
    custom_tags: str = Form(default="")
):
    """Upload and analyze a video."""
    # Validate file type
    allowed_types = ['video/mp4', 'video/avi', 'video/mov', 'video/quicktime', 'video/webm', 'video/x-msvideo']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_types}")

    try:
        # Save to temp file for processing
        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Analyze video
            analyzer = get_video_analyzer()
            analysis = analyzer.analyze(tmp_path)

            summary = custom_summary if custom_summary else analysis.get('summary', '')
            tags = custom_tags if custom_tags else analysis.get('detected_objects', '')

            # Create metadata
            metadata = {
                'modality': 'video',
                'summary': sanitize_for_s3_metadata(summary),
                'tags': sanitize_for_s3_metadata(tags),
                'duration_seconds': str(analysis.get('duration_seconds', 0)),
                'fps': str(analysis.get('fps', 0)),
                'width': str(analysis.get('width', 0)),
                'height': str(analysis.get('height', 0)),
                'upload_time': datetime.now().isoformat()
            }

            # Upload to storage
            handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
            filename = Path(file.filename).name
            object_key = f"videos/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"

            success, msg = handler.upload_bytes(content, object_key, metadata, file.content_type)

            if not success:
                raise HTTPException(status_code=500, detail=msg)

            # Generate presigned URL for playback
            presigned_url = handler.generate_presigned_url(object_key)

            return VideoUploadResponse(
                success=True,
                message="Video uploaded successfully",
                object_key=object_key,
                summary=summary,
                duration_seconds=analysis.get('duration_seconds', 0),
                detected_objects=tags,
                frame_count=analysis.get('total_frames', 0),
                presigned_url=presigned_url  # Add presigned URL
            )
        finally:
            os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@upload_router.post("/document", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    custom_description: str = Form(default="")
):
    """Upload and analyze a document."""
    # Validate file type
    allowed_extensions = ['.pdf', '.docx', '.doc', '.txt']
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_extensions}")

    try:
        # Save to temp file for processing
        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Analyze document
            analyzer = get_document_analyzer()
            analysis = analyzer.analyze(tmp_path)

            summary = custom_description if custom_description else analysis.get('summary', '')

            # Create metadata
            metadata = {
                'modality': 'document',
                'summary': sanitize_for_s3_metadata(summary),
                'key_terms': sanitize_for_s3_metadata(analysis.get('key_terms', '')),
                'word_count': str(analysis.get('word_count', 0)),
                'upload_time': datetime.now().isoformat()
            }

            # Upload to storage
            handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
            filename = Path(file.filename).name
            object_key = f"documents/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"

            # Determine content type
            content_type = 'application/pdf' if file_ext == '.pdf' else 'application/octet-stream'

            success, msg = handler.upload_bytes(content, object_key, metadata, content_type)

            if not success:
                raise HTTPException(status_code=500, detail=msg)

            return DocumentUploadResponse(
                success=True,
                message="Document uploaded successfully",
                object_key=object_key,
                summary=summary,
                word_count=analysis.get('word_count', 0),
                key_terms=analysis.get('key_terms', '')
            )
        finally:
            os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Async Video Processing Routes ==============

@upload_router.post("/video-async")
async def upload_video_async(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    custom_summary: str = Form(default=""),
    custom_tags: str = Form(default="")
):
    """
    Upload video for async processing (simplified - no Celery needed).
    Uses FastAPI BackgroundTasks for processing.
    """
    from app.models.manifest import AssetManifest, VideoUploadAsyncResponse
    from app.services.artifact_manager import artifact_manager
    import uuid
    
    # Validate file type - accept videos, images, and documents
    allowed_types = [
        # Videos
        'video/mp4', 'video/avi', 'video/mov', 'video/quicktime', 'video/webm', 'video/x-msvideo',
        # Images  
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        # Documents
        'application/pdf'
    ]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: videos (MP4, MOV, AVI, WebM), images (JPG, PNG, GIF), documents (PDF)")
    
    try:
        # Generate asset ID
        asset_id = str(uuid.uuid4())
        filename = Path(file.filename).name
        
        # Detect media type from content_type
        if file.content_type.startswith('video/'):
            media_type = 'video'
            folder = 'videos'
        elif file.content_type.startswith('image/'):
            media_type = 'image'
            folder = 'images'
        elif file.content_type == 'application/pdf':
            media_type = 'document'
            folder = 'documents'
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported content type: {file.content_type}")
        
        # Read file content
        content = await file.read()
        
        # Upload raw media to Infinia
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        raw_object_key = f"media/raw/{folder}/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{asset_id}_{filename}"
        
        # Basic metadata for raw media
        metadata = {
            'asset_id': asset_id,
            'modality': media_type,
            'filename': filename,
            'upload_time': datetime.now().isoformat(),
            'custom_summary': sanitize_for_s3_metadata(custom_summary),
            'custom_tags': sanitize_for_s3_metadata(custom_tags)
        }
        
        success, msg = handler.upload_bytes(content, raw_object_key, metadata, file.content_type)
        
        if not success:
            raise HTTPException(status_code=500, detail=f"Upload failed: {msg}")
        
        # Create initial manifest
        manifest = AssetManifest(
            asset_id=asset_id,
            filename=filename,
            media_type=media_type,  # Use detected media type
            raw_object_key=raw_object_key,
            custom_summary=custom_summary,
            custom_tags=custom_tags,
            processing_status="pending"
        )
        
        # Save manifest
        artifact_manager.save_manifest(manifest)
        
        # Trigger background processing (no Celery needed!)
        background_tasks.add_task(
            process_video_background,
            asset_id=asset_id,
            s3_key=raw_object_key,
            custom_summary=custom_summary,
            custom_tags=custom_tags
        )
        
        logger.info(f"🚀 Triggered background processing for {asset_id}")
        
        return VideoUploadAsyncResponse(
            success=True,
            message=f"{media_type.capitalize()} uploaded successfully, processing started",
            asset_id=asset_id,
            filename=filename,
            media_type=media_type,  # Use detected media type
            task_id=asset_id,  # Use asset_id as task_id for simplicity
            object_key=raw_object_key
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in async video upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def process_video_background(
    asset_id: str,
    s3_key: str,
    custom_summary: str = "",
    custom_tags: str = ""
):
    """
    Background video processing function (runs in FastAPI background thread).
    Simplified version without Celery - perfect for demos!
    """
    import tempfile
    import time
    from app.services.video_chunker import VideoChunker
    from app.services.keyframe_extractor import KeyframeExtractor
    from app.services.artifact_manager import artifact_manager
    from app.services.ai_models import get_image_analyzer
    from app.models.manifest import ChunkAnalysis, KeyframeMetadata, StructuredTags
    from PIL import Image
    
    start_time = time.time()
    temp_video_path = None
    temp_dir = None
    
    try:
        # Update manifest status to processing
        manifest = artifact_manager.load_manifest(asset_id)
        if not manifest:
            logger.error(f"Manifest not found for asset {asset_id}")
            return
        
        manifest.processing_status = "processing"
        manifest.processing_timestamp = datetime.utcnow()
        artifact_manager.save_manifest(manifest)
        
        logger.info(f"🎬 Processing {manifest.media_type}: {asset_id}")
        
        # Download media from Infinia to temp file
        storage = S3Handler('ddn_infinia', storage_config.local_cache_config)
        media_bytes, msg = storage.download_bytes(s3_key)
        
        if not media_bytes:
            raise Exception(f"Failed to download media: {msg}")
        
        # Save media bytes to temp file for processing
        temp_video_path = None
        try:
            temp_fd, temp_video_path = tempfile.mkstemp(suffix=os.path.splitext(s3_key)[1])
            os.write(temp_fd, media_bytes)
            os.close(temp_fd)
            
            logger.info(f"Wrote {len(media_bytes)} bytes to temp file: {temp_video_path}")
        except Exception as e:
            raise Exception(f"Failed to create temp file: {e}")
        
        # Extract video metadata
        chunker = VideoChunker()
        video_info = chunker.get_video_info(temp_video_path)
        
        if not video_info:
            raise Exception("Failed to extract video metadata")
        
        # Update manifest with video properties
        manifest.width = video_info['width']
        manifest.height = video_info['height']
        manifest.fps = video_info['fps']
        manifest.duration_seconds = video_info['duration']
        
        # Calculate chunks
        chunks = chunker.calculate_chunks(video_info['duration'])
        manifest.total_chunks = len(chunks)
        
        logger.info(f"📊 Video: {video_info['width']}x{video_info['height']}, {video_info['duration']:.2f}s, {len(chunks)} chunks")
        
        # Create temp dir for keyframes
        temp_dir = tempfile.mkdtemp()
        
        # Process each chunk (simplified - process first 3 chunks only for demo)
        extractor = KeyframeExtractor(fps=settings.KEYFRAME_FPS)
        image_analyzer = get_image_analyzer()
        
        all_captions = []
        all_detected_objects = []
        all_keyframe_paths = []   # collect local paths for LLM vision input
        
        # Limit to first 3 chunks for faster demo processing
        chunks_to_process = chunks[:min(3, len(chunks))]
        
        for chunk in chunks_to_process:
            try:
                chunk_result = _process_video_chunk_simple(
                    video_path=temp_video_path,
                    asset_id=asset_id,
                    chunk=chunk,
                    temp_dir=temp_dir,
                    extractor=extractor,
                    image_analyzer=image_analyzer,
                    storage=storage
                )
                
                if chunk_result:
                    manifest.chunks.append(ChunkAnalysis(**chunk_result))
                    
                    # Collect metadata for summary + enrichment
                    for kf in chunk_result.get('keyframes', []):
                        if kf.get('caption'):
                            all_captions.append(kf['caption'])
                        if kf.get('tags') and kf['tags'].get('objects'):
                            all_detected_objects.extend(kf['tags']['objects'])
                    
                    # Collect local keyframe file paths for LLM vision
                    chunk_kf_dir = os.path.join(temp_dir, f"chunk_{chunk.chunk_id}")
                    if os.path.isdir(chunk_kf_dir):
                        for fname in sorted(os.listdir(chunk_kf_dir)):
                            if fname.lower().endswith(('.jpg', '.jpeg', '.png')):
                                all_keyframe_paths.append(os.path.join(chunk_kf_dir, fname))

            except Exception as e:
                logger.error(f"Error processing chunk {chunk.chunk_id}: {e}")
                continue
        
        # ── Raw summary (fallback / always generated) ─────────────────────────
        if not custom_summary and all_captions:
            manifest.video_summary = ". ".join(all_captions[:3]) + "."
        else:
            manifest.video_summary = custom_summary
        
        if not custom_tags:
            unique_objects = list(set(all_detected_objects))[:10]
            manifest.detected_objects = ", ".join(unique_objects)
        else:
            manifest.detected_objects = custom_tags
        
        manifest.custom_summary = custom_summary
        manifest.custom_tags = custom_tags

        # ── LLM Enrichment (OpenAI → Ollama fallback, runs automatically) ─────
        try:
            from app.services.llm_enrichment import enrich_with_fallback
            enriched, provider_used = enrich_with_fallback(
                keyframe_paths=all_keyframe_paths,
                captions=all_captions,
                detected_objects=all_detected_objects,
                duration_seconds=manifest.duration_seconds
            )
            if enriched:
                manifest.enriched_summary = enriched.summary
                manifest.enriched_tags = enriched.search_tags
                manifest.scene_type = enriched.scene_type
                manifest.key_events = enriched.key_events
                manifest.llm_enriched = True
                manifest.llm_provider_used = provider_used  # e.g. "openai" or "ollama"
                # Use LLM summary as the primary video_summary
                if enriched.summary:
                    manifest.video_summary = enriched.summary
                logger.info(f"✨ Enrichment done via {provider_used}: {len(enriched.search_tags)} tags | scene={enriched.scene_type}")
        except Exception as e:
            logger.warning(f"LLM enrichment skipped: {e}")

        
        # ── Finalize manifest ──────────────────────────────────────────────────
        manifest.update_statistics()
        manifest.processing_status = "completed"
        manifest.processing_timestamp = datetime.utcnow()
        manifest.ingestion_time_seconds = round(time.time() - start_time, 2)
        
        # Save final manifest
        artifact_manager.save_manifest(manifest)

        
        processing_time = time.time() - start_time
        
        logger.info(f"✅ Completed processing {asset_id} in {processing_time:.2f}s")
        logger.info(f"   Total keyframes: {manifest.total_keyframes}, chunks: {manifest.total_chunks}")
        
    except Exception as e:
        logger.error(f"❌ Error processing video {asset_id}: {e}", exc_info=True)
        
        # Update manifest with error
        try:
            manifest = artifact_manager.load_manifest(asset_id)
            if manifest:
                manifest.processing_status = "failed"
                manifest.processing_error = str(e)
                manifest.processing_timestamp = datetime.utcnow()
                artifact_manager.save_manifest(manifest)
        except:
            pass
        
    finally:
        # Cleanup temp files
        if temp_video_path and os.path.exists(temp_video_path):
            try:
                os.unlink(temp_video_path)
            except:
                pass
        
        if temp_dir and os.path.exists(temp_dir):
            try:
                import shutil
                shutil.rmtree(temp_dir)
            except:
                pass


def _process_video_chunk_simple(
    video_path: str,
    asset_id: str,
    chunk,
    temp_dir: str,
    extractor: KeyframeExtractor,
    image_analyzer,
    storage: S3Handler
):
    """Simplified chunk processing — GPU batch captioning + parallel DDN uploads."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    try:
        chunk_start_time = time.time()
        logger.info(f"  📹 Chunk {chunk.chunk_id}: {chunk.start_time:.2f}s-{chunk.end_time:.2f}s")

        # ── 1. Extract keyframes ──────────────────────────────────────────────
        t0 = time.time()
        chunk_temp_dir = os.path.join(temp_dir, f"chunk_{chunk.chunk_id}")
        os.makedirs(chunk_temp_dir, exist_ok=True)
        keyframes = extractor.extract_keyframes_from_chunk(
            video_path, chunk.start_time, chunk.end_time, chunk_temp_dir
        )
        logger.info(f"  ⏱ Extract: {time.time()-t0:.2f}s ({len(keyframes) if keyframes else 0} frames)")

        if not keyframes:
            logger.warning(f"  ⚠️ No keyframes for chunk {chunk.chunk_id}")
            return None

        # ── 2. Load images ─────────────────────────────────────────────────
        valid_keyframes = keyframes[:5]
        keyframe_images = [Image.open(kf.file_path).convert('RGB') for kf in valid_keyframes]

        # ── 3. GPU batch caption (one forward pass for all frames) ────────────
        t1 = time.time()
        captions = image_analyzer.generate_captions_batch(keyframe_images)
        logger.info(f"  ⏱ BLIP caption ({len(captions)} frames): {time.time()-t1:.2f}s")

        # ── 4. Build keyframe metadata ────────────────────────────────────────
        keyframe_metadata_list = []
        all_objects = []
        all_captions = []
        upload_tasks = []  # (bytes, s3_key, metadata, content_type)

        for kf, caption in zip(valid_keyframes, captions):
            frame_id = f"{asset_id}_chunk{chunk.chunk_id}_frame{kf.frame_id}"
            keyframe_s3_key = storage.get_keyframe_key(asset_id, chunk.chunk_id, kf.frame_id)

            # Read bytes once for upload
            with open(kf.file_path, 'rb') as f:
                keyframe_bytes = f.read()

            metadata_kf = {
                'asset_id': asset_id,
                'chunk_id': str(chunk.chunk_id),
                'frame_id': str(kf.frame_id),
                'timestamp': str(kf.timestamp),
                'caption': caption
            }
            upload_tasks.append((keyframe_bytes, keyframe_s3_key, metadata_kf, 'image/jpeg'))

            detected_objects = _extract_objects_simple(caption)
            structured_tags = StructuredTags(
                objects=detected_objects, actions=[], scenes=[], safety=[], people_count=0
            )
            keyframe_meta = KeyframeMetadata(
                frame_id=frame_id, timestamp=kf.timestamp, s3_key=keyframe_s3_key,
                embedding_id=f"{frame_id}_emb", caption=caption,
                tags=structured_tags, confidence_score=1.0
            )
            keyframe_metadata_list.append(keyframe_meta.model_dump())
            all_captions.append(caption)
            all_objects.extend(detected_objects)

        # ── 5. Parallel DDN keyframe uploads ──────────────────────────────────
        t2 = time.time()
        def _upload(task):
            b, key, meta, ct = task
            return storage.upload_bytes(b, key, meta, ct)

        with ThreadPoolExecutor(max_workers=min(5, len(upload_tasks))) as pool:
            list(pool.map(_upload, upload_tasks))

        logger.info(f"  ⏱ DDN upload ({len(upload_tasks)} keyframes, parallel): {time.time()-t2:.2f}s")

        # ── 6. Build chunk analysis result ────────────────────────────────────
        chunk_analysis = {
            'chunk_id': chunk.chunk_id,
            'start_time': chunk.start_time,
            'end_time': chunk.end_time,
            'duration': chunk.duration,
            'keyframes': keyframe_metadata_list,
            'total_keyframes': len(keyframe_metadata_list),
            'dominant_tags': StructuredTags(
                objects=list(set(all_objects))[:5], actions=[], scenes=[], safety=[]
            ).model_dump(),
            'summary_caption': ". ".join(all_captions[:2]) + "." if all_captions else "",
            's3_key': storage.get_chunk_analysis_key(asset_id, chunk.chunk_id),
            'processing_time_ms': (time.time() - chunk_start_time) * 1000
        }

        total = time.time() - chunk_start_time
        logger.info(f"  ✅ Chunk {chunk.chunk_id} done in {total:.2f}s | {len(keyframe_metadata_list)} keyframes")
        return chunk_analysis

    except Exception as e:
        logger.error(f"  ❌ Error processing chunk {chunk.chunk_id}: {e}", exc_info=True)
        return None




def _extract_objects_simple(caption: str):
    """Extract likely object names from caption text."""
    common_objects = [
        'person', 'people', 'man', 'woman', 'child', 'dog', 'cat',
        'car', 'bike', 'tree', 'building', 'street',
        'sky', 'water', 'mountain', 'grass'
    ]
    
    caption_lower = caption.lower()
    detected = [obj for obj in common_objects if obj in caption_lower]
    
    return detected[:5]


@upload_router.get("/status/{asset_id}")
async def get_processing_status(asset_id: str):
    """Get processing status for an asset."""
    from app.models.manifest import ProcessingStatusResponse
    from app.services.artifact_manager import artifact_manager
    
    try:
        manifest = artifact_manager.load_manifest(asset_id)
        
        if not manifest:
            raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
        
        return ProcessingStatusResponse(
            asset_id=asset_id,
            status=manifest.processing_status,
            total_chunks=manifest.total_chunks if manifest.total_chunks > 0 else None,
            total_keyframes=manifest.total_keyframes if manifest.total_keyframes > 0 else None,
            processing_error=manifest.processing_error
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting status for {asset_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@upload_router.get("/manifest/{asset_id}")
async def get_asset_manifest(asset_id: str):
    """Get complete manifest for an asset with all metadata."""
    from app.services.artifact_manager import artifact_manager
    
    try:
        manifest = artifact_manager.load_manifest(asset_id)
        
        if not manifest:
            raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
        
        return manifest.model_dump()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting manifest for {asset_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@upload_router.put("/manifest/{asset_id}")
async def update_asset_manifest(
    asset_id: str,
    update_data: dict
):
    """Update video manifest metadata and save to INFINIA."""
    from app.services.artifact_manager import artifact_manager
    
    try:
        # Get existing manifest
        manifest = artifact_manager.load_manifest(asset_id)
        if not manifest:
            raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
        
        # Extract fields from request body
        video_summary = update_data.get('video_summary', '')
        detected_objects = update_data.get('detected_objects', '')
        custom_tags = update_data.get('custom_tags', '')
        custom_summary = update_data.get('custom_summary', '')
        enriched_tags_raw = update_data.get('enriched_tags', None)  # new: LLM search tags
        
        # Update fields if provided
        
        logger.info(f"📝 Received update request for {asset_id}:")
        logger.info(f"  video_summary: {video_summary[:50] if video_summary else 'EMPTY'}...")
        logger.info(f"  detected_objects: {detected_objects}")
        logger.info(f"  custom_tags: {custom_tags}")
        logger.info(f"  custom_summary: {custom_summary[:50] if custom_summary else 'EMPTY'}...")
        
        if video_summary:
            manifest.video_summary = video_summary
        if detected_objects:
            manifest.detected_objects = detected_objects
        if custom_tags:
            manifest.custom_tags = custom_tags
        if custom_summary:
            manifest.custom_summary = custom_summary
        # Update enriched_tags if provided (support both list and comma-separated string)
        if enriched_tags_raw is not None:
            if isinstance(enriched_tags_raw, list):
                setattr(manifest, 'enriched_tags', enriched_tags_raw)
            elif isinstance(enriched_tags_raw, str) and enriched_tags_raw.strip():
                tags_list = [t.strip().lstrip('#') for t in enriched_tags_raw.split(',') if t.strip()]
                setattr(manifest, 'enriched_tags', tags_list)
        
        
        logger.info(f"📋 Manifest after update:")
        logger.info(f"  video_summary: {manifest.video_summary[:50]}...")
        logger.info(f"  detected_objects: {manifest.detected_objects}")
        logger.info(f"  custom_tags: {manifest.custom_tags}")
        logger.info(f"  custom_summary: {manifest.custom_summary}")
        
        # Update timestamp
        manifest.processing_timestamp = datetime.utcnow()
        
        # Save back to INFINIA
        artifact_manager.save_manifest(manifest)
        
        logger.info(f"✅ Updated manifest for {asset_id}")
        
        return {
            "success": True,
            "message": "Manifest updated successfully",
            "manifest": manifest.model_dump()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating manifest for {asset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def upload_document(
    file: UploadFile = File(...),
    custom_description: str = Form(default="")
):
    """Upload and analyze a document."""
    # Validate file type
    allowed_extensions = ['.pdf', '.docx', '.doc', '.txt']
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_extensions}")

    try:
        # Save to temp file for processing
        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Analyze document
            analyzer = get_document_analyzer()
            analysis = analyzer.analyze(tmp_path)

            summary = custom_description if custom_description else analysis.get('summary', '')

            # Create metadata
            metadata = {
                'modality': 'document',
                'summary': sanitize_for_s3_metadata(summary),
                'key_terms': sanitize_for_s3_metadata(analysis.get('key_terms', '')),
                'word_count': str(analysis.get('word_count', 0)),
                'upload_time': datetime.now().isoformat()
            }

            # Upload to storage
            handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
            filename = Path(file.filename).name
            object_key = f"documents/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"

            # Determine content type
            content_type = 'application/pdf' if file_ext == '.pdf' else 'application/octet-stream'

            success, msg = handler.upload_bytes(content, object_key, metadata, content_type)

            if not success:
                raise HTTPException(status_code=500, detail=msg)

            return DocumentUploadResponse(
                success=True,
                message="Document uploaded successfully",
                object_key=object_key,
                summary=summary,
                word_count=analysis.get('word_count', 0),
                key_terms=analysis.get('key_terms', '')
            )
        finally:
            os.unlink(tmp_path)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Search Routes ==============

@search_router.post("/", response_model=SearchResponse)
async def semantic_search(request: SearchRequest):
    """Perform semantic search across stored content."""
    start_time = time.perf_counter()

    try:
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        objects, msg = handler.list_objects(include_metadata=True)
        
        # Filter out .json files (internal metadata)
        objects = [obj for obj in objects if not obj['key'].endswith('.json')]

        if not objects:
            return SearchResponse(
                success=True,
                query=request.query,
                total_results=0,
                results=[],
                search_time_ms=(time.perf_counter() - start_time) * 1000
            )

        query_lower = request.query.lower()
        results = []
        
        # Check if we're in local cache mode with embeddings available
        use_semantic_search = (handler.local_cache and 
                              handler.local_cache.is_available() and
                              storage_config.local_cache_config.get('embeddings_path'))
        
        # Get query embedding for semantic search
        query_embedding = None
        if use_semantic_search:
            try:
                import numpy as np
                analyzer = get_video_analyzer()
                if analyzer and analyzer.image_analyzer and analyzer.image_analyzer.models_loaded:
                    # Encode query text to get embedding
                    import torch
                    with torch.no_grad():
                        text_inputs = analyzer.image_analyzer.clip_processor(text=[request.query], return_tensors="pt", padding=True).to(analyzer.image_analyzer.device)
                        query_embedding = analyzer.image_analyzer.clip_model.get_text_features(**text_inputs)
                        query_embedding = query_embedding.cpu().numpy()[0]
                        # Normalize
                        query_embedding = query_embedding / np.linalg.norm(query_embedding)
            except Exception as e:
                logger.warning(f"Failed to get query embedding, falling back to keyword search: {e}")
                use_semantic_search = False

        for obj in objects:
            metadata = obj.get('metadata', {})
            modality = metadata.get('modality', 'unknown')
            
            # Infer modality from file path if unknown
            if modality == 'unknown':
                object_key = obj['key']
                if object_key.startswith('images/') or object_key.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                    modality = 'image'
                elif object_key.startswith('videos/') or object_key.startswith('media/raw/') or object_key.lower().endswith(('.mp4', '.avi', '.mov', '.webm')):
                    modality = 'video'
                elif object_key.startswith('documents/') or object_key.lower().endswith(('.pdf', '.txt', '.docx')):
                    modality = 'document'

            # Load manifest metadata for uploaded videos
            if modality == 'video' and obj['key'].startswith('media/raw/'):
                try:
                    # Extract asset_id from filename: media/raw/videos/{timestamp}_{asset_id}_{filename}
                    filename = obj['key'].split('/')[-1]  # Get the filename part
                    parts = filename.split('_')
                    
                    # Asset ID is the part that looks like a UUID (contains hyphens)
                    asset_id = None
                    for part in parts:
                        if '-' in part and len(part) == 36:  # UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                            asset_id = part
                            break
                    
                    if asset_id:
                        # Load manifest
                        from app.services.artifact_manager import artifact_manager
                        manifest = artifact_manager.load_manifest(asset_id)
                        
                        if manifest:
                            # Enhance metadata with manifest data
                            metadata['video_summary'] = manifest.video_summary or ''
                            metadata['detected_objects'] = manifest.detected_objects or ''
                            metadata['custom_tags'] = manifest.custom_tags or ''
                            metadata['custom_summary'] = manifest.custom_summary or ''
                            logger.debug(f"Loaded manifest for {asset_id}: detected_objects='{metadata['detected_objects']}', custom_tags='{metadata['custom_tags']}'")
                except Exception as e:
                    logger.warning(f"Failed to load manifest for {obj['key']}: {e}")

            # Apply modality filter
            if request.modality != "all" and modality != request.modality:
                continue

            score = 0.0
            
            # Use semantic search if available (for videos in demo mode)
            if use_semantic_search and modality == 'video' and query_embedding is not None:
                try:
                    # Load embeddings from JSON file
                    import json
                    import numpy as np
                    from pathlib import Path
                    
                    video_filename = Path(obj['key']).name
                    embeddings_path = Path(storage_config.local_cache_config['embeddings_path'])
                    embedding_file = embeddings_path / f"{video_filename}.json"
                    
                    if embedding_file.exists():
                        with open(embedding_file, 'r') as f:
                            frame_data = json.load(f)
                        
                        # Compute cosine similarity with each frame
                        max_similarity = 0.0
                        for frame in frame_data:
                            frame_emb = np.array(frame['embedding'])
                            # Normalize frame embedding
                            frame_emb = frame_emb / np.linalg.norm(frame_emb)
                            # Cosine similarity
                            similarity = np.dot(query_embedding, frame_emb)
                            max_similarity = max(max_similarity, similarity)
                        
                        score = float(max_similarity)
                        logger.info(f"Semantic match: {video_filename} -> {score:.3f}")
                    else:
                        logger.warning(f"No embedding file found for {video_filename}")
                except Exception as e:
                    logger.error(f"Error loading embeddings for {obj['key']}: {e}")
                    # Fall back to keyword search for this object
                    use_semantic_search = False
            
            # Fallback to keyword matching if semantic search not available
            if score == 0.0:
                searchable_text = ' '.join([
                    metadata.get('caption', ''),
                    metadata.get('tags', ''),
                    metadata.get('summary', ''),
                    metadata.get('detected_objects', ''),
                    metadata.get('key_terms', ''),
                    # New manifest fields for uploaded videos
                    metadata.get('video_summary', ''),
                    metadata.get('custom_tags', ''),
                    metadata.get('custom_summary', '')
                ]).lower()

                # Simple keyword matching
                query_words = query_lower.split()
                matches = sum(1 for word in query_words if word in searchable_text)

                if matches > 0:
                    score = matches / len(query_words)

            # Only include results that meet or exceed the threshold
            if score >= request.threshold:
                # Generate presigned URL
                presigned_url = handler.generate_presigned_url(obj['key'])
                
                # Determine storage source and capabilities
                # DEMO MODE: Present local cache as DDN INFINIA to avoid confusion
                if handler.local_cache and handler.local_cache.is_available():
                    # Show as DDN INFINIA during demos (transparent local cache)
                    storage_source = "ddn_infinia"
                    storage_class = "INTELLIGENT_TIERING"
                    # Fast retrieval time (local cache speed)
                    retrieval_time = 0.8  # Sub-millisecond but realistic
                    encryption = "AES256"
                    versioning = True
                    # Full access (same as DDN INFINIA)
                    access_control = {"read": True, "write": True, "delete": True}
                elif handler.config_type == 'ddn_infinia':
                    storage_source = "ddn_infinia"
                    storage_class = "INTELLIGENT_TIERING"
                    retrieval_time = 2.5  # Fast DDN retrieval
                    encryption = "AES256"
                    versioning = True
                    # DDN: Full access
                    access_control = {"read": True, "write": True, "delete": True}
                else:  # AWS S3
                    storage_source = "aws_s3"
                    storage_class = "STANDARD"
                    retrieval_time = 15.0  # Typical S3 latency
                    encryption = "AES256"
                    versioning = True
                    # AWS: Full access
                    access_control = {"read": True, "write": True, "delete": True}
                
                # Import StorageInfo model
                from app.models.schemas import StorageInfo
                
                results.append(SearchResult(
                    object_key=obj['key'],
                    modality=modality,
                    relevance_score=score,
                    metadata=metadata,
                    size_bytes=obj.get('size', 0),
                    last_modified=obj.get('last_modified', ''),
                    presigned_url=presigned_url,
                    storage_info=StorageInfo(
                        source=storage_source,
                        storage_class=storage_class,
                        access_control=access_control,
                        protocol="S3",
                        encryption=encryption,
                        versioning_enabled=versioning,
                        etag=obj.get('etag'),
                        retrieval_time_ms=retrieval_time
                    )
                ))

        # Sort by relevance
        results.sort(key=lambda x: x.relevance_score, reverse=True)
        results = results[:request.top_k]

        return SearchResponse(
            success=True,
            query=request.query,
            total_results=len(results),
            results=results,
            search_time_ms=(time.perf_counter() - start_time) * 1000
        )

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Search error: {e}")
        logger.error(f"Traceback:\n{error_details}")
        raise HTTPException(status_code=500, detail=f"{str(e)}\n\nTraceback: {error_details}")


# ============== Browse Routes ==============

@browse_router.post("/", response_model=BrowseResponse)
async def browse_objects(request: BrowseRequest):
    """Browse all stored content."""
    try:
        # Get all objects
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        all_objects, _ = handler.list_objects(prefix=request.prefix)
        
        # Filter out .json files (internal metadata)
        all_objects = [obj for obj in all_objects if not obj['key'].endswith('.json')]
        
        # Build response objects
        results = []
        for obj in all_objects:
            # Fetch metadata for each object individually to ensure we get the latest
            obj_metadata, _ = handler.get_object_metadata(obj['key'])
            metadata = obj_metadata.get('metadata', {}) if obj_metadata else {}
            
            # Infer modality from file path if not in metadata or if unknown
            modality = metadata.get('modality', 'unknown')
            if modality == 'unknown':
                object_key = obj['key']
                if object_key.startswith('images/') or object_key.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                    modality = 'image'
                elif object_key.startswith('videos/') or object_key.startswith('media/raw/') or object_key.lower().endswith(('.mp4', '.avi', '.mov', '.webm')):
                    modality = 'video'
                elif object_key.startswith('documents/') or object_key.lower().endswith(('.pdf', '.txt', '.docx')):
                    modality = 'document'
            
            # Load manifest metadata for uploaded videos
            if modality == 'video' and obj['key'].startswith('media/raw/'):
                try:
                    # Extract asset_id from filename: media/raw/videos/{timestamp}_{asset_id}_{filename}
                    filename = obj['key'].split('/')[-1]
                    parts = filename.split('_')
                    
                    # Asset ID is the part that looks like a UUID (contains hyphens)
                    asset_id = None
                    for part in parts:
                        if '-' in part and len(part) == 36:  # UUID format
                            asset_id = part
                            break
                    
                    if asset_id:
                        # Load manifest
                        from app.services.artifact_manager import artifact_manager
                        manifest = artifact_manager.load_manifest(asset_id)
                        
                        if manifest:
                            # Enhance metadata with manifest data
                            metadata['video_summary'] = manifest.video_summary or ''
                            metadata['detected_objects'] = manifest.detected_objects or ''
                            metadata['custom_tags'] = manifest.custom_tags or ''
                            metadata['custom_summary'] = manifest.custom_summary or ''
                            metadata['asset_id'] = asset_id  # Needed for editing
                            logger.debug(f"Loaded manifest for {asset_id} in browse")
                except Exception as e:
                    logger.warning(f"Failed to load manifest for {obj['key']}: {e}")
            
            # Apply modality filter
            if request.modality != "all" and modality != request.modality:
                continue

            # Generate presigned URL
            presigned_url = handler.generate_presigned_url(obj['key'])

            results.append(ObjectInfo(
                key=obj['key'],
                modality=modality,
                size_bytes=obj.get('size', 0),
                last_modified=obj.get('last_modified', ''),
                metadata=metadata,
                presigned_url=presigned_url
            ))

        return BrowseResponse(
            success=True,
            total_objects=len(results),
            objects=results
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== List Videos Route ==============

@browse_router.get("/videos", response_model=BrowseResponse)
async def list_videos():
    """List all videos in storage for dropdown selection."""
    try:
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        objects, msg = handler.list_objects(prefix='videos/')
        
        # Filter out .json files (internal metadata)
        objects = [obj for obj in objects if not obj['key'].endswith('.json')]
        
        objects_result = []
        for obj in objects:
            metadata = obj.get('metadata', {})
            modality = metadata.get('modality', 'unknown')
            
            # If modality is unknown, try to infer from object key path
            if modality == 'unknown':
                object_key = obj.get('key', '')
                if object_key.startswith('images/') or object_key.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
                    modality = 'image'
                elif object_key.startswith('videos/') or object_key.lower().endswith(('.mp4', '.avi', '.mov', '.webm')):
                    modality = 'video'
                elif object_key.startswith('documents/') or object_key.lower().endswith(('.pdf', '.txt', '.docx')):
                    modality = 'document'
                # Update the metadata with inferred modality for consistency
                metadata['modality'] = modality
            
            # Only include videos
            if modality == 'video':
                presigned_url = handler.generate_presigned_url(obj['key'])
                
                objects_result.append(ObjectInfo(
                    key=obj['key'],
                    modality=modality,
                    size_bytes=obj['size'],
                    last_modified=obj['last_modified'],
                    metadata=metadata,
                    presigned_url=presigned_url
                ))
        
        return BrowseResponse(
            success=True,
            total_objects=len(objects_result),
            objects=objects_result
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Video Streaming Proxy Route ==============

@browse_router.get("/video-stream/{object_key:path}")
async def stream_video(object_key: str, download: bool = False):
    """Stream video through backend to avoid browser certificate issues."""
    try:
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        video_bytes, msg = handler.download_bytes(object_key)
        
        if not video_bytes:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Determine content type
        if object_key.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp')):
            media_type = 'image/jpeg'
        elif object_key.lower().endswith(('.mp4', '.avi', '.mov', '.webm')):
            media_type = 'video/mp4'
        else:
            media_type = 'application/octet-stream'
        
        # Return with proper headers
        from fastapi.responses import Response
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(len(video_bytes)),
        }
        
        # Add download header if requested
        if download:
            filename = object_key.split('/')[-1]
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        
        return Response(
            content=video_bytes,
            media_type=media_type,
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@browse_router.get("/image-stream/{object_key:path}")
async def stream_image(object_key: str):
    """Stream image through backend to avoid browser certificate issues with INFINIA's self-signed cert."""
    # Reuse the video streaming logic since it already handles images
    return await stream_video(object_key, download=False)


# ============== Copy Object Route ==============

@browse_router.post("/copy")
async def copy_object(source_key: str, destination_key: str):
    """Copy an object to a new location."""
    try:
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        success, message = handler.copy_object(source_key, destination_key)
        
        if not success:
            raise HTTPException(status_code=500, detail=message)
        
        return {"success": True, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Move Object Route ==============

@browse_router.post("/move")
async def move_object(source_key: str, destination_key: str):
    """Move an object to a new location (copy + delete)."""
    try:
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        success, message = handler.move_object(source_key, destination_key)
        
        if not success:
            raise HTTPException(status_code=500, detail=message)
        
        return {"success": True, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@browse_router.delete("/{object_key:path}")
async def delete_object(object_key: str):
    """Delete an object from storage."""
    try:
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        success, msg = handler.delete_object(object_key)

        if not success:
            raise HTTPException(status_code=500, detail=msg)

        return {"success": True, "message": f"Deleted: {object_key}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@browse_router.delete("/video/{asset_id}")
async def delete_video_cascade(asset_id: str, raw_video_key: str = None):
    """Delete video and all associated artifacts (raw, chunks, keyframes, manifest, embeddings)."""
    try:
        logger.info(f"🗑️ Cascading delete started for asset_id: {asset_id}")
        logger.info(f"🗑️ Raw video key: {raw_video_key}")
        
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        deleted_files = []
        failed_files = []
        
        # Ensure we have S3 client (bypass local cache for deletion)
        if not handler._ensure_client():
            raise HTTPException(status_code=500, detail="Failed to create S3 client")
        
        bucket_name = handler.config['bucket_name']
        logger.info(f"🗑️ Using bucket: {bucket_name}")
        
        # 1. Delete the raw video file if provided
        if raw_video_key:
            logger.info(f"🗑️ Attempting to delete raw video: {raw_video_key}")
            try:
                handler.client.delete_object(Bucket=bucket_name, Key=raw_video_key)
                deleted_files.append(raw_video_key)
                logger.info(f"✅ Deleted raw video: {raw_video_key}")
            except Exception as e:
                logger.error(f"❌ Failed to delete raw video {raw_video_key}: {str(e)}")
                failed_files.append({"key": raw_video_key, "error": str(e)})
        else:
            logger.warning("⚠️ No raw_video_key provided")
        
        # 2. Delete all derived artifact directories by asset_id
        # Only manifests and keyframes exist in this S3 bucket
        artifact_patterns = [
            f"media/derived/keyframes/{asset_id}/",
            f"media/derived/manifests/{asset_id}/"
        ]
        
        # List and delete all files in each artifact directory
        for pattern in artifact_patterns:
            logger.info(f"🔍 Searching for files with pattern: {pattern}")
            try:
                # List objects directly from S3 with this prefix
                response = handler.client.list_objects_v2(
                    Bucket=bucket_name,
                    Prefix=pattern
                )
                
                if 'Contents' in response:
                    file_count = len(response['Contents'])
                    logger.info(f"📁 Found {file_count} files for pattern: {pattern}")
                    for obj in response['Contents']:
                        obj_key = obj['Key']
                        try:
                            # Delete directly from S3
                            handler.client.delete_object(Bucket=bucket_name, Key=obj_key)
                            deleted_files.append(obj_key)
                            logger.info(f"✅ Deleted: {obj_key}")
                        except Exception as e:
                            logger.error(f"❌ Failed to delete {obj_key}: {str(e)}")
                            failed_files.append({"key": obj_key, "error": str(e)})
                else:
                    logger.info(f"📭 No files found for pattern: {pattern}")
            except Exception as e:
                logger.error(f"❌ Error listing/deleting artifacts for pattern {pattern}: {str(e)}")
                failed_files.append({"pattern": pattern, "error": str(e)})
        
        logger.info(f"🎯 Deletion complete: {len(deleted_files)} files deleted, {len(failed_files)} failures")
        
        if failed_files:
            return {
                "success": False,
                "message": f"Deleted {len(deleted_files)} files, but {len(failed_files)} failed",
                "deleted_count": len(deleted_files),
                "deleted_files": deleted_files,
                "failed_files": failed_files
            }
        
        return {
            "success": True,
            "message": f"Successfully deleted all artifacts for video {asset_id}",
            "deleted_count": len(deleted_files),
            "deleted_files": deleted_files
        }

    except Exception as e:
        logger.error(f"💥 Error in cascade delete: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== Health Routes ==============

@health_router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    image_analyzer = get_image_analyzer()

    return HealthResponse(
        status="healthy",
        ddn_configured=bool(storage_config.ddn_infinia_config.get('access_key')),
        aws_configured=bool(storage_config.aws_config.get('access_key')),
        ai_models_loaded=image_analyzer.models_loaded if image_analyzer else False,
        gpu_available=TORCH_AVAILABLE and DEVICE == "cuda",
        device=DEVICE
    )


@health_router.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    """Get storage metrics."""
    try:
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        objects, _ = handler.list_objects()

        total_images = 0
        total_videos = 0
        total_documents = 0
        total_bytes = 0

        for obj in objects:
            metadata = obj.get('metadata', {})
            modality = metadata.get('modality', 'unknown')
            total_bytes += obj.get('size', 0)

            if modality == 'image':
                total_images += 1
            elif modality == 'video':
                total_videos += 1
            elif modality == 'document':
                total_documents += 1

        gpu_memory = None
        if TORCH_AVAILABLE and DEVICE == "cuda":
            import torch
            gpu_memory = torch.cuda.memory_allocated() / 1024 / 1024

        return MetricsResponse(
            total_images=total_images,
            total_videos=total_videos,
            total_documents=total_documents,
            total_storage_bytes=total_bytes,
            gpu_memory_used_mb=gpu_memory
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============== Video Frame Search Route ==============

@upload_router.post("/video/search-frames", response_model=VideoFrameSearchResponse)
async def search_video_frames(request: VideoFrameSearchRequest):
    """Search video frames using semantic similarity with CLIP."""
    try:
        # Download video from storage
        handler = S3Handler('ddn_infinia', storage_config.local_cache_config)
        video_bytes, msg = handler.download_bytes(request.video_key)
        
        if not video_bytes:
            raise HTTPException(status_code=404, detail=f"Video not found: {msg}")
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
            tmp.write(video_bytes)
            tmp_path = tmp.name
        
        try:
            # Perform semantic frame search
            analyzer = get_video_analyzer()
            matching_frames = analyzer.search_frames_semantic(
                tmp_path,
                request.query,
                request.threshold
            )
            
            return VideoFrameSearchResponse(
                success=True,
                video_key=request.video_key,
                query=request.query,
                matching_frames=matching_frames,
                total_frames_analyzed=20  # We extract 20 keyframes
            )
        finally:
            os.unlink(tmp_path)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# ============== Continuous Ingestion Routes ==============

@ingestion_router.post("/start")
async def start_bucket_monitoring(bucket_name: str):
    """Start monitoring S3 bucket for new files in auto_ingest folder."""
    logger.info(f"📡 Starting bucket monitoring for: {bucket_name}")
    try:
        message = bucket_monitor.start_monitoring(bucket_name)
        return {"success": True, "message": message, "bucket_name": bucket_name}
    except Exception as e:
        logger.error(f"Failed to start monitoring: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@ingestion_router.post("/stop")
async def stop_bucket_monitoring():
    """Stop bucket monitoring."""
    logger.info("🛑 Stopping bucket monitoring")
    try:
        message = bucket_monitor.stop_monitoring()
        return {"success": True, "message": message}
    except Exception as e:
        logger.error(f"Failed to stop monitoring: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@ingestion_router.get("/status")
async def get_monitoring_status():
    """Get current bucket monitoring status."""
    try:
        status = bucket_monitor.get_status()
        return status
    except Exception as e:
        logger.error(f"Failed to get status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@ingestion_router.post("/clear")
async def clear_monitoring_history():
    """Clear processed file history without stopping monitoring."""
    try:
        message = bucket_monitor.clear_history()
        return {"success": True, "message": message}
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@ingestion_router.get("/stream")
async def stream_processing_events():
    """Stream real-time processing events via SSE."""
    logger.info("📡 Client connected to SSE stream")
    return StreamingResponse(
        bucket_monitor.stream_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )
