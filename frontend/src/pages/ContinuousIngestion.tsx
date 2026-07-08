import { useState, useEffect } from 'react'
import { Play, Square, RefreshCw, Server, CheckCircle, XCircle, X, Loader2, Image as ImageIcon, Video, FileText, Trash2 } from 'lucide-react'
import { api } from '../services/api'

export default function ContinuousIngestion() {
    const [bucketName, setBucketName] = useState('')
    const [monitoringStatus, setMonitoringStatus] = useState('Monitoring not started. Enter a bucket name and click Start.')
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [processedFiles, setProcessedFiles] = useState<string[]>([])
    const [processedVideos, setProcessedVideos] = useState<any[]>([])  // Track recent videos
    const [playingVideo, setPlayingVideo] = useState<string | null>(null)  // Track which video is playing
    const [currentFile, setCurrentFile] = useState('')
    const [lastCheck, setLastCheck] = useState('')

    // Fetch current configuration to get DDN bucket name
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await api.loadConfig()
                // Priority: savedBucket from localStorage > config from API
                const savedBucket = localStorage.getItem('continuous_ingestion_bucket')
                if (savedBucket) {
                    setBucketName(savedBucket)
                } else if (config?.ddn?.bucket_name && config.ddn.configured) {
                    // Auto-populate from DDN configuration
                    setBucketName(config.ddn.bucket_name)
                }
            } catch (error) {
                console.error('Failed to load configuration:', error)
            }
        }

        fetchConfig()
    }, [])

    // SSE connection for real-time updates
    useEffect(() => {
        if (!isMonitoring) {
            setCurrentFile('')
            return
        }

        const eventSource = new EventSource('/api/ingestion/stream')

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)

                if (data.error) {
                    console.error('SSE error:', data.error)
                    return
                }

                // Update current file being processed
                if (data.file) {
                    setCurrentFile(data.file)
                }

                // Handle completion
                if (data.status === 'completed') {
                    setMonitoringStatus(prev =>
                        prev + `\n✅ Completed: ${data.file} (${data.file_type})`
                    )
                    setProcessedFiles(prev => [...prev, data.s3_key])
                }

                // Handle errors
                if (data.status === 'error') {
                    setMonitoringStatus(prev =>
                        prev + `\n❌ Error: ${data.file} - ${data.error}`
                    )
                }

                // Handle processing updates
                if (data.status === 'processing') {
                    const fileType = data.file_type || 'file'
                    let preview = ''
                    if (data.caption) preview = `Caption: ${data.caption.substring(0, 50)}...`
                    if (data.summary) preview = `Summary: ${data.summary.substring(0, 50)}...`
                    if (data.text_preview) preview = `Text: ${data.text_preview.substring(0, 50)}...`

                    setMonitoringStatus(prev =>
                        prev + `\n⚙️  Processing ${fileType}: ${data.file}${preview ? ' - ' + preview : ''}`
                    )
                }
            } catch (err) {
                console.error('Failed to parse SSE data:', err)
            }
        }

        eventSource.onerror = () => {
            console.error('SSE connection error')
        }

        return () => {
            eventSource.close()
        }
    }, [isMonitoring])

    const startMonitoring = async () => {
        if (!bucketName) {
            setMonitoringStatus('Please enter a bucket name.')
            return
        }

        localStorage.setItem('continuous_ingestion_bucket', bucketName)

        // Clear any stale state from previous session before starting fresh
        setProcessedFiles([])
        setProcessedVideos([])
        setLastCheck('')
        setCurrentFile('')
        setMonitoringStatus('Starting monitoring...')
        try {
            const result = await api.startMonitoring(bucketName)
            setIsMonitoring(true)
            setMonitoringStatus(`${result.message}\nFiles in 'auto_ingest/' folder will be processed automatically.\n\nPolling every 5 seconds...`)
        } catch (error: any) {
            setMonitoringStatus(`Failed to start monitoring: ${error.response?.data?.detail || error.message}`)
            setIsMonitoring(false)
        }
    }

    const clearHistory = async () => {
        try {
            await api.clearMonitoringHistory()
            setProcessedFiles([])
            setProcessedVideos([])
            setLastCheck('')
            setMonitoringStatus(prev =>
                prev.split('\n')[0] + '\n\nHistory cleared.'
            )
        } catch (error: any) {
            setMonitoringStatus(`Failed to clear history: ${error.response?.data?.detail || error.message}`)
        }
    }

    const stopMonitoring = async () => {
        setMonitoringStatus('Stopping monitoring...')
        try {
            const result = await api.stopMonitoring()
            setIsMonitoring(false)
            setMonitoringStatus(result.message)
            setCurrentFile('')
        } catch (error: any) {
            setMonitoringStatus(`Failed to stop monitoring: ${error.response?.data?.detail || error.message}`)
        }
    }

    const getStatus = async () => {
        setMonitoringStatus('Fetching status...')
        try {
            const status = await api.getMonitoringStatus()
            if (status.monitoring) {
                const lastCheckTime = status.last_check ? new Date(status.last_check).toLocaleTimeString() : 'N/A'
                const filesText = status.processed_files.length > 0
                    ? status.processed_files.map((f: string) => `  • ${f.split('/').pop()}`).join('\n')
                    : '  None yet'

                setMonitoringStatus(
                    `✅ Monitoring active on bucket: ${status.bucket_name}\n` +
                    `\nProcessed files: ${status.processed_files_count}\n` +
                    filesText +
                    `\n\nLast check: ${lastCheckTime}`
                )
                setIsMonitoring(true)
                setProcessedFiles(status.processed_files)
                setProcessedVideos(status.processed_videos || [])  // Update video history
                setLastCheck(lastCheckTime)
            } else {
                setMonitoringStatus('Monitoring is not active.')
                setIsMonitoring(false)
            }
        } catch (error: any) {
            setMonitoringStatus(`Failed to get status: ${error.response?.data?.detail || error.message}`)
        }
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="section-header">
                <div className="flex items-center gap-3">
                    <h2 className="section-title">Continuous Ingestion</h2>
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isMonitoring
                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        {isMonitoring ? 'Active' : 'Inactive'}
                    </span>
                </div>
                <p className="section-description">
                    Configure automatic multimodal document processing when files are uploaded to DDN INFINIA buckets.
                </p>
            </div>

            {/* Main Card */}
            <div className="card p-6 space-y-6">
                {/* Bucket Configuration */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-ddn-red/10 flex items-center justify-center">
                            <Server className="w-4 h-4 text-ddn-red" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-text-primary">Bucket Monitoring</h3>
                            <p className="text-xs text-text-muted">Watch for new multimodal files automatically</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
                            DDN INFINIA Bucket
                        </label>
                        <input
                            type="text"
                            value={bucketName}
                            onChange={(e) => setBucketName(e.target.value)}
                            placeholder="infinia-test-bucket-01"
                            className="input-field"
                            disabled={isMonitoring}
                        />
                        <p className="text-xs text-text-muted mt-2">
                            Files in <code className="px-1.5 py-0.5 bg-surface-secondary rounded text-xs">auto_ingest/</code> folder will be processed automatically
                        </p>
                    </div>

                    {/* File Type Support */}
                    <div className="flex items-center gap-4 p-3 bg-surface-secondary rounded-lg">
                        <div className="flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4" style={{ color: '#9333EA' }} />
                            <span className="text-xs font-medium" style={{ color: '#9333EA' }}>Images</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Video className="w-4 h-4" style={{ color: '#DC2626' }} />
                            <span className="text-xs font-medium" style={{ color: '#DC2626' }}>Videos</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <FileText className="w-4 h-4" style={{ color: '#2563EB' }} />
                            <span className="text-xs font-medium" style={{ color: '#2563EB' }}>Documents</span>
                        </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={startMonitoring}
                            disabled={isMonitoring || !bucketName}
                            className="btn-primary flex items-center gap-2"
                        >
                            <Play className="w-4 h-4" />
                            Start
                        </button>
                        <button
                            onClick={stopMonitoring}
                            disabled={!isMonitoring}
                            className="btn-secondary flex items-center gap-2 border-red-200 text-red-600 hover:border-red-300 dark:border-red-900 dark:text-red-400"
                        >
                            <Square className="w-4 h-4" />
                            Stop
                        </button>
                        <button
                            onClick={getStatus}
                            className="btn-secondary flex items-center gap-2 ml-auto"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Status
                        </button>
                        {(processedFiles.length > 0 || processedVideos.length > 0) && (
                            <button
                                onClick={clearHistory}
                                className="btn-secondary flex items-center gap-2 border-orange-200 text-orange-600 hover:border-orange-300 dark:border-orange-900 dark:text-orange-400"
                                title="Clear processed file history"
                            >
                                <Trash2 className="w-4 h-4" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Status Display */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-text-muted uppercase tracking-wide">
                            Status
                        </div>
                        {currentFile && (
                            <div className="flex items-center gap-2 text-xs text-text-secondary">
                                <Loader2 className="w-3 h-3 animate-spin text-ddn-red" />
                                Processing: <span className="font-medium">{currentFile}</span>
                            </div>
                        )}
                    </div>
                    <div className="bg-surface-secondary rounded-lg p-4 font-mono text-xs whitespace-pre-wrap max-h-80 overflow-y-auto border border-border-subtle">
                        {monitoringStatus}
                    </div>
                </div>

                {/* Summary Stats */}
                {isMonitoring && (
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border-subtle">
                        <div className="text-center p-3 bg-surface-secondary rounded-lg">
                            <div className="text-2xl font-bold text-ddn-red">{processedFiles.length}</div>
                            <div className="text-xs text-text-muted mt-1">Files Processed</div>
                        </div>
                        <div className="text-center p-3 bg-surface-secondary rounded-lg">
                            <div className="flex items-center justify-center gap-1.5">
                                {isMonitoring ? (
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-gray-400" />
                                )}
                            </div>
                            <div className="text-xs text-text-muted mt-1">Monitoring</div>
                        </div>
                        <div className="text-center p-3 bg-surface-secondary rounded-lg">
                            <div className="text-sm font-medium text-text-primary">{lastCheck || 'N/A'}</div>
                            <div className="text-xs text-text-muted mt-1">Last Check</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Recent Videos */}
            {processedVideos.length > 0 && (
                <div className="card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Video className="w-4 h-4 text-ddn-red" />
                            Recent Videos
                        </h3>
                        <span className="text-xs text-text-muted">{processedVideos.length} video{processedVideos.length !== 1 ? 's' : ''}</span>
                    </div>

                    <div className="space-y-3">
                        {processedVideos.slice().reverse().map((video: any, idx: number) => (
                            <div key={idx} className="p-3 bg-surface-secondary rounded-lg border border-border-subtle hover:border-ddn-red/30 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-start gap-3">
                                        <button
                                            onClick={() => setPlayingVideo(playingVideo === video.s3_key ? null : video.s3_key)}
                                            className="p-1.5 rounded bg-ddn-red/10 hover:bg-ddn-red/20 text-ddn-red transition-colors flex-shrink-0"
                                            title="Play video"
                                        >
                                            {playingVideo === video.s3_key ? (
                                                <X className="w-4 h-4" />
                                            ) : (
                                                <Video className="w-4 h-4" />
                                            )}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <h4 className="text-sm font-medium text-text-primary truncate">{video.filename}</h4>
                                                <span className="text-xs text-text-muted whitespace-nowrap">
                                                    {new Date(video.upload_time).toLocaleTimeString()}
                                                </span>
                                            </div>

                                            {video.video_summary && (
                                                <p className="text-xs text-text-secondary mb-2 line-clamp-2">
                                                    {video.video_summary}
                                                </p>
                                            )}

                                            {video.detected_objects && (
                                                <div className="flex flex-wrap gap-1">
                                                    {video.detected_objects.split(',').slice(0, 5).map((tag: string, tagIdx: number) => (
                                                        <span
                                                            key={tagIdx}
                                                            className="px-2 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded text-xs dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                                                        >
                                                            {tag.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Video Player */}
                                    {playingVideo === video.s3_key && (
                                        <div className="rounded-lg overflow-hidden bg-black">
                                            <video
                                                className="w-full max-h-96"
                                                controls
                                                autoPlay
                                                src={`/api/browse/video-stream/${encodeURIComponent(video.s3_key)}`}
                                            >
                                                Your browser does not support the video tag.
                                            </video>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Info Card */}
            <div className="card p-4 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                <div className="flex gap-3">
                    <Server className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">How It Works</h4>
                        <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                            <li>• Upload files to your DDN INFINIA bucket's <code className="px-1 bg-blue-100 dark:bg-blue-900/50 rounded">auto_ingest/</code> folder</li>
                            <li>• The system checks for new files every 5 seconds</li>
                            <li>• Supported formats: Images (.jpg, .png), Videos (.mp4, .avi, .mov), Documents (.pdf)</li>
                            <li>• Files are processed using GPU-accelerated AI models (CLIP, BLIP, ViT)</li>
                            <li>• Processed files are automatically moved to <code className="px-1 bg-blue-100 dark:bg-blue-900/50 rounded">processed/</code> folder</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
