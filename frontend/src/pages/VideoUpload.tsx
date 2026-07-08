import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, Video, CheckCircle, XCircle, Clock, Loader2, Tag, FileText, Film, Sparkles, Database, Edit, Save, Play } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api, VideoUploadAsyncResponse, AssetManifest } from '../services/api'

interface UploadedVideo {
    asset_id: string
    filename: string
    task_id: string
    upload_time: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    manifest?: AssetManifest
    error?: string
}

const VideoUpload: React.FC = () => {
    const [isDragging, setIsDragging] = useState(false)
    const [customSummary, setCustomSummary] = useState('')
    const [customTags, setCustomTags] = useState('')
    const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>(() => {
        // Load from localStorage on initial mount
        const saved = localStorage.getItem('videoUploadHistory')
        return saved ? JSON.parse(saved) : []
    })
    const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
    const [editingVideo, setEditingVideo] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<{
        videoSummary: string
        detectedObjects: string
        enrichedTags: string
        customTags: string
        customSummary: string
    }>({ videoSummary: '', detectedObjects: '', enrichedTags: '', customTags: '', customSummary: '' })
    const [isSaving, setIsSaving] = useState(false)
    const [showLlmBadge, setShowLlmBadge] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const pollingIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

    // Save to localStorage whenever uploadedVideos changes
    useEffect(() => {
        localStorage.setItem('videoUploadHistory', JSON.stringify(uploadedVideos))
    }, [uploadedVideos])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            pollingIntervalsRef.current.forEach(interval => clearInterval(interval))
            pollingIntervalsRef.current.clear()
        }
    }, [])

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            return await api.uploadVideoAsync(file, customSummary, customTags)
        },
        onSuccess: (data: VideoUploadAsyncResponse) => {
            toast.success(`Upload started: ${data.filename}`)

            // Add to upload list
            const newVideo: UploadedVideo = {
                asset_id: data.asset_id,
                filename: data.filename,
                task_id: data.task_id,
                upload_time: new Date().toISOString(),
                status: 'pending'
            }

            setUploadedVideos(prev => [newVideo, ...prev])

            // Start polling for this video
            startPolling(data.asset_id)

            // Reset form
            setCustomSummary('')
            setCustomTags('')
        },
        onError: (error) => {
            toast.error(`Upload failed: ${error.message}`)
        }
    })

    const startPolling = (assetId: string) => {
        // Don't start if already polling
        if (pollingIntervalsRef.current.has(assetId)) return

        const interval = setInterval(async () => {
            try {
                const status = await api.getProcessingStatus(assetId)

                setUploadedVideos(prev => prev.map(video =>
                    video.asset_id === assetId
                        ? { ...video, status: status.status, error: status.processing_error }
                        : video
                ))

                // If completed or failed, stop polling and fetch manifest
                if (status.status === 'completed' || status.status === 'failed') {
                    clearInterval(interval)
                    pollingIntervalsRef.current.delete(assetId)

                    if (status.status === 'completed') {
                        try {
                            const manifest = await api.getAssetManifest(assetId)
                            setUploadedVideos(prev => prev.map(video =>
                                video.asset_id === assetId
                                    ? { ...video, manifest }
                                    : video
                            ))
                            toast.success(`Processing complete for ${manifest.filename}`)
                        } catch (err) {
                            console.error('Failed to fetch manifest:', err)
                        }
                    } else {
                        toast.error(`Processing failed: ${status.processing_error}`)
                    }
                }
            } catch (error) {
                console.error('Status polling error:', error)
            }
        }, 2000) // Poll every 2 seconds

        pollingIntervalsRef.current.set(assetId, interval)
    }

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setIsDragging(false)

        const files = Array.from(e.dataTransfer.files)
        const videoFile = files.find(f => f.type.startsWith('video/'))

        if (videoFile) {
            uploadMutation.mutate(videoFile)
        } else {
            toast.error('Please drop a valid video file')
        }
    }, [uploadMutation])


    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending':
                return <Clock className="w-5 h-5 text-yellow-500" />
            case 'processing':
                return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            case 'completed':
                return <CheckCircle className="w-5 h-5 text-green-500" />
            case 'failed':
                return <XCircle className="w-5 h-5 text-red-500" />
            default:
                return null
        }
    }

    const formatDuration = (seconds?: number) => {
        if (!seconds) return 'N/A'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const formatDate = (isoString: string) => {
        return new Date(isoString).toLocaleString()
    }

    const clearHistory = () => {
        if (confirm('Are you sure you want to clear all upload history?')) {
            setUploadedVideos([])
            localStorage.removeItem('videoUploadHistory')
            // Clear all polling intervals
            pollingIntervalsRef.current.forEach(interval => clearInterval(interval))
            pollingIntervalsRef.current.clear()
            setSelectedVideo(null)
            setEditingVideo(null)
        }
    }

    const startEditing = (video: UploadedVideo) => {
        if (!video.manifest) return
        setEditingVideo(video.asset_id)
        const enrichedTagsRaw = (video.manifest as any).enriched_tags
        const enrichedTagsStr = Array.isArray(enrichedTagsRaw)
            ? enrichedTagsRaw.join(', ')
            : (typeof enrichedTagsRaw === 'string' ? enrichedTagsRaw : '')
        setEditForm({
            videoSummary: video.manifest.video_summary || '',
            detectedObjects: video.manifest.detected_objects || '',
            enrichedTags: enrichedTagsStr,
            customTags: video.manifest.custom_tags || '',
            customSummary: video.manifest.custom_summary || ''
        })
    }

    const cancelEditing = () => {
        setEditingVideo(null)
        setEditForm({ videoSummary: '', detectedObjects: '', enrichedTags: '', customTags: '', customSummary: '' })
    }

    const saveMetadata = async (assetId: string) => {
        setIsSaving(true)
        try {
            const result = await api.updateVideoManifest(
                assetId,
                editForm.videoSummary,
                editForm.detectedObjects,
                editForm.customTags,
                editForm.customSummary,
                editForm.enrichedTags  // pass updated enriched tags
            )

            // Update local state with new manifest
            setUploadedVideos(prev => prev.map(v =>
                v.asset_id === assetId ? { ...v, manifest: result.manifest } : v
            ))

            toast.success('Metadata updated successfully!')
            setEditingVideo(null)
        } catch (error: any) {
            toast.error(`Failed to update: ${error.message}`)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-neutral-950 dark:to-neutral-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-2">
                        Media Intelligence
                    </h1>
                    <p className="text-neutral-600 dark:text-neutral-400">
                        Upload videos, images, and documents for AI-powered analysis with intelligent metadata extraction sitting on top of DDN Data Intelligence Platform.
                    </p>
                </div>

                {/* Upload Section */}
                <div className="grid lg:grid-cols-2 gap-6 mb-8">
                    {/* Drag & Drop Area */}
                    <div
                        onDragOver={(e) => {
                            e.preventDefault()
                            setIsDragging(true)
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
              relative border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer
              ${isDragging
                                ? 'border-green-600 bg-green-50 dark:bg-green-950/20'
                                : 'border-neutral-300 dark:border-neutral-700 hover:border-green-500 dark:hover:border-green-600'
                            }
              ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}
            `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*,image/*,.pdf"
                            onChange={(e) => {
                                const files = e.target.files
                                if (files && files.length > 0) {
                                    uploadMutation.mutate(files[0])
                                }
                            }}
                            className="hidden"
                        />

                        <div className="flex flex-col items-center text-center">
                            {uploadMutation.isPending ? (
                                <>
                                    <Loader2 className="w-16 h-16 text-green-600 animate-spin mb-4" />
                                    <p className="text-lg font-medium text-neutral-700 dark:text-neutral-300">
                                        Uploading video...
                                    </p>
                                    <p className="text-sm text-neutral-500 mt-2">
                                        Processing will start automatically
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="text-center">
                                        <Upload className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
                                        <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                                            Drag & drop your media file here
                                        </p>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                                            or click to browse
                                        </p>
                                        <div className="flex flex-wrap justify-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
                                            <span className="px-3 py-1.5 bg-ddn-red/10 text-ddn-red border border-ddn-red/30 rounded font-semibold">Videos: MP4, AVI, MOV</span>
                                            <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">Images: JPG, PNG, GIF</span>
                                            <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded">Documents: PDF</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Custom Metadata Form */}
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-neutral-800 rounded-2xl p-6 shadow-sm border border-neutral-200 dark:border-neutral-700">
                            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4 text-neutral-800 dark:text-neutral-200">
                                <Sparkles className="w-5 h-5 text-green-600" />
                                Custom Metadata (Optional)
                            </h3>

                            <div className="space-y-4">
                                {/* Custom Summary */}
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                                        <FileText className="w-4 h-4" />
                                        Custom Summary
                                    </label>
                                    <textarea
                                        value={customSummary}
                                        onChange={(e) => setCustomSummary(e.target.value)}
                                        placeholder="e.g., Product demo showing new features..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                                    />
                                </div>

                                {/* Custom Tags */}
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                                        <Tag className="w-4 h-4" />
                                        Custom Tags
                                    </label>
                                    <input
                                        type="text"
                                        value={customTags}
                                        onChange={(e) => setCustomTags(e.target.value)}
                                        placeholder="e.g., product, demo, tutorial"
                                        className="w-full px-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:ring-2 focus:ring-green-600 focus:border-transparent transition-all"
                                    />
                                    <p className="mt-2 text-xs text-neutral-500">
                                        Separate tags with commas
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Info Cards */}
                        <div className="space-y-3">
                            {/* INFINIA Storage Info */}
                            <div className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-[#ED2738]/10 dark:to-[#FE3546]/10 rounded-2xl p-4 border border-pink-200 dark:border-[#ED2738]/30" style={{ backgroundColor: 'rgba(254, 53, 70, 0.05)' }}>
                                <h4 className="font-semibold text-sm text-[#ED2738] dark:text-[#FE3546] mb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" /> INFINIA Object Storage
                                </h4>
                                <ul className="text-xs text-[#ED2738]/80 dark:text-[#FE3546]/90 space-y-1.5">
                                    <li className="flex items-start gap-2">
                                        <span className="text-[#ED2738] dark:text-[#FE3546] font-bold mt-0.5">•</span>
                                        <span><strong>Raw video</strong> stored in <code className="px-1 py-0.5 bg-pink-100 dark:bg-[#ED2738]/20 rounded text-xs">media/raw/</code></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-[#ED2738] dark:text-[#FE3546] font-bold mt-0.5">•</span>
                                        <span><strong>Video chunks</strong> (10s segments) in <code className="px-1 py-0.5 bg-pink-100 dark:bg-[#ED2738]/20 rounded text-xs">media/derived/chunks/</code></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-[#ED2738] dark:text-[#FE3546] font-bold mt-0.5">•</span>
                                        <span><strong>Keyframes</strong> (extracted frames @ 1 FPS) in <code className="px-1 py-0.5 bg-pink-100 dark:bg-[#ED2738]/20 rounded text-xs">media/derived/keyframes/</code></span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-[#ED2738] dark:text-[#FE3546] font-bold mt-0.5">•</span>
                                        <span><strong>Manifest JSON</strong> with metadata in <code className="px-1 py-0.5 bg-pink-100 dark:bg-[#ED2738]/20 rounded text-xs">media/derived/manifests/</code></span>
                                    </li>
                                </ul>
                            </div>

                            {/* AI Processing Info */}
                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-2xl p-4 border border-green-200 dark:border-green-800">
                                <h4 className="font-semibold text-sm text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" /> AI Analysis Pipeline
                                </h4>
                                <ul className="text-xs text-green-700 dark:text-green-300 space-y-1.5">
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">•</span>
                                        <span><strong>Image captioning</strong> using BLIP model for each keyframe</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">•</span>
                                        <span><strong>Object detection</strong> identifies elements (people, vehicles, landmarks)</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">•</span>
                                        <span><strong>Semantic embeddings</strong> for searchability</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">•</span>
                                        <span><strong>Background processing</strong> - no waiting required!</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Upload History */}
                {uploadedVideos.length > 0 && (
                    <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                                <Film className="w-6 h-6 text-green-600" />
                                Processing Queue
                            </h2>
                            <button
                                onClick={clearHistory}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                            >
                                <XCircle className="w-4 h-4" />
                                Clear History
                            </button>
                        </div>

                        <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                            {uploadedVideos.map((video) => (
                                <div
                                    key={video.asset_id}
                                    className={`p-6 transition-all hover:bg-neutral-50 dark:hover:bg-neutral-750 cursor-pointer ${selectedVideo === video.asset_id ? 'bg-green-50 dark:bg-green-950/20' : ''
                                        }`}
                                    onClick={() => setSelectedVideo(
                                        selectedVideo === video.asset_id ? null : video.asset_id
                                    )}
                                >
                                    {/* Video Header */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-start gap-3 flex-1">
                                            {getStatusIcon(video.status)}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                                                    {video.filename}
                                                </h3>
                                                <p className="text-sm text-neutral-500 mt-1">
                                                    {formatDate(video.upload_time)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`
                      px-3 py-1 rounded-full text-xs font-medium uppercase
                      ${video.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' : ''}
                      ${video.status === 'processing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : ''}
                      ${video.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' : ''}
                      ${video.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : ''}
                    `}>
                                            {video.status}
                                        </span>

                                        {/* Action Buttons */}
                                        {video.status === 'completed' && video.manifest && (
                                            <>
                                                {editingVideo === video.asset_id ? (
                                                    <>
                                                        <button
                                                            onClick={() => saveMetadata(video.asset_id)}
                                                            disabled={isSaving}
                                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30 rounded transition-colors disabled:opacity-50"
                                                        >
                                                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={cancelEditing}
                                                            disabled={isSaving}
                                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors disabled:opacity-50"
                                                        >
                                                            <XCircle className="w-3 h-3" />
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); startEditing(video) }}
                                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded transition-colors"
                                                            title="Edit metadata"
                                                        >
                                                            <Edit className="w-3 h-3" />
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setSelectedVideo(selectedVideo === video.asset_id ? null : video.asset_id) }}
                                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 rounded transition-colors"
                                                            title="Play video"
                                                        >
                                                            <Play className="w-3 h-3" />
                                                            Play
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {/* Error Message */}
                                    {video.error && (
                                        <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                                            <p className="text-sm text-red-700 dark:text-red-300">
                                                <strong>Error:</strong> {video.error}
                                            </p>
                                        </div>
                                    )}

                                    {/* Expanded Metadata */}
                                    {selectedVideo === video.asset_id && video.manifest && (
                                        <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-4">
                                            {/* Video Info */}
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3">
                                                    <p className="text-xs text-neutral-500 mb-1">Duration</p>
                                                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                                                        {formatDuration(video.manifest.duration_seconds)}
                                                    </p>
                                                </div>
                                                <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3">
                                                    <p className="text-xs text-neutral-500 mb-1">Resolution</p>
                                                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                                                        {video.manifest.width}x{video.manifest.height}
                                                    </p>
                                                </div>
                                                <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3">
                                                    <p className="text-xs text-neutral-500 mb-1">Chunks</p>
                                                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                                                        {video.manifest.total_chunks}
                                                    </p>
                                                </div>
                                                <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3">
                                                    <p className="text-xs text-neutral-500 mb-1">Keyframes</p>
                                                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                                                        {video.manifest.total_keyframes}
                                                    </p>
                                                </div>
                                                {(video.manifest as any).ingestion_time_seconds > 0 && (
                                                    <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
                                                        <p className="text-xs text-green-600 dark:text-green-400 mb-1 flex items-center gap-1">
                                                            <Sparkles className="w-3 h-3" /> AI Process Time
                                                        </p>
                                                        <p className="font-bold text-green-700 dark:text-green-300">
                                                            {(video.manifest as any).ingestion_time_seconds.toFixed(1)}s
                                                        </p>
                                                    </div>
                                                )}
                                            </div>


                                            {/* Video Player */}
                                            {selectedVideo === video.asset_id && (
                                                <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4">
                                                    <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3 flex items-center gap-2">
                                                        <Play className="w-4 h-4 text-green-600" /> Video Playback
                                                    </h4>
                                                    <video
                                                        controls
                                                        className="w-full rounded-lg bg-black"
                                                        style={{ maxHeight: '400px' }}
                                                        src={api.getVideoStreamUrl(video.manifest.raw_object_key)}
                                                    >
                                                        Your browser does not support the video tag.
                                                    </video>
                                                </div>
                                            )}

                                            {/* INFINIA Storage Paths */}
                                            <div className="bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg p-4 border border-green-200/50 dark:border-green-800/50">
                                                <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                                                    <Database className="w-4 h-4" /> INFINIA Storage Locations
                                                </h4>
                                                <div className="space-y-2 text-xs">
                                                    <div>
                                                        <span className="text-neutral-600 dark:text-neutral-400">Raw Video:</span>
                                                        <code className="block mt-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-900 rounded text-neutral-800 dark:text-neutral-200 break-all">
                                                            media/raw/{video.asset_id}/{video.filename}
                                                        </code>
                                                    </div>
                                                    <div>
                                                        <span className="text-neutral-600 dark:text-neutral-400">Chunks ({video.manifest.total_chunks}):</span>
                                                        <code className="block mt-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-900 rounded text-neutral-800 dark:text-neutral-200 break-all">
                                                            media/derived/chunks/{video.asset_id}/chunk_*.mp4
                                                        </code>
                                                    </div>
                                                    <div>
                                                        <span className="text-neutral-600 dark:text-neutral-400">Keyframes ({video.manifest.total_keyframes}):</span>
                                                        <code className="block mt-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-900 rounded text-neutral-800 dark:text-neutral-200 break-all">
                                                            media/derived/keyframes/{video.asset_id}/frame_*.jpg
                                                        </code>
                                                    </div>
                                                    <div>
                                                        <span className="text-neutral-600 dark:text-neutral-400">Manifest:</span>
                                                        <code className="block mt-1 px-2 py-1 bg-neutral-100 dark:bg-neutral-900 rounded text-neutral-800 dark:text-neutral-200 break-all">
                                                            media/derived/manifests/{video.asset_id}/manifest_v1.json
                                                        </code>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* AI Summary — shows enriched (AI) or raw (BLIP) */}
                                            {video.manifest.video_summary && (
                                                <div className={`rounded-lg p-4 border ${(video.manifest as any).llm_enriched ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800' : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'}`}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <h4 className={`text-sm font-semibold ${(video.manifest as any).llm_enriched ? 'text-orange-900 dark:text-orange-100' : 'text-blue-900 dark:text-blue-100'}`}>
                                                            AI-Generated Summary
                                                        </h4>
                                                        {(video.manifest as any).llm_enriched && (
                                                            <>
                                                                {/* ✨ Enriched badge */}
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-100">
                                                                    <Sparkles className="w-3 h-3" /> Enriched
                                                                </span>
                                                                {/* Infinia DB badge */}
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200 border border-orange-300 dark:border-orange-700">
                                                                    {/* Database SVG icon */}
                                                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <ellipse cx="12" cy="5" rx="9" ry="3"/>
                                                                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                                                                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                                                                    </svg>
                                                                    Infinia
                                                                </span>
                                                                {/* Provider toggle button + badge */}
                                                                {(video.manifest as any).llm_provider_used && (
                                                                    <>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); setShowLlmBadge(v => !v); }}
                                                                            title={showLlmBadge ? 'Hide LLM provider' : 'Show LLM provider'}
                                                                            className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold border transition-colors ml-1 ${
                                                                                showLlmBadge
                                                                                    ? 'bg-neutral-300 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200 border-neutral-400'
                                                                                    : 'bg-transparent text-neutral-400 dark:text-neutral-500 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                                                                            }`}
                                                                        >ⓘ</button>
                                                                        {showLlmBadge && (
                                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 ml-auto">
                                                                                via {(video.manifest as any).llm_provider_used === 'openai' ? '🌐 OpenAI' : '🖥 Ollama'}
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </>
                                                        )}

                                                    </div>
                                                    {editingVideo === video.asset_id ? (
                                                        <textarea
                                                            value={editForm.videoSummary}
                                                            onChange={(e) => setEditForm(prev => ({ ...prev, videoSummary: e.target.value }))}
                                                            onClick={(e) => e.stopPropagation()}
                                                            rows={3}
                                                            className="w-full px-3 py-2 text-sm rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-orange-500"
                                                        />
                                                    ) : (
                                                        <p className={`text-sm ${(video.manifest as any).llm_enriched ? 'text-orange-900 dark:text-orange-100' : 'text-blue-800 dark:text-blue-200'}`}>
                                                            {video.manifest.video_summary}
                                                        </p>
                                                    )}
                                                    {/* Scene context + key events */}
                                                    {(video.manifest as any).llm_enriched && (
                                                        <div className="mt-3 flex flex-wrap gap-2 items-center">
                                                            {(video.manifest as any).scene_type && (
                                                                <span className="px-2 py-1 rounded-md text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 font-medium">
                                                                    📍 {(video.manifest as any).scene_type.replace(/_/g, ' ')}
                                                                </span>
                                                            )}
                                                            {((video.manifest as any).key_events || []).slice(0, 3).map((ev: string, i: number) => (
                                                                <span key={i} className="px-2 py-1 rounded-md text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300">
                                                                    ⚡ {ev}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {/* Search-optimized tags */}
                                                    {(video.manifest as any).llm_enriched && ((video.manifest as any).enriched_tags || []).length > 0 && (
                                                        <div className="mt-3">
                                                            <p className="text-xs text-orange-600 dark:text-orange-400 mb-1.5 font-medium">Search Tags</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {((video.manifest as any).enriched_tags as string[]).map((tag, i) => (
                                                                    <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-100">
                                                                        #{tag}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}



                                            {/* Custom Summary - Editable */}
                                            {video.manifest.custom_summary && (
                                                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-800">
                                                    <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
                                                        Custom Summary
                                                    </h4>
                                                    {editingVideo === video.asset_id ? (
                                                        <textarea
                                                            value={editForm.customSummary}
                                                            onChange={(e) => setEditForm(prev => ({ ...prev, customSummary: e.target.value }))}
                                                            onClick={(e) => e.stopPropagation()}
                                                            rows={3}
                                                            className="w-full px-3 py-2 text-sm rounded-lg border border-green-300 dark:border-green-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-green-500"
                                                        />
                                                    ) : (
                                                        <p className="text-sm text-green-800 dark:text-green-200">
                                                            {video.manifest.custom_summary}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Tags — prefer LLM search tags when enriched */}
                                            <div className="grid md:grid-cols-2 gap-4">
                                                {(() => {
                                                    const enrichedTags: string[] = Array.isArray((video.manifest as any).enriched_tags)
                                                        ? (video.manifest as any).enriched_tags
                                                        : [];
                                                    const rawTagStr = video.manifest.detected_objects || '';
                                                    const rawTags = rawTagStr.split(',').map((t: string) => t.trim()).filter(Boolean);
                                                    const isEnriched = enrichedTags.length > 0;
                                                    const hasTags = isEnriched ? true : rawTags.length > 0;

                                                    return hasTags ? (
                                                        <div>
                                                            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                                                                {isEnriched ? 'AI Search Tags' : 'AI-Detected Objects'}
                                                            </h4>
                                                            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                                                                {isEnriched
                                                                    ? 'Semantic search tags generated by LLM for precise filtering'
                                                                    : 'Objects identified in video keyframes for semantic search and filtering'}
                                                            </p>
                                                            {editingVideo === video.asset_id ? (
                                                                <input
                                                                    type="text"
                                                                    value={isEnriched ? editForm.enrichedTags : editForm.detectedObjects}
                                                                    onChange={(e) => setEditForm(prev => isEnriched
                                                                        ? { ...prev, enrichedTags: e.target.value }
                                                                        : { ...prev, detectedObjects: e.target.value }
                                                                    )}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    placeholder={isEnriched ? "e.g., #office, #business meeting, #teamwork" : "e.g., car, road, trees"}
                                                                    className={`w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 ${isEnriched ? 'border-orange-300 focus:ring-orange-400' : 'border-neutral-300 dark:border-neutral-600 focus:ring-green-500'}`}
                                                                />
                                                            ) : (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {(isEnriched ? enrichedTags : rawTags).map((tag: string, idx: number) => (
                                                                        <span
                                                                            key={idx}
                                                                            className={`px-2 py-1 rounded-md text-xs ${
                                                                                isEnriched
                                                                                    ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                                                                    : 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300'
                                                                            }`}
                                                                        >
                                                                            {isEnriched ? `#${tag.replace(/^#/, '')}` : tag}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : null;
                                                })()}

                                                {video.manifest.custom_tags && (
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                                                            Custom Tags
                                                        </h4>
                                                        {editingVideo === video.asset_id ? (
                                                            <input
                                                                type="text"
                                                                value={editForm.customTags}
                                                                onChange={(e) => setEditForm(prev => ({ ...prev, customTags: e.target.value }))}
                                                                onClick={(e) => e.stopPropagation()}
                                                                placeholder="e.g., demo, product, tutorial"
                                                                className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-green-500"
                                                            />
                                                        ) : (
                                                            <div className="flex flex-wrap gap-2">
                                                                {video.manifest.custom_tags.split(',').map((tag, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className="px-2 py-1 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 rounded-md text-xs"
                                                                    >
                                                                        {tag.trim()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {uploadedVideos.length === 0 && (
                    <div className="text-center py-12 bg-white dark:bg-neutral-800 rounded-2xl border-2 border-dashed border-neutral-300 dark:border-neutral-700">
                        <Video className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
                        <p className="text-neutral-600 dark:text-neutral-400">
                            No media files uploaded yet. Start by uploading your first file above.
                        </p>
                    </div>
                )}
            </div>
        </div >
    )
}

export default VideoUpload
