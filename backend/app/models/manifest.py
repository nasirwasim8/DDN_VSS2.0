"""
Pydantic models for video asset manifests and metadata tracking.

These models define the structure for tracking video processing artifacts,
including chunks, keyframes, AI-generated metadata, and storage locations.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class StructuredTags(BaseModel):
    """AI-generated structured tags for content analysis."""
    objects: List[str] = Field(default_factory=list, description="Detected objects")
    actions: List[str] = Field(default_factory=list, description="Detected actions/activities")
    scenes: List[str] = Field(default_factory=list, description="Scene types (indoor, outdoor, etc.)")
    safety: List[str] = Field(default_factory=list, description="Safety/content warnings")
    people_count: int = Field(default=0, description="Number of people detected")
    custom_tags: List[str] = Field(default_factory=list, description="User-provided custom tags")


class KeyframeMetadata(BaseModel):
    """Metadata for a single extracted keyframe."""
    frame_id: str = Field(..., description="Unique frame identifier")
    timestamp: float = Field(..., description="Timestamp in video (seconds)")
    s3_key: str = Field(..., description="S3 object key for keyframe image")
    embedding_id: str = Field(..., description="Unique ID for embedding vector")
    caption: str = Field(default="", description="AI-generated caption")
    tags: Optional[StructuredTags] = Field(default=None, description="Structured tags")
    confidence_score: float = Field(default=1.0, description="AI confidence score")


class ChunkAnalysis(BaseModel):
    """Analysis results for a video chunk."""
    chunk_id: int = Field(..., description="Chunk number (0-indexed)")
    start_time: float = Field(..., description="Start timestamp (seconds)")
    end_time: float = Field(..., description="End timestamp (seconds)")
    duration: float = Field(..., description="Chunk duration (seconds)")
    keyframes: List[KeyframeMetadata] = Field(default_factory=list, description="Extracted keyframes")
    total_keyframes: int = Field(default=0, description="Number of keyframes in chunk")
    dominant_tags: Optional[StructuredTags] = Field(default=None, description="Aggregated tags for chunk")
    summary_caption: str = Field(default="", description="Chunk summary")
    s3_key: str = Field(..., description="S3 key for chunk analysis JSON")
    processed_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    processing_time_ms: float = Field(default=0.0, description="Processing time in milliseconds")


class AssetManifest(BaseModel):
    """Complete manifest for a media asset."""
    # Basic Info
    asset_id: str = Field(..., description="Unique asset identifier (UUID)")
    filename: str = Field(..., description="Original filename")
    media_type: str = Field(..., description="Media type: video, image, document")
    raw_object_key: str = Field(..., description="S3 key for raw asset")
    
    # Video Properties
    width: int = Field(default=0, description="Video width in pixels")
    height: int = Field(default=0, description="Video height in pixels")
    fps: float = Field(default=0.0, description="Frames per second")
    duration_seconds: float = Field(default=0.0, description="Total duration")
    
    # Processing Info
    total_chunks: int = Field(default=0, description="Number of chunks processed")
    total_keyframes: int = Field(default=0, description="Total keyframes extracted")
    chunks: List[ChunkAnalysis] = Field(default_factory=list, description="Per-chunk analysis")
    
    # AI-Generated Content
    video_summary: str = Field(default="", description="AI-generated video summary")
    detected_objects: str = Field(default="", description="Comma-separated detected objects")
    custom_tags: str = Field(default="", description="User-provided custom tags")
    custom_summary: str = Field(default="", description="User-provided custom summary")
    
    # Artifacts Tracking
    artifacts: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Map of artifact type to S3 keys"
    )
    
    # Status Tracking
    processing_status: str = Field(
        default="pending",
        description="Status: pending, processing, completed, failed"
    )
    processing_error: Optional[str] = Field(default=None, description="Error message if failed")
    processing_timestamp: Optional[datetime] = Field(default=None, description="Last processing time")
    
    # Timestamps
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    last_updated: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    version: int = Field(default=1, description="Manifest version for reprocessing")
    ingestion_time_seconds: float = Field(default=0.0, description="Total end-to-end ingestion processing time in seconds")

    # LLM Enrichment (Ollama/OpenAI Vision post-processing)
    enriched_summary: str = Field(default="", description="LLM-generated clean semantic summary")
    enriched_tags: List[str] = Field(default_factory=list, description="Search-optimized tags from LLM")
    scene_type: str = Field(default="", description="Scene classification: urban_outdoor, indoor, etc.")
    key_events: List[str] = Field(default_factory=list, description="Meaningful events/actions detected")
    llm_enriched: bool = Field(default=False, description="True when LLM enrichment succeeded")
    llm_provider_used: str = Field(default="", description="Which LLM provider was used: openai, ollama, or empty")



    
    def add_artifact(self, artifact_type: str, s3_key: str):
        """Add an artifact to tracking."""
        if artifact_type not in self.artifacts:
            self.artifacts[artifact_type] = []
        if s3_key not in self.artifacts[artifact_type]:
            self.artifacts[artifact_type].append(s3_key)
            self.last_updated = datetime.utcnow().isoformat()
    
    def update_statistics(self):
        """Update aggregate statistics from chunks."""
        self.total_keyframes = sum(chunk.total_keyframes for chunk in self.chunks)
        self.last_updated = datetime.utcnow().isoformat()


class ProcessingStatusResponse(BaseModel):
    """Response model for processing status endpoint."""
    asset_id: str
    status: str  # pending, processing, completed, failed
    total_chunks: Optional[int] = None
    total_keyframes: Optional[int] = None
    processing_error: Optional[str] = None


class VideoUploadAsyncResponse(BaseModel):
    """Response for async video upload."""
    success: bool
    message: str
    asset_id: str
    filename: str
    media_type: str
    task_id: str  # Celery task ID
    object_key: str
