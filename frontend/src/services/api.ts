import axios from 'axios'

// In production (served by `serve`), there is no Vite proxy, so we must call
// the backend directly.  VITE_API_URL is set to http://localhost:8001 by
// wsl_deploy.sh when building the production bundle.
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const HEALTH_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : '/'

const axiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types
export interface StorageConfig {
  access_key: string
  secret_key: string
  bucket_name: string
  region: string
  endpoint_url?: string
}

export interface ConnectionTestResponse {
  provider: string
  success: boolean
  message: string
  latency_ms?: number
}

export interface HealthResponse {
  status: string
  ddn_configured: boolean
  aws_configured: boolean
  ai_models_loaded: boolean
  gpu_available: boolean
  device: string
}

export interface ImageUploadResponse {
  success: boolean
  message: string
  object_key: string
  caption: string
  detected_objects: string
  width: number
  height: number
  has_embedding: boolean
}

export interface VideoUploadResponse {
  success: boolean
  message: string
  object_key: string
  summary: string
  duration_seconds: number
  detected_objects: string
  frame_count: number
  presigned_url?: string
}

export interface DocumentUploadResponse {
  success: boolean
  message: string
  object_key: string
  summary: string
  word_count: number
  key_terms: string
}

export interface SearchResult {
  object_key: string
  modality: string
  relevance_score: number
  metadata: Record<string, unknown>
  size_bytes: number
  last_modified: string
  presigned_url?: string
}

export interface SearchResponse {
  success: boolean
  query: string
  total_results: number
  results: SearchResult[]
  search_time_ms: number
}

export interface ObjectInfo {
  key: string
  modality: string
  size_bytes: number
  last_modified: string
  metadata: Record<string, unknown>
  presigned_url?: string
}

export interface BrowseResponse {
  success: boolean
  total_objects: number
  objects: ObjectInfo[]
}

export interface MetricsResponse {
  total_images: number
  total_videos: number
  total_documents: number
  total_storage_bytes: number
  gpu_memory_used_mb?: number
}

// Async Video Processing
export interface VideoUploadAsyncResponse {
  success: boolean
  message: string
  asset_id: string
  filename: string
  media_type: string
  task_id: string
  object_key: string
}

export interface ProcessingStatusResponse {
  asset_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_chunks?: number
  total_keyframes?: number
  processing_error?: string
}

export interface KeyframeMetadata {
  frame_id: string
  timestamp: number
  s3_key: string
  embedding_id: string
  caption: string
  tags: {
    objects: string[]
    actions: string[]
    scenes: string[]
    safety: string[]
    people_count: number
    custom_tags: string[]
  }
  confidence_score: number
}

export interface ChunkAnalysis {
  chunk_id: number
  start_time: number
  end_time: number
  duration: number
  keyframes: KeyframeMetadata[]
  total_keyframes: number
  dominant_tags: {
    objects: string[]
    actions: string[]
    scenes: string[]
    safety: string[]
  }
  summary_caption: string
  s3_key: string
  processing_time_ms: number
}

export interface AssetManifest {
  asset_id: string
  filename: string
  media_type: string
  raw_object_key: string
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
  processing_timestamp: string
  processing_error?: string
  width?: number
  height?: number
  fps?: number
  duration_seconds?: number
  total_chunks: number
  total_keyframes: number
  chunks: ChunkAnalysis[]
  video_summary: string
  detected_objects: string
  custom_summary: string
  custom_tags: string
  created_at: string
  updated_at: string
}


// Separate axios instance for health endpoints (no /api prefix)
const healthAxios = axios.create({
  baseURL: HEALTH_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

// API Object
export const api = {
  // Health (these endpoints are at root, not under /api)
  getHealth: async (): Promise<HealthResponse> => {
    const response = await healthAxios.get<HealthResponse>('/health')
    return response.data
  },

  // Configuration
  configureDDN: async (config: StorageConfig & { endpoint_url: string }) => {
    const response = await axiosInstance.post('/config/ddn', config)
    return response.data
  },

  configureAWS: async (config: StorageConfig) => {
    const response = await axiosInstance.post('/config/aws', config)
    return response.data
  },

  testConnection: async (provider: 'aws' | 'ddn_infinia'): Promise<ConnectionTestResponse> => {
    const response = await axiosInstance.get<ConnectionTestResponse>(`/config/test/${provider}`)
    return response.data
  },

  loadConfig: async () => {
    const response = await axiosInstance.get('/config/load')
    return response.data
  },

  // Local Cache Configuration
  configureLocalCache: async (config: { enabled: boolean; videos_path: string; embeddings_path: string }) => {
    const response = await axiosInstance.post('/config/local-cache', config)
    return response.data
  },

  getLocalCacheConfig: async () => {
    const response = await axiosInstance.get('/config/local-cache')
    return response.data
  },

  // Upload
  uploadImage: async (file: File, customCaption?: string, customTags?: string): Promise<ImageUploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (customCaption) formData.append('custom_caption', customCaption)
    if (customTags) formData.append('custom_tags', customTags)

    const response = await fetch(`${API_BASE}/upload/image`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw new Error('Upload failed')
    return response.json()
  },

  uploadVideo: async (file: File, customSummary?: string): Promise<VideoUploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (customSummary) formData.append('custom_summary', customSummary)

    const response = await fetch(`${API_BASE}/upload/video`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw new Error('Upload failed')
    return response.json()
  },

  uploadDocument: async (file: File, customSummary?: string, customTags?: string): Promise<DocumentUploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (customSummary) formData.append('custom_summary', customSummary)
    if (customTags) formData.append('custom_tags', customTags)

    const response = await fetch(`${API_BASE}/upload/document`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw new Error('Upload failed')
    return response.json()
  },

  // Search
  search: async (query: string, modality: string = 'all', topK: number = 20, threshold: number = 0.30): Promise<SearchResponse> => {
    const response = await axiosInstance.post<SearchResponse>('/search/', {
      query,
      modality,
      top_k: topK,
      threshold
    })
    return response.data
  },

  // Browse
  browse: async (modality: string = 'all', prefix: string = ''): Promise<BrowseResponse> => {
    const response = await axiosInstance.post<BrowseResponse>('/browse/', {
      modality,
      prefix,
    })
    return response.data
  },

  deleteObject: async (objectKey: string) => {
    const response = await axiosInstance.delete(`/browse/${objectKey}`)
    return response.data
  },

  // Metrics (this endpoint is at root, not under /api)
  getMetrics: async (): Promise<MetricsResponse> => {
    const response = await healthAxios.get<MetricsResponse>('/metrics')
    return response.data
  },

  // Async Video Processing
  uploadVideoAsync: async (file: File, customSummary?: string, customTags?: string): Promise<VideoUploadAsyncResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (customSummary) formData.append('custom_summary', customSummary)
    if (customTags) formData.append('custom_tags', customTags)

    const response = await fetch(`${API_BASE}/upload/video-async`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw new Error('Async upload failed')
    return response.json()
  },

  getProcessingStatus: async (assetId: string): Promise<ProcessingStatusResponse> => {
    const response = await axiosInstance.get<ProcessingStatusResponse>(`/upload/status/${assetId}`)
    return response.data
  },

  getAssetManifest: async (assetId: string): Promise<AssetManifest> => {
    const response = await axiosInstance.get<AssetManifest>(`/upload/manifest/${assetId}`)
    return response.data
  },

  // Update video manifest metadata
  updateVideoManifest: async (
    assetId: string,
    videoSummary: string,
    detectedObjects: string,
    customTags: string,
    customSummary: string,
    enrichedTags?: string  // optional: comma-separated LLM search tags
  ): Promise<{ success: boolean; message: string; manifest: AssetManifest }> => {
    const body: Record<string, string> = {
      video_summary: videoSummary,
      detected_objects: detectedObjects,
      custom_tags: customTags,
      custom_summary: customSummary
    }
    if (enrichedTags !== undefined) {
      body.enriched_tags = enrichedTags
    }
    const response = await axiosInstance.put(`/upload/manifest/${assetId}`, body)
    return response.data
  },

  // Get video stream URL
  getVideoStreamUrl: (objectKey: string): string => {
    return `${API_BASE}/browse/video-stream/${objectKey}`
  },

  // Continuous Ingestion
  startMonitoring: async (bucketName: string) => {
    const response = await axiosInstance.post('/ingestion/start', null, {
      params: { bucket_name: bucketName }
    })
    return response.data
  },

  stopMonitoring: async () => {
    const response = await axiosInstance.post('/ingestion/stop')
    return response.data
  },

  getMonitoringStatus: async () => {
    const response = await axiosInstance.get('/ingestion/status')
    return response.data
  },

  clearMonitoringHistory: async () => {
    const response = await axiosInstance.post('/ingestion/clear')
    return response.data
  },
}

export default axiosInstance
