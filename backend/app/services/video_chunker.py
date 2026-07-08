"""
Video chunking service for segmenting videos into processable chunks.

This service handles video metadata extraction and chunk calculation
for parallel processing of large video files.
"""

import logging
import threading
import cv2
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Hard timeout (seconds) for any single cv2.VideoCapture operation
CV2_TIMEOUT = 30


@dataclass
class VideoChunk:
    """Represents a video chunk for processing."""
    chunk_id: int
    start_time: float
    end_time: float
    duration: float


class VideoChunker:
    """Handles video chunking operations."""
    
    def __init__(self, chunk_duration: float = 10.0):
        """
        Initialize video chunker.
        
        Args:
            chunk_duration: Duration of each chunk in seconds (default: 10s)
        """
        self.chunk_duration = chunk_duration

    def _get_video_info_inner(self, video_path: str) -> Optional[Dict[str, Any]]:
        """Inner helper — runs in a thread so we can enforce a timeout."""
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Failed to open video: {video_path}")
            return None
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0
        cap.release()
        return {'fps': fps, 'frame_count': frame_count,
                'width': width, 'height': height, 'duration': duration}

    def get_video_info(self, video_path: str) -> Optional[Dict[str, Any]]:
        """
        Extract video metadata using OpenCV with a hard timeout.
        cv2.VideoCapture can hang indefinitely on corrupt/incompatible files;
        the timeout ensures the background task never gets permanently stuck.

        Args:
            video_path: Path to video file

        Returns:
            Dict with video properties or None on error / timeout
        """
        result: Dict = {}
        exc: Dict = {}

        def _run():
            try:
                r = self._get_video_info_inner(video_path)
                if r:
                    result.update(r)
            except Exception as e:
                exc['error'] = e

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=CV2_TIMEOUT)

        if t.is_alive():
            logger.error(
                f"⏱️ cv2.VideoCapture timed out after {CV2_TIMEOUT}s on {video_path} "
                f"— video may be corrupt or incompatible"
            )
            return None

        if exc.get('error'):
            logger.error(f"Error extracting video info: {exc['error']}")
            return None

        if not result:
            return None

        logger.info(
            f"📹 Video info: {result['width']}x{result['height']} "
            f"@ {result['fps']:.2f}fps, duration: {result['duration']:.2f}s"
        )
        return result
    
    def calculate_chunks(self, duration: float) -> List[VideoChunk]:
        """
        Calculate chunk boundaries for a video.
        
        Args:
            duration: Total video duration in seconds
            
        Returns:
            List of VideoChunk objects
        """
        chunks = []
        chunk_id = 0
        current_time = 0.0
        
        while current_time < duration:
            end_time = min(current_time + self.chunk_duration, duration)
            chunk_duration = end_time - current_time
            
            chunks.append(VideoChunk(
                chunk_id=chunk_id,
                start_time=current_time,
                end_time=end_time,
                duration=chunk_duration
            ))
            
            current_time = end_time
            chunk_id += 1
        
        logger.info(f"📊 Calculated {len(chunks)} chunks @ {self.chunk_duration}s each")
        return chunks
