import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Search as SearchIcon, Image, Video, FileText, Loader2, Download,
  Copy, FolderInput, X, Cpu, Zap, RefreshCw, Database
} from 'lucide-react'
import toast from 'react-hot-toast'

type Modality = 'all' | 'image' | 'video' | 'document'

interface StorageInfo {
  source: string
  storage_class: string
  access_control: { read: boolean; write: boolean; delete: boolean }
  protocol: string
  encryption?: string
  versioning_enabled: boolean
  etag?: string
  retrieval_time_ms?: number
}

interface SearchResult {
  object_key: string
  modality: string
  relevance_score: number
  size_bytes: number
  last_modified: string
  metadata: { [key: string]: unknown }
  presigned_url?: string
  storage_info?: StorageInfo
}

interface SearchResponse {
  success: boolean
  query: string
  results: SearchResult[]
  total_results: number
  search_time_ms?: number
}

interface IndexStats {
  total_vectors: number
  index_size_mb: number
  mode: string
  dim: number
  error?: string
}

// ── FAISS Stats Bar ────────────────────────────────────────────────────────
function FaissStatsBar() {
  const { data: stats, refetch, isFetching } = useQuery<IndexStats>({
    queryKey: ['faiss-stats'],
    queryFn: async () => {
      const res = await fetch('/api/search/index/stats')
      if (!res.ok) throw new Error('Failed to fetch FAISS stats')
      return res.json()
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const reindexMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/search/reindex', { method: 'POST' })
      if (!res.ok) throw new Error('Reindex failed')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Reindex started — building FAISS index from INFINIA assets…')
      setTimeout(() => refetch(), 8000)
    },
    onError: () => toast.error('Reindex failed'),
  })

  const isVectorMode = stats?.mode === 'faiss' && !stats?.error
  const hasVectors   = (stats?.total_vectors ?? 0) > 0

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium"
      style={{
        background: isVectorMode && hasVectors
          ? 'linear-gradient(135deg,rgba(118,185,0,0.08),rgba(118,185,0,0.04))'
          : 'var(--surface-secondary)',
        border: isVectorMode && hasVectors
          ? '1px solid rgba(118,185,0,0.25)'
          : '1px solid var(--border-subtle)',
      }}
    >
      {/* Mode pill */}
      <span
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-[11px]"
        style={{
          background: isVectorMode && hasVectors ? 'rgba(118,185,0,0.15)' : 'var(--surface-tertiary)',
          color:      isVectorMode && hasVectors ? '#76b900' : 'var(--text-muted)',
        }}
      >
        {isVectorMode && hasVectors ? (
          <><Zap className="w-3 h-3" /> VECTOR</>
        ) : (
          <><Cpu className="w-3 h-3" /> KEYWORD</>
        )}
      </span>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          {stats?.total_vectors ?? '…'} vectors
        </span>
        {stats && !stats.error && (
          <span>{stats.index_size_mb.toFixed(2)} MB</span>
        )}
        {stats && !stats.error && (
          <span className="font-mono">{stats.dim}‑dim CLIP</span>
        )}
        {stats?.error && (
          <span className="text-amber-500">FAISS unavailable — keyword fallback</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Reindex button */}
      <button
        onClick={() => reindexMutation.mutate()}
        disabled={reindexMutation.isPending || isFetching}
        title="Re-embed all INFINIA assets into FAISS index"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
        style={{
          background: 'var(--surface-tertiary)',
          color: 'var(--text-secondary)',
          opacity: reindexMutation.isPending ? 0.6 : 1,
        }}
      >
        <RefreshCw className={`w-3 h-3 ${reindexMutation.isPending ? 'animate-spin' : ''}`} />
        Re-index
      </button>
    </div>
  )
}

// ── Main Search Page ────────────────────────────────────────────────────────
export default function SearchPage() {
  const [query,         setQuery]         = useState('')
  const [modality,      setModality]      = useState<Modality>('video')
  const [threshold,     setThreshold]     = useState(0.25)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [lastMode,      setLastMode]      = useState<'vector' | 'keyword' | null>(null)
  const [lastTimeMs,    setLastTimeMs]    = useState<number | null>(null)

  // Copy / Move modal state
  const [showCopyModal,      setShowCopyModal]      = useState(false)
  const [showMoveModal,      setShowMoveModal]      = useState(false)
  const [selectedObjectKey,  setSelectedObjectKey]  = useState('')
  const [destinationPath,    setDestinationPath]    = useState('')

  const searchMutation = useMutation({
    mutationFn: async ({ query, modality, threshold }: { query: string; modality: Modality; threshold: number }) => {
      const res = await fetch('/api/search/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, modality, threshold, top_k: 20 }),
      })
      if (!res.ok) throw new Error('Search failed')
      return res.json() as Promise<SearchResponse>
    },
    onSuccess: (data: SearchResponse) => {
      setSearchResults(data.results)
      setLastTimeMs(data.search_time_ms ?? null)
      // Detect search mode from first result metadata
      const mode = (data.results[0]?.metadata?.search_mode as string) ?? null
      setLastMode(mode === 'vector' ? 'vector' : mode === 'keyword' ? 'keyword' : null)

      if (data.results.length === 0) {
        toast('No results found', { icon: '🔍' })
      } else {
        const label = mode === 'vector' ? '⚡ Vector' : '🔤 Keyword'
        toast.success(
          `${label}: ${data.results.length} results in ${data.search_time_ms?.toFixed(0) ?? '?'}ms`
        )
      }
    },
    onError: () => toast.error('Search failed'),
  })

  const copyMutation = useMutation({
    mutationFn: async ({ source, destination }: { source: string; destination: string }) => {
      const res = await fetch(`/api/browse/copy?source_key=${encodeURIComponent(source)}&destination_key=${encodeURIComponent(destination)}`, { method: 'POST' })
      if (!res.ok) throw new Error('Copy failed')
      return res.json()
    },
    onSuccess: () => { toast.success('Object copied'); setShowCopyModal(false); setDestinationPath('') },
    onError:   () => toast.error('Failed to copy object'),
  })

  const moveMutation = useMutation({
    mutationFn: async ({ source, destination }: { source: string; destination: string }) => {
      const res = await fetch(`/api/browse/move?source_key=${encodeURIComponent(source)}&destination_key=${encodeURIComponent(destination)}`, { method: 'POST' })
      if (!res.ok) throw new Error('Move failed')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Object moved')
      setShowMoveModal(false)
      setDestinationPath('')
      if (query) searchMutation.mutate({ query, modality, threshold })
    },
    onError: () => toast.error('Failed to move object'),
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    searchMutation.mutate({ query, modality, threshold })
  }

  const modalityOptions = [
    { value: 'video',    label: 'Videos',    icon: <Video    className="w-4 h-4" /> },
    { value: 'image',    label: 'Images',    icon: <Image    className="w-4 h-4" /> },
    { value: 'document', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
  ]

  const getThresholdLabel = () => {
    if (threshold >= 0.45) return 'High precision'
    if (threshold >= 0.30) return 'Medium precision'
    return 'Broad match'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024)        return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="section-header">
        <h2 className="section-title">Semantic Search</h2>
        <p className="section-description">
          Natural language search powered by CLIP embeddings + FAISS GPU vector index.
          Results show cosine similarity scored against all indexed keyframes.
        </p>
      </div>

      {/* FAISS Stats Bar */}
      <FaissStatsBar />

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="search-bar">
        <SearchIcon className="search-icon w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe what you're looking for…"
          className="pr-28"
        />
        <button
          type="submit"
          disabled={searchMutation.isPending || !query.trim()}
          className="search-button"
        >
          {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </button>
      </form>

      {/* Filters Row */}
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {modalityOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setModality(opt.value as Modality)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                modality === opt.value
                  ? 'bg-ddn-red text-white'
                  : 'bg-surface-secondary text-secondary hover:bg-surface-tertiary'
              }`}
            >
              {opt.icon}{opt.label}
            </button>
          ))}
        </div>

        {/* Threshold Slider */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Similarity Threshold
            </label>
            <span className="text-sm font-semibold text-ddn-red">
              {threshold.toFixed(2)} — {getThresholdLabel()}
            </span>
          </div>
          <input
            type="range" min="0.20" max="0.70" step="0.05" value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700"
            style={{
              background: `linear-gradient(to right,var(--ddn-red) 0%,var(--ddn-red) ${((threshold - 0.20) / 0.50) * 100}%,rgb(229 229 229) ${((threshold - 0.20) / 0.50) * 100}%,rgb(229 229 229) 100%)`
            }}
          />
          <p className="mt-2 text-xs text-neutral-500">
            Lower = broader matches (more results). Higher = precise semantic matches (fewer results).
          </p>
        </div>
      </div>

      {/* Search meta row */}
      {searchMutation.isSuccess && searchResults.length > 0 && (
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span
            className="flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold text-[11px]"
            style={{
              background: lastMode === 'vector' ? 'rgba(118,185,0,0.12)' : 'var(--surface-secondary)',
              color:      lastMode === 'vector' ? '#76b900' : 'var(--text-muted)',
              border:     lastMode === 'vector' ? '1px solid rgba(118,185,0,0.2)' : '1px solid var(--border-subtle)',
            }}
          >
            {lastMode === 'vector' ? <><Zap className="w-3 h-3" /> VECTOR SEARCH</> : <><Cpu className="w-3 h-3" /> KEYWORD SEARCH</>}
          </span>
          <span>{searchResults.length} results</span>
          {lastTimeMs && <span>in {lastTimeMs.toFixed(0)}ms</span>}
        </div>
      )}

      {/* Results Grid */}
      {searchResults.length > 0 ? (
        <div className="media-grid">
          {searchResults.map((result, idx) => {
            const scorePercent = (result.relevance_score * 100).toFixed(0)
            const isFaiss = result.metadata?.search_mode === 'vector'
            const meta = result.metadata as Record<string, string | undefined>
            return (
              <div key={`${result.object_key}-${idx}`} className="media-card">
                {/* Preview */}
                {result.modality === 'image' ? (
                  <img
                    src={`/api/browse/video-stream/${result.object_key}`}
                    alt={String(result.metadata?.caption || 'Image')}
                    className="media-card-image"
                  />
                ) : result.modality === 'video' ? (
                  <video controls className="media-card-image"
                    src={`/api/browse/video-stream/${result.object_key}`} preload="metadata">
                    Your browser does not support video.
                  </video>
                ) : (
                  <div className="media-card-image flex items-center justify-center">
                    <FileText className="w-12 h-12 text-neutral-400" />
                  </div>
                )}

                {/* Card Body */}
                <div className="media-card-content">
                  {/* Badges row */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="modality-badge">{result.modality}</span>

                    {/* Similarity score badge */}
                    <span
                      className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{
                        background: isFaiss ? 'rgba(118,185,0,0.12)' : 'var(--surface-secondary)',
                        color:      isFaiss ? '#76b900' : 'var(--text-secondary)',
                        border:     isFaiss ? '1px solid rgba(118,185,0,0.2)' : '1px solid var(--border-subtle)',
                      }}
                    >
                      {isFaiss ? '⚡' : '🔤'} {scorePercent}%
                    </span>

                    {/* Storage badge */}
                    {result.storage_info && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{
                          backgroundColor: result.storage_info.source === 'ddn_infinia' ? '#dcfce7' : '#dbeafe',
                          color:           result.storage_info.source === 'ddn_infinia' ? '#166534' : '#1e40af',
                        }}>
                        📦 {result.storage_info.source === 'ddn_infinia' ? 'DDN INFINIA' : 'AWS S3'}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold mb-2 line-clamp-1">
                    {result.object_key.split('/').pop()}
                  </h3>

                  {/* Caption */}
                  {meta.caption && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2 line-clamp-2">
                      {meta.caption}
                    </p>
                  )}

                  {/* Tags */}
                  {meta.tags && meta.tags.trim() && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {meta.tags.split(',').slice(0, 4).map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded text-[10px] font-medium">
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {meta.detected_objects && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {meta.detected_objects.split(',').slice(0, 4).map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-[10px] font-medium">
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* AI summary */}
                  {meta.video_summary && (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2 line-clamp-2">
                      {meta.video_summary}
                    </p>
                  )}

                  {/* Storage details */}
                  {result.storage_info && (
                    <div className="mb-2 p-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 grid grid-cols-2 gap-1 text-[10px]">
                      <span style={{ color: 'var(--text-muted)' }}>Class: <b>{result.storage_info.storage_class}</b></span>
                      {result.storage_info.retrieval_time_ms !== undefined && (
                        <span style={{ color: result.storage_info.retrieval_time_ms < 5 ? '#16a34a' : '#2563eb' }}>
                          ⚡ {result.storage_info.retrieval_time_ms.toFixed(1)}ms
                        </span>
                      )}
                      <span style={{ color: 'var(--text-muted)' }}>Protocol: <b>{result.storage_info.protocol}</b></span>
                      {result.storage_info.encryption && (
                        <span className="text-green-600">🔒 {result.storage_info.encryption}</span>
                      )}
                    </div>
                  )}

                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {result.size_bytes > 0 && <span>Size: {formatFileSize(result.size_bytes)}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-4 pb-4 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                  <a href={`/api/browse/video-stream/${result.object_key}?download=true`} download
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg transition-colors">
                    <Download className="w-3.5 h-3.5" />Download
                  </a>
                  <button onClick={() => { setSelectedObjectKey(result.object_key); setDestinationPath(result.object_key); setShowCopyModal(true) }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-lg transition-colors">
                    <Copy className="w-3.5 h-3.5" />Copy
                  </button>
                  <button onClick={() => { setSelectedObjectKey(result.object_key); setDestinationPath(result.object_key); setShowMoveModal(true) }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-nvidia-green hover:bg-nvidia-green/90 text-white rounded-lg transition-colors">
                    <FolderInput className="w-3.5 h-3.5" />Move
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : searchMutation.isSuccess ? (
        <div className="text-center py-16">
          <SearchIcon className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
          <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>No results found</h3>
          <p className="text-muted">Try lowering the threshold or uploading more content</p>
        </div>
      ) : !searchMutation.isPending ? (
        <div className="text-center py-16">
          <SearchIcon className="w-12 h-12 mx-auto mb-4 text-muted opacity-50" />
          <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--text-primary)' }}>Search your content</h3>
          <p className="text-muted">Enter a query above to find relevant images, videos, and documents</p>
        </div>
      ) : null}

      {/* Example Queries */}
      <div className="card p-6">
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Example Queries</h3>
        <div className="flex flex-wrap gap-2">
          {['person walking street', 'traffic intersection', 'office workspace', 'crowd scene',
            'sunset landscape', 'data center servers', 'industrial machinery', 'team meeting'].map((example) => (
            <button key={example} onClick={() => { setQuery(example); setModality('all') }}
              className="px-3 py-1.5 rounded-full text-sm bg-surface-secondary hover:bg-surface-tertiary transition-colors"
              style={{ color: 'var(--text-secondary)' }}>
              "{example}"
            </button>
          ))}
        </div>
      </div>

      {/* Copy Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCopyModal(false)}>
          <div className="card p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Copy Object</h3>
              <button onClick={() => setShowCopyModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Source: <code className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-xs">{selectedObjectKey}</code>
            </p>
            <input type="text" value={destinationPath} onChange={(e) => setDestinationPath(e.target.value)}
              placeholder="Enter destination path..." className="input-field mb-4" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setShowCopyModal(false)} className="flex-1 btn-secondary">Cancel</button>
              <button onClick={() => destinationPath.trim() && copyMutation.mutate({ source: selectedObjectKey, destination: destinationPath })}
                disabled={copyMutation.isPending} className="flex-1 btn-primary">
                {copyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowMoveModal(false)}>
          <div className="card p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Move Object</h3>
              <button onClick={() => setShowMoveModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400 mb-2">⚠️ This will delete the original file!</p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Source: <code className="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-xs">{selectedObjectKey}</code>
            </p>
            <input type="text" value={destinationPath} onChange={(e) => setDestinationPath(e.target.value)}
              placeholder="Enter destination path..." className="input-field mb-4" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setShowMoveModal(false)} className="flex-1 btn-secondary">Cancel</button>
              <button onClick={() => destinationPath.trim() && moveMutation.mutate({ source: selectedObjectKey, destination: destinationPath })}
                disabled={moveMutation.isPending} className="flex-1 bg-nvidia-green hover:bg-nvidia-green/90 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                {moveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
