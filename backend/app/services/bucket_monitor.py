"""
Bucket monitoring service for continuous multimodal ingestion.
Automatically processes images, videos, and documents uploaded to S3 bucket's auto_ingest folder.
"""
import time
import threading
import logging
import asyncio
import json
import queue
import io
import os
import tempfile
from typing import Dict, Set, Optional
from datetime import datetime
from PIL import Image

from app.services.storage import S3Handler
from app.services.ai_models import (
    get_image_analyzer,
    get_video_analyzer,
    get_document_analyzer
)

logger = logging.getLogger(__name__)


class BucketMonitor:
    """Monitor S3 bucket for new multimodal files and process them automatically."""
    
    def __init__(self):
        self.image_analyzer = get_image_analyzer()
        self.video_analyzer = get_video_analyzer()
        self.document_analyzer = get_document_analyzer()
        
        self.monitoring = False
        self.bucket_name: Optional[str] = None
        self.processed_files: Set[str] = set()
        self.processed_videos: list = []  # Track recent video uploads with metadata
        self.monitor_thread: Optional[threading.Thread] = None
        self.poll_interval = 5  # seconds
        
        # Real-time streaming support (use queue.Queue for thread safety)
        self.processing_events: queue.Queue = queue.Queue(maxsize=500)
        self.current_file_progress: Dict = {}
        
        logger.info("📂 BucketMonitor initialized for multimodal content")
    
    def start_monitoring(self, bucket_name: str) -> str:
        """Start monitoring the specified S3 bucket."""
        if self.monitoring:
            return f"Already monitoring bucket: {self.bucket_name}"
        
        self.bucket_name = bucket_name
        self.monitoring = True
        
        # ── Reset state so old data never bleeds into a new session ──
        self.processed_files = set()
        self.processed_videos = []
        self.current_file_progress = {}
        # Drain any leftover events from a previous run
        while not self.processing_events.empty():
            try:
                self.processing_events.get_nowait()
            except Exception:
                break
        
        # Create folder structure if it does not exist
        self._ensure_folder_structure()        
        # Start monitoring thread
        self.monitor_thread = threading.Thread(target=self._poll_bucket, daemon=True)
        self.monitor_thread.start()
        
        logger.info(f"🚀 Started monitoring bucket: {bucket_name}")
        return f"Started monitoring bucket: {bucket_name}"
    
    def _ensure_folder_structure(self):
        """Ensure auto_ingest and processed folders exist in the bucket."""
        if not self.bucket_name:
            return
        
        try:
            handler = S3Handler('ddn_infinia')
            success = handler.create_client()
            if not success:
                logger.warning("Could not create folders - client creation failed")
                return
            
            # Check if auto_ingest folder exists (as a marker file)
            objects, _ = handler.list_objects(prefix='auto_ingest/')
            
            if not objects:
                # Create folder by uploading a README marker
                readme_content = b"""# Auto Ingest Folder

Upload multimodal files (images, videos, documents) to this folder for automatic processing.

Supported formats:
- Images: .jpg, .jpeg, .png, .gif, .bmp, .webp
- Videos: .mp4, .avi, .mov, .mkv, .flv, .wmv  
- Documents: .pdf

Files will be automatically:
1. Detected every 5 seconds
2. Processed using GPU-accelerated AI models
3. Stored with embeddings
4. Moved to the 'processed/' folder
"""
                handler.upload_bytes(readme_content, 'auto_ingest/README.md', metadata={'info': 'Auto-created folder'})
                logger.info("📁 Created auto_ingest/ folder with README")
            
            # Ensure processed folder exists
            processed_objects, _ = handler.list_objects(prefix='processed/')
            if not processed_objects:
                readme_processed = b"""# Processed Files Folder

This folder contains files that have been successfully processed by the Continuous Ingestion system.

Files are automatically moved here after:
- Successful analysis and embedding generation
- Metadata extraction
- Storage in the vector database
"""
                handler.upload_bytes(readme_processed, 'processed/README.md', metadata={'info': 'Auto-created folder'})
                logger.info("📁 Created processed/ folder with README")
                
        except Exception as e:
            logger.warning(f"Could not create folder structure: {e}")
    
    
    def stop_monitoring(self) -> str:
        """Stop bucket monitoring."""
        if not self.monitoring:
            return "Monitoring is not active"
        
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=2)
        
        # Clear session state so next start is fresh
        self.processed_files = set()
        self.processed_videos = []
        self.current_file_progress = {}
        
        logger.info(f"🛑 Stopped monitoring bucket: {self.bucket_name}")
        return "Monitoring stopped"
    
    def get_status(self) -> Dict:
        """Get current monitoring status."""
        return {
            "monitoring": self.monitoring,
            "bucket_name": self.bucket_name,
            "processed_files_count": len(self.processed_files),
            "processed_files": list(self.processed_files),
            "processed_videos": self.processed_videos[-10:],  # Last 10 videos
            "current_file_progress": self.current_file_progress,
            "last_check": datetime.now().isoformat() if self.monitoring else None
        }

    def clear_history(self) -> str:
        """Clear processed files history without stopping monitoring."""
        self.processed_files = set()
        self.processed_videos = []
        self.current_file_progress = {}
        logger.info("🗑️ Cleared processed file history")
        return "History cleared"

    
    def _emit_progress(self, event_data: Dict):
        """Emit progress event for real-time streaming."""
        try:
            # Non-blocking put - if queue is full, skip this event
            self.processing_events.put_nowait(event_data)
            logger.info(f"📡 Emitted progress event: {event_data.get('file')}")
        except queue.Full:
            logger.warning("⚠️ Event queue full, skipping event")
    
    async def stream_events(self):
        """Generator for SSE streaming of processing events."""
        logger.info("📡 SSE stream started")
        try:
            while True:
                # Wait for new event with timeout using asyncio.to_thread for blocking queue.get()
                try:
                    # Run blocking queue.get() in thread pool with timeout
                    event = await asyncio.wait_for(
                        asyncio.to_thread(self.processing_events.get, timeout=30.0),
                        timeout=31.0  # Slightly longer than queue timeout
                    )
                    yield f"data: {json.dumps(event)}\\n\\n"
                except (asyncio.TimeoutError, queue.Empty):
                    # Send keepalive if no events
                    yield f": keepalive\\n\\n"
        except Exception as e:
            logger.error(f"SSE stream error: {e}")
            yield f"data: {{\"error\": \"{str(e)}\"}}\\n\\n"
    
    def _poll_bucket(self):
        """Poll bucket for new files continuously."""
        logger.info(f"📡 Polling thread started for bucket: {self.bucket_name}")
        
        while self.monitoring:
            try:
                self._check_bucket_for_new_files()
                time.sleep(self.poll_interval)
            except Exception as e:
                logger.error(f"❌ Error polling bucket: {e}")
                time.sleep(self.poll_interval * 2)  # Back off on error
    
    def _check_bucket_for_new_files(self):
        """Check bucket for new files in auto_ingest folder."""
        if not self.bucket_name:
            return
        
        try:
            logger.debug(f"🔍 Scanning bucket '{self.bucket_name}' auto_ingest/ folder...")
            
            handler = S3Handler('ddn_infinia')
            success = handler.create_client()
            if not success:
                logger.warning("Failed to create DDN INFINIA client")
                return
            
            # List objects in auto_ingest folder
            objects, message = handler.list_objects(prefix='auto_ingest/')
            
            logger.debug(f"   Found {len(objects)} total objects")
            logger.debug(f"   Already processed: {len(self.processed_files)} files")
            
            if not objects:
                logger.debug("   No objects found in auto_ingest/ folder")
                return
            
            # Supported multimodal file types
            SUPPORTED_EXTENSIONS = {
                'image': ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'),
                'video': ('.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv'),
                'document': ('.pdf',)
            }
            
            new_files_count = 0
            for obj in objects:
                key = obj['key']
                
                # Skip directory markers
                if key.endswith('/'):
                    continue
                
                # Check if file type is supported
                file_extension = '.' + key.lower().split('.')[-1] if '.' in key else ''
                file_type = None
                
                for ftype, extensions in SUPPORTED_EXTENSIONS.items():
                    if file_extension in extensions:
                        file_type = ftype
                        break
                
                if not file_type:
                    logger.debug(f"⏭️  Skipping unsupported file: {key}")
                    continue
                
                # Skip if already processed
                if key in self.processed_files:
                    logger.debug(f"⏭️  Already processed: {key}")
                    continue
                
                logger.info(f"✅ Found new {file_type} for processing: {key}")
                new_files_count += 1
                self._process_bucket_file(key, file_type, handler)
            
            if new_files_count == 0:
                logger.debug(f"   No new files to process")
                
        except Exception as e:
            logger.error(f"❌ Error checking bucket: {e}", exc_info=True)
    
    def _process_bucket_file(self, s3_key: str, file_type: str, handler: S3Handler):
        """Download and process a file from the bucket."""
        filename = os.path.basename(s3_key)
        
        #start overall timing
        process_start_time = time.perf_counter()
        download_time_ms = 0
        processing_time_ms = 0
        file_size_bytes = 0
        
        try:
            logger.info(f"📥 Downloading {file_type}: {s3_key}")
            
            # Download file with timing
            download_start = time.perf_counter()
            file_bytes, message = handler.download_bytes(s3_key)
            download_time_ms = (time.perf_counter() - download_start) * 1000
            
            if not file_bytes:
                logger.error(f"❌ Failed to download {s3_key}: {message}")
                self._emit_progress({
                    'file': filename,
                    's3_key': s3_key,
                    'status': 'error',
                    'error': f"Download failed: {message}",
                    'timestamp': datetime.now().isoformat()
                })
                return
            
            file_size_bytes = len(file_bytes)
            logger.info(f"✅ Downloaded {filename}: {file_size_bytes / (1024*1024):.2f} MB in {download_time_ms:.2f}ms")
            
            # Emit download progress
            self._emit_progress({
                'file': filename,
                's3_key': s3_key,
                'file_type': file_type,
                'status': 'downloaded',
                'file_size_mb': file_size_bytes / (1024*1024),
                'download_time_ms': download_time_ms,
                'timestamp': datetime.now().isoformat()
            })
            
            # Process based on file type
            processing_start = time.perf_counter()
            success = False
            
            if file_type == 'image':
                success = self._process_image(s3_key, filename, file_bytes, handler)
            elif file_type == 'video':
                success = self._process_video(s3_key, filename, file_bytes, handler)
            elif file_type == 'document':
                success = self._process_document(s3_key, filename, file_bytes, handler)
            
            processing_time_ms = (time.perf_counter() - processing_start) * 1000
            
            if success:
                # Mark as processed ONLY if successful
                self.processed_files.add(s3_key)
                
                total_time_ms = (time.perf_counter() - process_start_time) * 1000
                
                logger.info(f"✅ Successfully processed {filename}")
                logger.info(f"⏱️  Timing breakdown - Download: {download_time_ms:.0f}ms, Processing: {processing_time_ms:.0f}ms, Total: {total_time_ms:.0f}ms")
                
                # Emit completion event
                self._emit_progress({
                    'file': filename,
                    's3_key': s3_key,
                    'file_type': file_type,
                    'status': 'completed',
                    'download_time_ms': download_time_ms,
                    'processing_time_ms': processing_time_ms,
                    'total_time_ms': total_time_ms,
                    'timestamp': datetime.now().isoformat()
                })
                
                # Move file to processed folder
                # Note: Videos are already stored at media/raw/videos/ so don't move them
                if file_type != 'video':
                    try:
                        processed_key = s3_key.replace('auto_ingest/', 'processed/')
                        logger.info(f"📦 Moving {s3_key} to {processed_key}...")
                        
                        bucket = self.bucket_name
                        handler.client.copy_object(
                            Bucket=bucket,
                            CopySource={'Bucket': bucket, 'Key': s3_key},
                            Key=processed_key
                        )
                        handler.delete_object(s3_key)
                        logger.info(f"✅ Moved {filename} to processed/ folder")
                    except Exception as move_error:
                        logger.warning(f"⚠️ Could not move file to processed/: {move_error}")
                else:
                    # Delete from auto_ingest since video is now at media/raw/videos/
                    try:
                        handler.delete_object(s3_key)
                        logger.info(f"🗑️ Removed {filename} from auto_ingest/ (now at media/raw/videos/)")
                    except Exception as delete_error:
                        logger.warning(f"⚠️ Could not delete from auto_ingest/: {delete_error}")
            else:
                logger.error(f"❌ Failed to process {filename}")
                
        except Exception as e:
            logger.error(f"❌ FAILED to process {s3_key}: {e}", exc_info=True)
            self._emit_progress({
                'file': filename,
                's3_key': s3_key,
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
    
    def _process_image(self, s3_key: str, filename: str, file_bytes: bytes, handler: S3Handler) -> bool:
        """Process an image file."""
        try:
            logger.info(f"🖼️  Processing image: {filename}")
            
            # Open image from bytes
            image = Image.open(io.BytesIO(file_bytes))
            
            # Generate caption using BLIP
            caption = self.image_analyzer.generate_caption(image)
            
            # Classify scene using ViT
            scene_classes = self.image_analyzer.classify_scene(image, top_k=3)
            scene_tags = [c['label'] for c in scene_classes] if scene_classes else []
            
            # Generate embedding using CLIP
            embedding = self.image_analyzer.compute_clip_embedding(image)
            
            logger.info(f"   Caption: {caption}")
            logger.info(f"   Scene tags: {', '.join(scene_tags)}")
            
            # Store in S3 with metadata
            metadata = {
                'modality': 'image',
                'caption': caption[:500],  # Truncate for metadata
                'scene_tags': ','.join(scene_tags[:5]),
                'embedding_model': 'CLIP',
                'processed_at': datetime.now().isoformat()
            }
            
            # Upload with embedding
            success, message = handler.upload_bytes(
                file_bytes,
                s3_key,
                metadata=metadata,
            )
            
            if success:
                logger.info(f"✅ Image stored with embedding: {s3_key}")
                self._emit_progress({
                    'file': filename,
                    's3_key': s3_key,
                    'status': 'processing',
                    'caption': caption,
                    'scene_tags': scene_tags,
                    'timestamp': datetime.now().isoformat()
                })
                return True
            else:
                logger.error(f"❌ Failed to store image: {message}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Image processing error: {e}", exc_info=True)
            return False
    
    def _process_video(self, s3_key: str, filename: str, file_bytes: bytes, handler: S3Handler) -> bool:
        """Process a video file."""
        try:
            import uuid
            from app.services.artifact_manager import artifact_manager
            
            logger.info(f"🎥 Processing video: {filename}")
            
            # Generate asset_id for manifest tracking
            asset_id = str(uuid.uuid4())
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            
            # Save to temp file for video processing
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name
            
            try:
                # Extract frames and analyze
                analysis_result = self.video_analyzer.analyze(tmp_path, num_frames=10)
                
                if not analysis_result or 'frame_analyses' not in analysis_result:
                    logger.warning(f"⚠️ No frames extracted from video: {filename}")
                    return False
                
                # Extract data from analysis result
                frame_analyses = analysis_result.get('frame_analyses', [])
                detected_objects = analysis_result.get('detected_objects', '')
                
                # Generate AI summary from frame captions
                frame_captions = [f.get('caption', '') for f in frame_analyses if f.get('caption')]
                
                # Create video summary
                video_summary = f"Video analysis from {len(frame_analyses)} frames. "
                if frame_captions:
                    # Use first few unique captions
                    unique_captions = list(dict.fromkeys(frame_captions))[:3]
                    video_summary += "Scenes: " + "; ".join(unique_captions)
                else:
                    video_summary += f"Contains {len(frame_analyses)} analyzed video frames."
                
                # detected_objects already formatted as comma-separated string from analyzer
                if not detected_objects and frame_analyses:
                    # Fallback: extract from frame analyses
                    objects_set = set()
                    for frame in frame_analyses:
                        frame_objects = frame.get('objects', '')
                        for obj in frame_objects.split(', '):
                            if obj:
                                objects_set.add(obj)
                    detected_objects = ", ".join(list(objects_set)[:10])
                
                # Create new S3 key with asset_id (matching Video Upload pattern)
                new_s3_key = f"media/raw/videos/{timestamp}_{asset_id}_{filename}"
                
                logger.info(f"   Asset ID: {asset_id}")
                logger.info(f"   Summary: {video_summary[:100]}...")
                logger.info(f"   Tags: {detected_objects}")
                
                # Store video with metadata
                metadata = {
                    'modality': 'video',
                    'asset_id': asset_id,
                    'video_summary': video_summary[:500],
                    'detected_objects': detected_objects,
                    'frame_count': str(len(frame_analyses)),
                    'embedding_model': 'CLIP',
                    'processed_at': datetime.now().isoformat()
                }
                
                # Note: Embedding not stored here, handled separately if needed
                
                success, message = handler.upload_bytes(
                    file_bytes,
                    new_s3_key,
                    metadata=metadata,
                )
                
                if not success:
                    logger.error(f"❌ Failed to store video: {message}")
                    return False
                
                # Create manifest (matching Video Upload functionality)
                try:
                    from app.models.manifest import AssetManifest
                    
                    manifest = AssetManifest(
                        asset_id=asset_id,
                        filename=filename,
                        media_type="video",
                        raw_object_key=new_s3_key,
                        video_summary=video_summary,
                        detected_objects=detected_objects,
                        custom_summary="",  # User can edit in Browse page
                        custom_tags="",  # User can edit in Browse page
                        processing_status="completed"
                    )
                    
                    success = artifact_manager.save_manifest(manifest)
                    if success:
                        logger.info(f"✅ Manifest created: {asset_id}")

                        # --- LLM Enrichment: save frames to temp files for vision API ---
                        keyframe_tmp_paths = []
                        try:
                            from app.services.llm_enrichment import enrich_with_fallback

                            # Extract a few frames as actual image files for the vision model
                            try:
                                sample_frames = self.video_analyzer.extract_frames(tmp_path, num_frames=6)
                                # Pick up to 3 evenly-spaced frames
                                step = max(1, len(sample_frames) // 3)
                                selected_frames = [sample_frames[i] for i in range(0, min(len(sample_frames), step * 3), step)]
                                for pil_img in selected_frames:
                                    kf_tmp = tempfile.NamedTemporaryFile(
                                        delete=False, suffix='.jpg'
                                    )
                                    pil_img.save(kf_tmp.name, format='JPEG', quality=85)
                                    kf_tmp.close()
                                    keyframe_tmp_paths.append(kf_tmp.name)
                            except Exception as kf_err:
                                logger.warning(f"⚠️ Could not extract keyframes for enrichment: {kf_err}")

                            objects_list = [o.strip() for o in detected_objects.split(',') if o.strip()]
                            duration_sec = float(analysis_result.get('duration_seconds', 0.0) or 0.0)

                            logger.info(f"🤖 Running LLM enrichment with {len(keyframe_tmp_paths)} keyframes for {asset_id}")
                            enriched, provider_used = enrich_with_fallback(
                                keyframe_paths=keyframe_tmp_paths,
                                captions=frame_captions,
                                detected_objects=objects_list,
                                duration_seconds=duration_sec
                            )
                            if enriched and enriched.summary:
                                manifest.llm_enriched = True
                                manifest.enriched_summary = enriched.summary
                                manifest.enriched_tags = getattr(enriched, 'search_tags', enriched.tags if hasattr(enriched, 'tags') else []) or []
                                manifest.scene_type = getattr(enriched, 'scene_type', '') or ''
                                manifest.key_events = getattr(enriched, 'key_events', []) or []
                                manifest.video_summary = enriched.summary  # override BLIP summary
                                manifest.llm_provider_used = provider_used
                                artifact_manager.save_manifest(manifest)
                                video_summary = enriched.summary  # update local var for display
                                logger.info(f"✅ LLM enriched via {provider_used}: {asset_id}")
                            else:
                                logger.warning(f"⚠️ LLM enrichment returned no result for: {asset_id}")
                        except Exception as enrich_error:
                            logger.warning(f"⚠️ LLM enrichment failed for continuous ingest: {enrich_error}", exc_info=True)
                        finally:
                            # Clean up temp keyframe files
                            for kp in keyframe_tmp_paths:
                                try:
                                    if os.path.exists(kp):
                                        os.unlink(kp)
                                except Exception:
                                    pass
                        # --- End LLM Enrichment ---

                    else:
                        logger.warning(f"⚠️ Failed to save manifest: {asset_id}")
                except Exception as manifest_error:
                    logger.warning(f"⚠️ Failed to create manifest: {manifest_error}")
                    # Continue anyway - video is still stored

                # Track video in history (for frontend display) - uses updated video_summary
                video_metadata = {
                    'asset_id': asset_id,
                    'filename': filename,
                    'timestamp': timestamp,
                    'upload_time': datetime.now().isoformat(),
                    'video_summary': video_summary[:200],  # uses enriched summary if available
                    'detected_objects': detected_objects,
                    'frame_count': len(frame_analyses),
                    's3_key': new_s3_key,
                    'status': 'completed'
                }
                self.processed_videos.append(video_metadata)
                # Keep only last 50 videos in memory
                if len(self.processed_videos) > 50:
                    self.processed_videos = self.processed_videos[-50:]

                logger.info(f"✅ Video stored with manifest: {new_s3_key}")
                self._emit_progress({
                    'file': filename,
                    's3_key': new_s3_key,
                    'asset_id': asset_id,
                    'status': 'processing',
                    'summary': video_summary,   # enriched summary if available
                    'detected_objects': detected_objects,
                    'frame_count': len(frame_analyses),
                    'timestamp': datetime.now().isoformat()
                })
                return True
                
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                    
        except Exception as e:
            logger.error(f"❌ Video processing error: {e}", exc_info=True)
            return False
    
    def _process_document(self, s3_key: str, filename: str, file_bytes: bytes, handler: S3Handler) -> bool:
        """Process a document file."""
        try:
            logger.info(f"📄 Processing document: {filename}")
            
            # Save to temp file for document processing
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
                tmp.write(file_bytes)
                tmp_path = tmp.name
            
            try:
                # Extract text
                text = self.document_analyzer.extract_text(tmp_path)
                
                if not text or len(text.strip()) == 0:
                    logger.warning(f"⚠️ No text extracted from document: {filename}")
                    return False
                
                # Get embedding using sentence transformer
                embedding = self.document_analyzer.get_text_embedding(text[:1000])  # Use first 1000 chars for document embedding
                
                # Store in S3 with metadata
                metadata = {
                    'modality': 'document',
                    'text_preview': text[:500],  # Truncate for metadata
                    'text_length': str(len(text)),
                    'embedding_model': 'sentence-transformer',
                    'processed_at': datetime.now().isoformat()
                }
                
                success, message = handler.upload_bytes(
                    file_bytes,
                    s3_key,
                    metadata=metadata,
                )
                
                if success:
                    logger.info(f"✅ Document stored with embedding: {s3_key}")
                    self._emit_progress({
                        'file': filename,
                        's3_key': s3_key,
                        'status': 'processing',
                        'text_preview': text[:200],
                        'text_length': len(text),
                        'timestamp': datetime.now().isoformat()
                    })
                    return True
                else:
                    logger.error(f"❌ Failed to store document: {message}")
                    return False
                    
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                    
        except Exception as e:
            logger.error(f"❌ Document processing error: {e}", exc_info=True)
            return False
