import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Radio, Plus, Trash2, Play, Loader2, Wifi, WifiOff,
  Database, AlertTriangle, Activity, RefreshCw, Camera, Video
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────
interface StreamInfo {
  stream_id:       string
  name:            string
  url:             string
  description:     string
  tags:            string[]
  status:          'stopped' | 'starting' | 'running' | 'error'
  frames_captured: number
  frames_indexed:  number
  frames_uploaded: number
  error_msg:       string
  started_at:      number
  last_frame_at:   number
  uptime_seconds:  number
}

interface AddStreamPayload {
  name:        string
  url:         string
  description: string
  tags:        string[]
}

// ── Demo streams (pre-filled for the demo) ───────────────────────────────────
// Streams served by MediaMTX on this server — 3 looping video files
const DEMO_PRESETS = [
  {
    name:        'Parking Lot — Cam 1',
    url:         'rtsp://172.20.146.6:8554/cam1',
    description: 'Outdoor parking lot surveillance — looping iStock footage via MediaMTX',
    tags:        ['outdoor', 'parking', 'vehicles', 'surveillance'],
  },
  {
    name:        'Lobby — Cam 2',
    url:         'rtsp://172.20.146.6:8554/cam2',
    description: 'Indoor lobby camera — looping iStock footage via MediaMTX',
    tags:        ['indoor', 'lobby', 'people', 'access-control'],
  },
  {
    name:        'Entrance Gate — Cam 3',
    url:         'rtsp://172.20.146.6:8554/cam3',
    description: 'Main entrance gate camera — longer demo footage via MediaMTX',
    tags:        ['entrance', 'security', 'gate', 'perimeter'],
  },
]

// ── HLS video preview component ──────────────────────────────────────────────
// Maps rtsp://host:8554/path → /hls/path/index.m3u8 (proxied by Vite → MediaMTX :8888)
function getHlsUrl(rtspUrl: string): string | null {
  const match = rtspUrl.match(/rtsp:\/\/[^:]+:\d+\/(.+)/)
  return match ? `/hls/${match[1]}/index.m3u8` : null
}

function LiveFramePreview({ streamUrl, status }: { streamUrl: string; status: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<Hls | null>(null)
  const [ready, setReady]   = useState(false)
  const [error, setError]   = useState(false)

  useEffect(() => {
    if (status !== 'running') return
    const hlsUrl = getHlsUrl(streamUrl)
    if (!hlsUrl || !videoRef.current) return

    setReady(false)
    setError(false)

    const video = videoRef.current

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode:    true,
        backBufferLength:  0,      // discard old segments to stay near live edge
        maxBufferLength:   4,      // keep only 4s in buffer
        liveSyncDurationCount: 1,
      })
      hlsRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
        setReady(true)
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setError(true)
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari — native HLS support
      video.src = hlsUrl
      video.play().catch(() => {})
      video.onloadeddata = () => setReady(true)
      video.onerror = () => setError(true)
    } else {
      setError(true)
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [streamUrl, status])

  if (status !== 'running') {
    return (
      <div className="w-full aspect-video bg-neutral-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <Video className="w-8 h-8 mx-auto mb-2 text-neutral-400" />
          <p className="text-xs text-neutral-400 capitalize">Stream {status}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      {/* LIVE badge */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-600 text-white text-[10px] font-bold">
        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        LIVE
      </div>

      {/* Loading spinner */}
      {!ready && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 text-white/60 animate-spin" />
          <p className="text-[10px] text-white/40">Buffering HLS…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <WifiOff className="w-6 h-6 mx-auto mb-1 text-white/50" />
            <p className="text-xs text-white/50">HLS stream not ready yet</p>
            <p className="text-[10px] text-white/30 mt-1">MediaMTX may need ~10s to buffer</p>
          </div>
        </div>
      )}

      {/* Video element — continuous HLS playback */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        loop={false}
        className="w-full h-full object-cover"
        style={{ display: ready ? 'block' : 'none' }}
      />
    </div>
  )
}

// ── Stream card ───────────────────────────────────────────────────────────────
function StreamCard({ stream, onRemove }: { stream: StreamInfo; onRemove: (id: string) => void }) {
  const statusColor = {
    running:  '#76b900',
    starting: '#f59e0b',
    stopped:  '#6b7280',
    error:    '#ef4444',
  }[stream.status] ?? '#6b7280'

  const uptimeStr = stream.uptime_seconds < 60
    ? `${Math.round(stream.uptime_seconds)}s`
    : `${Math.floor(stream.uptime_seconds / 60)}m ${Math.round(stream.uptime_seconds % 60)}s`

  return (
    <div
      className="card-elevated p-0 overflow-hidden transition-all duration-200"
      style={{ borderTop: `2px solid ${statusColor}` }}
    >
      {/* Live preview — HLS continuous video */}
      <LiveFramePreview streamUrl={stream.url} status={stream.status} />

      {/* Info */}
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {stream.name}
            </h3>
            <p className="text-[11px] font-mono mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {stream.url}
            </p>
          </div>
          {/* Status pill */}
          <span
            className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
            style={{ background: `${statusColor}20`, color: statusColor }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor, animation: stream.status === 'running' ? 'pulse 2s infinite' : 'none' }} />
            {stream.status}
          </span>
        </div>

        {/* Stats row */}
        {stream.status === 'running' && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Captured', value: stream.frames_captured },
              { label: 'Indexed',  value: stream.frames_indexed  },
              { label: 'Uploaded', value: stream.frames_uploaded },
            ].map(({ label, value }) => (
              <div key={label} className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-2">
                <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Uptime + tags */}
        <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {stream.status === 'running' && <span>⏱ {uptimeStr}</span>}
          {stream.error_msg && <span className="text-red-500 truncate">⚠ {stream.error_msg}</span>}
          <div className="flex gap-1 flex-wrap ml-auto">
            {stream.tags.slice(0, 3).map((t) => (
              <span key={t} className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-[10px]">{t}</span>
            ))}
          </div>
        </div>

        {/* Remove button */}
        <button
          onClick={() => onRemove(stream.stream_id)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />Stop & Remove
        </button>
      </div>
    </div>
  )
}

// ── Add Stream form ───────────────────────────────────────────────────────────
function AddStreamForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState<AddStreamPayload>({
    name: '', url: '', description: '', tags: [],
  })
  const [tagInput, setTagInput] = useState('')
  const [preset, setPreset] = useState(-1)

  const applyPreset = (i: number) => {
    if (i < 0) return
    const p = DEMO_PRESETS[i]
    setForm({ name: p.name, url: p.url, description: p.description, tags: [...p.tags] })
    setPreset(i)
  }

  const addTagMutation = useMutation({
    mutationFn: async (payload: AddStreamPayload) => {
      const res = await fetch('/api/rtsp/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to add stream')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Stream added — ingestion starting…')
      setForm({ name: '', url: '', description: '', tags: [] })
      setTagInput('')
      setPreset(-1)
      onSuccess()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleAddTag = () => {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }))
    }
    setTagInput('')
  }

  return (
    <div className="card-elevated p-6" style={{ borderTop: '3px solid var(--ddn-red)' }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ddn-red/10">
          <Plus className="w-5 h-5 text-ddn-red" />
        </div>
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Add RTSP Stream</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Start ingesting a live camera stream into the FAISS vector index</p>
        </div>
      </div>

      {/* Preset picker */}
      <div className="mb-4">
        <label className="block text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
          Quick Demo Presets
        </label>
        <div className="flex gap-2 flex-wrap">
          {DEMO_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => applyPreset(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                preset === i ? 'bg-ddn-red text-white' : 'bg-surface-secondary text-secondary hover:bg-surface-tertiary'
              }`}
            >
              {p.name.split(' — ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Stream Name *</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Camera 01 — Entrance" />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>RTSP URL *</label>
          <input className="input-field font-mono text-sm" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="rtsp://192.168.1.100:554/stream1" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Description</label>
          <input className="input-field" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Main entrance camera, outdoor, 24/7" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Search Tags</label>
          <div className="flex gap-2 mb-2">
            <input className="input-field flex-1" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() }}}
              placeholder="outdoor, vehicles, entrance…" />
            <button onClick={handleAddTag} className="btn-secondary px-4">Add</button>
          </div>
          {form.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {form.tags.map((t) => (
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-ddn-red/10 text-ddn-red">
                  {t}
                  <button onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-6 pt-6 border-t border-neutral-100 dark:border-neutral-800">
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => addTagMutation.mutate(form)}
          disabled={addTagMutation.isPending || !form.name.trim() || !form.url.trim()}
        >
          {addTagMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Start Ingestion
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LiveStreamsPage() {
  const qc = useQueryClient()

  const { data: streams = [], isLoading, refetch } = useQuery<StreamInfo[]>({
    queryKey: ['rtsp-streams'],
    queryFn:  async () => {
      const res = await fetch('/api/rtsp/streams')
      if (!res.ok) throw new Error('Failed to load streams')
      return res.json()
    },
    refetchInterval: 5000,
  })

  const removeMutation = useMutation({
    mutationFn: async (streamId: string) => {
      const res = await fetch(`/api/rtsp/streams/${streamId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove stream')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Stream stopped and removed')
      qc.invalidateQueries({ queryKey: ['rtsp-streams'] })
      qc.invalidateQueries({ queryKey: ['faiss-stats'] })
    },
    onError: () => toast.error('Failed to remove stream'),
  })

  const activeCount  = streams.filter((s) => s.status === 'running').length
  const totalIndexed = streams.reduce((n, s) => n + s.frames_indexed, 0)

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="section-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Radio className="w-5 h-5 text-ddn-red" />
              Live RTSP Streams
            </h2>
            <p className="section-description">
              Ingest live camera streams in real-time. Each frame is embedded via CLIP
              and indexed into FAISS GPU — enabling instant semantic search over live video.
            </p>
          </div>
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 px-3 py-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Streams', value: activeCount,  icon: <Wifi    className="w-4 h-4" />, color: '#76b900' },
          { label: 'Total Streams',  value: streams.length, icon: <Camera  className="w-4 h-4" />, color: '#3b82f6' },
          { label: 'RTSP Frames ⟶ FAISS', value: totalIndexed, icon: <Database className="w-4 h-4" />, color: '#8b5cf6' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="card p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1" style={{ color }}>
              {icon}
              <span className="text-2xl font-bold font-mono">{value}</span>
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Add stream form */}
      <AddStreamForm onSuccess={() => qc.invalidateQueries({ queryKey: ['rtsp-streams'] })} />

      {/* Active streams grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : streams.length === 0 ? (
        <div className="card p-10 text-center">
          <Radio className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No streams yet</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Add an RTSP stream above to start live ingestion
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Active Streams ({streams.length})
            </h3>
          </div>
          <div className="media-grid">
            {streams.map((s) => (
              <StreamCard key={s.stream_id} stream={s} onRemove={(id) => removeMutation.mutate(id)} />
            ))}
          </div>
        </>
      )}

      {/* How it works info card */}
      <div className="card p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Activity className="w-4 h-4 text-nvidia-green" />
          How RTSP Ingestion Works
        </h3>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { step: '01', title: 'RTSP Capture', desc: 'OpenCV connects to the stream URL, grabbing 1 frame every 2 seconds', color: '#3b82f6' },
            { step: '02', title: 'CLIP Embedding', desc: 'Each frame is passed through the NVIDIA CLIP encoder → 512-dim vector', color: '#76b900' },
            { step: '03', title: 'FAISS Indexing', desc: 'Vectors added to GPU FAISS index in real-time (IndexFlatIP cosine sim)', color: '#8b5cf6' },
            { step: '04', title: 'S3 Keyframes', desc: 'Every 5th frame uploaded to DDN INFINIA for persistent storage', color: '#ED2738' },
          ].map(({ step, title, desc, color }) => (
            <div key={step} className="p-4 rounded-xl" style={{ background: `${color}0D`, border: `1px solid ${color}25` }}>
              <div className="text-xs font-mono font-bold mb-2" style={{ color }}>{step}</div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</div>
            </div>
          ))}
        </div>

        <div
          className="mt-4 p-3 rounded-lg flex items-start gap-2 text-xs"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#92400e' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
          <span>
            <b>Demo note:</b> Public RTSP streams may require network access from the server.
            For production deployments, use your own IP camera URLs (e.g. <code>rtsp://192.168.x.x:554/stream</code>).
            The mediamtx service installed on this server can also re-stream local video files as RTSP for testing.
          </span>
        </div>
      </div>
    </div>
  )
}
