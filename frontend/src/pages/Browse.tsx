import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Image, Video, FileText, Trash2, Loader2, RefreshCw, ExternalLink, Edit, Save, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, ObjectInfo } from '../services/api'

type Modality = 'image' | 'video' | 'document'

export default function BrowsePage() {
  const [modality, setModality] = useState<Modality>('video')
  const queryClient = useQueryClient()

  // Edit state
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    videoSummary: '',
    detectedObjects: '',
    customTags: '',
    customSummary: ''
  })

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [videoToDelete, setVideoToDelete] = useState<{ assetId: string; filename: string; objectKey: string } | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['browse', modality],
    queryFn: () => api.browse(modality),
  })

  const deleteMutation = useMutation({
    mutationFn: async (params: { objectKey: string; assetId?: string; isVideo?: boolean }) => {
      // For videos with asset_id, delete raw video + manifest
      if (params.isVideo && params.assetId) {
        const filesToDelete = [
          params.objectKey, // Raw video
          `media/derived/manifests/${params.assetId}/manifest_v1.json`, // Manifest
        ]

        let deletedCount = 0
        const errors = []

        for (const key of filesToDelete) {
          try {
            await api.deleteObject(key)
            deletedCount++
          } catch (error) {
            errors.push({ key, error })
            console.error(`Failed to delete ${key}:`, error)
          }
        }

        return { deleted_count: deletedCount, errors }
      }

      // Regular single file delete
      return await api.deleteObject(params.objectKey)
    },
    onSuccess: (data) => {
      if (data.deleted_count) {
        toast.success(`Deleted ${data.deleted_count} files successfully`)
      } else {
        toast.success('Object deleted successfully')
      }
      queryClient.invalidateQueries({ queryKey: ['browse'] })
      setShowDeleteModal(false)
      setVideoToDelete(null)
    },
    onError: () => {
      toast.error('Failed to delete object')
    },
  })

  const metricsQuery = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.getMetrics(),
  })

  // Edit functions
  const startEditing = (obj: ObjectInfo) => {
    if (!obj.metadata?.asset_id) return
    const formData = {
      videoSummary: String(obj.metadata?.video_summary || ''),
      detectedObjects: String(obj.metadata?.detected_objects || ''),
      customTags: String(obj.metadata?.custom_tags || ''),
      customSummary: String(obj.metadata?.custom_summary || '')
    }
    setEditingAssetId(String(obj.metadata.asset_id))
    setEditForm(formData)
  }

  const cancelEditing = () => {
    setEditingAssetId(null)
    setEditForm({ videoSummary: '', detectedObjects: '', customTags: '', customSummary: '' })
  }

  const saveMetadata = async (assetId: string) => {
    setIsSaving(true)
    try {
      await api.updateVideoManifest(
        assetId,
        editForm.videoSummary,
        editForm.detectedObjects,
        editForm.customTags,
        editForm.customSummary
      )
      toast.success('Metadata updated successfully!')
      setEditingAssetId(null)
      queryClient.invalidateQueries({ queryKey: ['browse'] })
    } catch (error: any) {
      toast.error(`Failed to update: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const getModalityIcon = (mod: string) => {
    switch (mod) {
      case 'image':
        return <Image className="w-5 h-5 text-ddn-red" />
      case 'video':
        return <Video className="w-5 h-5 text-nvidia-green" />
      case 'document':
        return <FileText className="w-5 h-5 text-status-info" />
      default:
        return <FolderOpen className="w-5 h-5" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  const objects = data?.objects || []

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="section-header">
        <h2 className="section-title">Library</h2>
        <p className="section-description">
          View and manage all uploaded content stored in DDN INFINIA.
        </p>
      </div>

      {/* Stats */}
      {metricsQuery.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="stat-label">Images</div>
            <div className="stat-value">{metricsQuery.data.total_images}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Videos</div>
            <div className="stat-value">{metricsQuery.data.total_videos}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Documents</div>
            <div className="stat-value">{metricsQuery.data.total_documents}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Storage</div>
            <div className="stat-value text-xl">{formatFileSize(metricsQuery.data.total_storage_bytes)}</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar justify-between">
        <div className="flex items-center gap-2">
          {(['video', 'image', 'document'] as Modality[]).map((mod) => (
            <button
              key={mod}
              onClick={() => setModality(mod)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${modality === mod
                ? 'bg-surface-card text-primary border border-subtle shadow-sm'
                : 'text-secondary hover:bg-surface-card'
                }`}
            >
              <span className="flex items-center gap-2">
                {getModalityIcon(mod)}
                {mod.charAt(0).toUpperCase() + mod.slice(1) + 's'}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => refetch()}
          className="btn-secondary"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Content Grid - scrollable area with visible scrollbar */}
      {isLoading ? (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-ddn-red" />
          <p className="text-muted">Loading content...</p>
        </div>
      ) : objects.length > 0 ? (
        <div
          className="scrollbar-styled pr-1"
          style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '300px' }}
        >
        <div className="media-grid">
          {objects.map((obj: ObjectInfo) => (
            <div key={obj.key} className="media-card group">
              {/* Preview */}
              {obj.modality === 'image' ? (
                <img
                  src={`/api/browse/image-stream/${obj.key}`}
                  alt={String(obj.metadata?.caption || 'Image')}
                  className="media-card-image"
                />
              ) : obj.modality === 'video' ? (
                <video
                  controls
                  className="media-card-image"
                  src={`/api/browse/video-stream/${obj.key}`}
                  preload="metadata"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="media-card-image flex items-center justify-center">
                  {getModalityIcon(obj.modality)}
                </div>
              )}

              {/* Hover Actions */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                {obj.presigned_url && (
                  <a
                    href={obj.presigned_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white rounded-lg shadow-md hover:bg-neutral-50"
                  >
                    <ExternalLink className="w-4 h-4 text-neutral-600" />
                  </a>
                )}
                {!!(obj.metadata?.asset_id) && (
                  <button
                    onClick={() => startEditing(obj)}
                    className="p-2 bg-white rounded-lg shadow-md hover:bg-blue-50"
                  >
                    <Edit className="w-4 h-4 text-blue-500" />
                  </button>
                )}
                <button
                  onClick={() => {
                    // Check if this is a video with asset_id for cascading delete
                    const assetId = obj.metadata?.asset_id as string | undefined
                    if (obj.modality === 'video' && assetId) {
                      setVideoToDelete({
                        assetId,
                        filename: obj.key.split('/').pop() || obj.key,
                        objectKey: obj.key
                      })
                      setShowDeleteModal(true)
                    } else {
                      // Direct delete for non-videos or videos without asset_id
                      deleteMutation.mutate({ objectKey: obj.key })
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="p-2 bg-white rounded-lg shadow-md hover:bg-red-50"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-600" />
                  ) : (
                    <Trash2 className="w-4 h-4 text-red-500" />
                  )}
                </button>
              </div>

              {/* Content */}
              <div className="media-card-content">
                <div className="flex items-center gap-2 mb-2">
                  {getModalityIcon(obj.modality)}
                  <span className="badge badge-neutral text-xs capitalize">
                    {obj.modality}
                  </span>
                </div>

                <h4 className="media-card-title">
                  {obj.key.split('/').pop()}
                </h4>

                {obj.metadata?.caption ? (
                  <p className="text-xs text-muted line-clamp-2 mb-2">
                    {String(obj.metadata.caption)}
                  </p>
                ) : null}

                {/* Metadata Section - Detected Objects/Tags */}
                {editingAssetId === obj.metadata?.asset_id ? (
                  <div className="mb-2">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block mb-1">Detected Tags:</label>
                    <textarea
                      value={editForm.detectedObjects}
                      onChange={(e) => setEditForm({ ...editForm, detectedObjects: e.target.value })}
                      className="w-full px-2 py-1 text-xs border rounded"
                      rows={2}
                    />
                  </div>
                ) : (() => {
                  // Prefer LLM search tags when enriched; fall back to BLIP detected_objects
                  const enrichedTags: string[] = Array.isArray((obj.metadata as any)?.enriched_tags)
                    ? (obj.metadata as any).enriched_tags
                    : [];
                  const rawTags = obj.metadata?.detected_objects
                    ? String(obj.metadata.detected_objects).split(',').map((t: string) => t.trim()).filter(Boolean)
                    : [];
                  const displayTags = enrichedTags.length > 0 ? enrichedTags : rawTags;
                  const isEnriched = enrichedTags.length > 0;
                  return displayTags.length > 0 ? (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block mb-1.5">
                        {isEnriched ? 'AI Search Tags:' : 'Detected Tags:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {displayTags.map((tag: string, idx: number) => (
                          <span
                            key={idx}
                            className={`px-2 py-1 rounded-md text-xs font-medium border ${
                              isEnriched
                                ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800'
                                : 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                            }`}
                          >
                            {isEnriched ? `#${tag.replace(/^#/, '')}` : `🏷️ ${tag}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Metadata Section - AI Summary */}
                {editingAssetId === obj.metadata?.asset_id ? (
                  <div className="mb-2">
                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block mb-1">AI Summary:</label>
                    <textarea
                      value={editForm.videoSummary}
                      onChange={(e) => setEditForm({ ...editForm, videoSummary: e.target.value })}
                      className="w-full px-2 py-1 text-xs border rounded"
                      rows={3}
                    />
                  </div>
                ) : obj.metadata?.video_summary ? (
                  <div className="mb-2">
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block mb-1.5">AI Summary:</span>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {String(obj.metadata.video_summary)}
                    </p>
                  </div>
                ) : null}

                {/* Edit Mode - Save/Cancel Buttons */}
                {editingAssetId === obj.metadata?.asset_id && (
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => saveMetadata(String(obj.metadata?.asset_id))}
                      disabled={isSaving}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={isSaving}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 rounded-lg transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Cancel
                    </button>
                  </div>
                )}

                <div className="media-card-meta">
                  <span>{formatFileSize(obj.size_bytes)}</span>
                  <span>•</span>
                  <span>{new Date(obj.last_modified).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
          <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
            No content yet
          </h3>
          <p className="text-muted">
            Upload images, videos, or documents to get started
          </p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && videoToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteModal(false)}>
          <div className="card p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">⚠️ Delete Video & All Files?</h3>
              <button onClick={() => setShowDeleteModal(false)} className="text-neutral-500 hover:text-neutral-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Video:</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 font-mono">{videoToDelete.filename}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">Asset ID: {videoToDelete.assetId}</p>
            </div>

            <div className="mb-4">
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">The following will be deleted:</p>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-red-500">✓</span>
                  <span><strong>Raw video</strong> (original file)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">✓</span>
                  <span><strong>Video chunks</strong> (10s segments)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">✓</span>
                  <span><strong>Keyframes</strong> (extracted frames)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">✓</span>
                  <span><strong>Manifest & embeddings</strong> (metadata)</span>
                </li>
              </ul>
              <p className="text-xs text-red-600 dark:text-red-400 mt-3 font-medium">⚠️ This action cannot be undone!</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate({
                  objectKey: videoToDelete.objectKey,
                  assetId: videoToDelete.assetId,
                  isVideo: true
                })}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
