import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Search, Database, Radio, Cpu, Cloud, Zap, Camera,
  GitBranch, Layers, Activity, ArrowRight, Play
} from 'lucide-react'

// ── Slide transition variants ─────────────────────────────────────────────────
const slideVariants = {
  enter:  (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80 }),
}

// ── Shared mini-components ────────────────────────────────────────────────────
function SlideLabel({ num, tag }: { num: number; tag: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-[10px] font-black tracking-[0.2em] uppercase"
        style={{ color: '#76B900' }}>
        {String(num).padStart(2,'0')} — {tag}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(118,185,0,0.25)' }} />
    </div>
  )
}

function Kpi({ value, label, color, bg }: { value: string; label: string; color: string; bg: string }) {
  return (
    <div className="rounded-2xl px-5 py-4 text-center" style={{ background: bg, border: `1px solid ${color}30` }}>
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      <div className="text-[11px] mt-1 font-medium text-slate-400 uppercase tracking-wide">{label}</div>
    </div>
  )
}



function LiveDot({ color = '#76B900' }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ background: color }} />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5"
        style={{ background: color }} />
    </span>
  )
}

// ── Interactive RTSP Live Preview ─────────────────────────────────────────────
function RtspPreviewCard({ streamPath, label }: { streamPath: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const hlsUrl = `/hls/${streamPath}/index.m3u8`
    let hls: any

    import('hls.js').then(({ default: Hls }) => {
      if (!videoRef.current) return
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, maxBufferLength: 4, backBufferLength: 0 })
        hlsRef.current = hls
        hls.loadSource(hlsUrl)
        hls.attachMedia(videoRef.current)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => {})
          setReady(true)
          setPlaying(true)
        })
      }
    })

    return () => { hls?.destroy() }
  }, [streamPath])

  const toggle = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true) }
    else { videoRef.current.pause(); setPlaying(false) }
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black aspect-video group cursor-pointer" onClick={toggle}>
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#76B900', borderTopColor: 'transparent' }} />
          <p className="text-[10px] text-slate-500">Connecting to {label}…</p>
        </div>
      )}
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"
        style={{ display: ready ? 'block' : 'none' }} />
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600/90 backdrop-blur-sm">
        <LiveDot color="white" />
        <span className="text-[9px] font-bold text-white tracking-wider">LIVE</span>
      </div>
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="text-[10px] text-white/70 font-medium">{label}</span>
        <button className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center transition opacity-0 group-hover:opacity-100">
          <Play className="w-3 h-3 text-white" style={{ display: playing ? 'none' : 'block' }} />
        </button>
      </div>
    </div>
  )
}

// ── Interactive Search Simulator ──────────────────────────────────────────────
function SearchSimulator() {
  const queries = [
    'Person near entrance gate',
    'Vehicle in parking lot',
    'Empty corridor at night',
    'Crowd near exit',
    'Suspicious activity',
  ]
  const [q, setQ] = useState('')
  const [typing, setTyping] = useState(false)
  const [results, setResults] = useState(false)
  const [active, setActive] = useState(0)

  const runDemo = (query: string, idx: number) => {
    setQ('')
    setResults(false)
    setTyping(true)
    setActive(idx)
    let i = 0
    const iv = setInterval(() => {
      setQ(query.slice(0, ++i))
      if (i >= query.length) {
        clearInterval(iv)
        setTyping(false)
        setTimeout(() => setResults(true), 600)
      }
    }, 40)
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{ background: '#0F172A', border: '1px solid rgba(118,185,0,0.3)' }}>
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#76B900' }} />
        <span className="flex-1 text-sm font-mono text-white min-h-[1.25rem]">
          {q}
          {typing && <span className="animate-pulse">|</span>}
        </span>
        {results && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: 'rgba(118,185,0,0.15)', color: '#76B900' }}>
            &lt;1.2s
          </span>
        )}
      </div>

      {/* Preset queries */}
      <div className="flex flex-wrap gap-1.5">
        {queries.map((qu, i) => (
          <button key={qu} onClick={() => runDemo(qu, i)}
            className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all"
            style={{
              background: active === i && results ? 'rgba(118,185,0,0.15)' : 'rgba(255,255,255,0.06)',
              color: active === i && results ? '#76B900' : 'rgba(255,255,255,0.5)',
              border: `1px solid ${active === i && results ? 'rgba(118,185,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
            }}>
            {qu}
          </button>
        ))}
      </div>

      {/* Results */}
      <AnimatePresence>
        {results && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-3 gap-2">
              {[
                { score: '0.94', src: 'cam3', ts: '14:23:07', tag: 'entrance' },
                { score: '0.91', src: 'cam1', ts: '14:19:44', tag: 'outdoor'  },
                { score: '0.87', src: 'cam2', ts: '14:21:55', tag: 'indoor'   },
              ].map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(118,185,0,0.2)' }}>
                  <div className="aspect-video bg-slate-800 flex items-center justify-center relative">
                    <Camera className="w-5 h-5 text-slate-600" />
                    <span className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: 'rgba(118,185,0,0.85)', color: '#fff' }}>{r.score}</span>
                  </div>
                  <div className="p-1.5 bg-slate-900">
                    <div className="text-[9px] text-slate-400 font-mono">{r.ts} · {r.src}</div>
                    <div className="text-[9px] text-slate-500">#{r.tag}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-2">
              FAISS cosine similarity · 81 vectors · CLIP ViT-B/32
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDES
// ════════════════════════════════════════════════════════════════════════════

// Slide 1 — Cover
function Slide01Cover() {
  return (
    <div className="h-full flex" style={{ background: '#060D1A' }}>
      {/* Left accent bar */}
      <div className="w-1.5 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #ED2738, #76B900)' }} />

      {/* Left panel */}
      <div className="w-72 flex-shrink-0 flex flex-col justify-between p-8 border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div>
          <div className="flex items-center gap-2 mb-10">
            <div className="w-2 h-2 rounded-full bg-[#ED2738]" />
            <div className="w-2 h-2 rounded-full" style={{ background: '#76B900' }} />
            <span className="text-white/30 text-[10px] font-mono ml-2 tracking-widest">GTC 2026</span>
          </div>
          <div className="text-5xl font-black text-white mb-0.5">DDN</div>
          <div className="text-sm font-light text-white/30 mb-8 tracking-widest">INFINIA</div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-px bg-white/10" />
            <span className="text-white/20 text-xs">×</span>
            <div className="w-8 h-px bg-white/10" />
          </div>
          <div className="text-2xl font-black mt-3" style={{ color: '#76B900' }}>NVIDIA</div>
          <div className="text-[11px] text-white/30 mt-0.5 tracking-wider">VSS BLUEPRINT</div>
        </div>

        <div className="space-y-4">
          {[
            { label: 'RTSP Live Ingestion', color: '#ED2738' },
            { label: 'FAISS GPU Vector DB', color: '#76B900' },
            { label: 'CLIP · BLIP · LLM', color: '#3B82F6' },
            { label: 'DDN INFINIA Storage', color: '#F59E0B' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: f.color }} />
              <span className="text-[11px] text-white/50 font-medium">{f.label}</span>
            </div>
          ))}
          <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="text-[9px] text-white/20 uppercase tracking-widest">DDN Theatre Booth · Build.DDN:VSS</div>
          </div>
        </div>
      </div>

      {/* Right main */}
      <div className="flex-1 flex flex-col justify-center px-14">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 w-fit"
          style={{ background: 'rgba(118,185,0,0.1)', border: '1px solid rgba(118,185,0,0.3)' }}>
          <LiveDot />
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#76B900' }}>
            Live Demo System Active
          </span>
        </div>

        <h1 className="text-6xl font-black text-white leading-none mb-2">From Video</h1>
        <h1 className="text-6xl font-black leading-none mb-2" style={{ color: '#ED2738' }}>Chaos</h1>
        <h1 className="text-6xl font-black text-white leading-none mb-8">to Intelligence.</h1>

        <p className="text-white/40 text-base leading-relaxed max-w-md mb-10">
          Real-time RTSP ingestion → CLIP GPU embedding → FAISS vector search →
          natural language queries at any scale, stored on DDN INFINIA.
        </p>

        <div className="flex flex-wrap gap-2">
          {[
            { label: 'RTSP Live Streams',  color: '#ED2738', bg: 'rgba(237,39,56,0.12)'  },
            { label: 'FAISS GPU Index',    color: '#76B900', bg: 'rgba(118,185,0,0.12)'  },
            { label: 'CLIP · BLIP · VLM', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
            { label: 'LLM Enrichment',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
            { label: 'DDN INFINIA S3',    color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
          ].map(p => (
            <span key={p.label} className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: p.bg, color: p.color, border: `1px solid ${p.color}30` }}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Slide 2 — The Problem
function Slide02Problem() {
  return (
    <div className="h-full flex flex-col p-10" style={{ background: '#060D1A' }}>
      <SlideLabel num={2} tag="The Challenge" />
      <h2 className="text-4xl font-black text-white mb-2">95% of Enterprise Video Is Dark Data</h2>
      <p className="text-white/40 text-sm mb-8">Petabytes sit unindexed, unsearchable, invisible to AI — a cost center with zero intelligence value.</p>

      <div className="grid grid-cols-3 gap-5 flex-1">
        {[
          {
            icon: '🕒', title: 'Hours of Manual Search',
            body: 'Analysts scrub footage frame-by-frame. Traditional CCTV has zero semantic awareness — no natural language, no AI, no context.',
            color: '#ED2738', bg: 'rgba(237,39,56,0.08)',
          },
          {
            icon: '💸', title: '$2M–$5M Wasted Annually',
            body: 'Separate vector DB licenses, cloud egress costs, manual annotation tooling, and cold-storage tiers compound into runaway spend.',
            color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',
          },
          {
            icon: '📡', title: 'No Live Stream Intelligence',
            body: 'RTSP camera feeds generate terabytes of footage daily — but without real-time AI ingestion, every frame is immediately lost to darkness.',
            color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)',
          },
        ].map(card => (
          <div key={card.title} className="rounded-2xl p-6 flex flex-col"
            style={{ background: card.bg, border: `1px solid ${card.color}25` }}>
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className="text-base font-bold mb-2" style={{ color: card.color }}>{card.title}</div>
            <p className="text-white/40 text-sm leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>

      {/* vs NVIDIA VSS banner */}
      <div className="mt-6 rounded-2xl p-4 flex items-center gap-4"
        style={{ background: 'rgba(118,185,0,0.06)', border: '1px solid rgba(118,185,0,0.2)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(118,185,0,0.15)' }}>
          <Zap className="w-5 h-5" style={{ color: '#76B900' }} />
        </div>
        <p className="text-white/50 text-sm">
          <span className="font-bold text-white">DDN VSS</span> solves this: real-time RTSP ingestion → CLIP GPU embedding → FAISS vector index → natural language search.
          Built on the <span style={{ color: '#76B900' }} className="font-semibold">NVIDIA VSS Blueprint</span>, co-located on DDN INFINIA.
        </p>
      </div>
    </div>
  )
}

// Slide 3 — Architecture
function Slide03Architecture() {
  const layers = [
    {
      label: 'LAYER 1 · Ingestion',
      color: '#ED2738',
      items: [
        { icon: <Radio className="w-4 h-4" />, name: 'RTSP Live Streams', sub: 'MediaMTX · 3 cameras · H264 25fps' },
        { icon: <Cloud className="w-4 h-4" />, name: 'Video File Upload', sub: 'MP4/MOV via UI' },
      ],
    },
    {
      label: 'LAYER 2 · AI Processing',
      color: '#76B900',
      items: [
        { icon: <Cpu className="w-4 h-4" />, name: 'CLIP ViT-B/32', sub: '512-dim embeddings · GPU' },
        { icon: <Activity className="w-4 h-4" />, name: 'BLIP Captioning', sub: 'Keyframe descriptions' },
        { icon: <Layers className="w-4 h-4" />, name: 'LLM Enrichment', sub: 'GPT-4o-mini · Ollama' },
      ],
    },
    {
      label: 'LAYER 3 · Storage',
      color: '#3B82F6',
      items: [
        { icon: <Database className="w-4 h-4" />, name: 'FAISS GPU Index', sub: 'IndexFlatIP · cosine sim · persisted' },
        { icon: <Cloud className="w-4 h-4" />, name: 'DDN INFINIA S3', sub: 'Keyframes · manifests · metadata' },
      ],
    },
    {
      label: 'LAYER 4 · Query',
      color: '#F59E0B',
      items: [
        { icon: <Search className="w-4 h-4" />, name: 'Semantic Search', sub: 'Natural language → CLIP → FAISS' },
        { icon: <GitBranch className="w-4 h-4" />, name: 'RAG Pipeline', sub: 'LLM synthesis over results' },
      ],
    },
  ]

  return (
    <div className="h-full flex flex-col p-10" style={{ background: '#060D1A' }}>
      <SlideLabel num={3} tag="Architecture" />
      <h2 className="text-4xl font-black text-white mb-1">NVIDIA VSS Blueprint + DDN INFINIA</h2>
      <p className="text-white/30 text-sm mb-7">Three AI layers · GPU-accelerated throughout · Zero separate vector DB</p>

      <div className="grid grid-cols-4 gap-4 flex-1">
        {layers.map((layer, li) => (
          <div key={layer.label} className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${layer.color}25` }}>
            <div className="text-[10px] font-black tracking-widest uppercase" style={{ color: layer.color }}>
              {layer.label}
            </div>
            {layer.items.map(item => (
              <div key={item.name} className="rounded-xl p-3"
                style={{ background: `${layer.color}0D`, border: `1px solid ${layer.color}20` }}>
                <div className="flex items-center gap-2 mb-1" style={{ color: layer.color }}>
                  {item.icon}
                  <span className="text-xs font-bold text-white">{item.name}</span>
                </div>
                <div className="text-[10px] text-white/30 ml-6">{item.sub}</div>
              </div>
            ))}
            {/* Connector arrow */}
            {li < layers.length - 1 && (
              <div className="absolute" style={{ right: '-12px', top: '50%' }}>
                <ArrowRight className="w-4 h-4 text-slate-600" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3 mt-5">
        {[
          { v: '1 frame/2s', l: 'Capture Rate',      c: '#ED2738' },
          { v: '512-dim',    l: 'CLIP Vectors',       c: '#76B900' },
          { v: '<1ms',       l: 'FAISS Search',       c: '#3B82F6' },
          { v: 'Every 10s',  l: 'INFINIA Keyframe',   c: '#F59E0B' },
          { v: '25 FPS',     l: 'HLS Live Preview',   c: '#10B981' },
        ].map(s => (
          <div key={s.l} className="rounded-xl px-3 py-2.5 text-center"
            style={{ background: `${s.c}0D`, border: `1px solid ${s.c}25` }}>
            <div className="text-base font-black" style={{ color: s.c }}>{s.v}</div>
            <div className="text-[9px] text-white/30 mt-0.5 uppercase tracking-wide">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide 4 — RTSP Live Streams (interactive)
function Slide04RTSP() {
  const [counters, setCounters] = useState({ captured: 0, indexed: 0, uploaded: 0 })

  useEffect(() => {
    const iv = setInterval(() => {
      setCounters(c => ({
        captured: c.captured + 1,
        indexed:  c.indexed  + 1,
        uploaded: c.uploaded + (c.captured % 5 === 0 ? 1 : 0),
      }))
    }, 2000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="h-full flex flex-col p-10" style={{ background: '#060D1A' }}>
      <SlideLabel num={4} tag="Live RTSP Ingestion" />
      <h2 className="text-4xl font-black text-white mb-1">3 Live Camera Streams — Ingesting Now</h2>
      <p className="text-white/30 text-sm mb-6">OpenCV grabs 1 frame every 2s · CLIP GPU embeds · FAISS indexes · INFINIA stores every 10s</p>

      <div className="flex gap-6 flex-1">
        {/* Camera grid */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          <RtspPreviewCard streamPath="cam1" label="Parking Lot — Cam 1" />
          <RtspPreviewCard streamPath="cam2" label="Lobby — Cam 2" />
          <div className="col-span-2">
            <RtspPreviewCard streamPath="cam3" label="Entrance Gate — Cam 3 (1080p)" />
          </div>
        </div>

        {/* Live pipeline stats */}
        <div className="w-60 flex-shrink-0 flex flex-col gap-4">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(118,185,0,0.06)', border: '1px solid rgba(118,185,0,0.2)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: '#76B900' }}>Live Counters</div>
            {[
              { label: 'Frames Captured', val: counters.captured, color: '#ED2738' },
              { label: 'FAISS Indexed',   val: counters.indexed,  color: '#76B900' },
              { label: 'INFINIA Stored',  val: counters.uploaded, color: '#3B82F6' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-[11px] text-white/40">{s.label}</span>
                <span className="text-sm font-black font-mono" style={{ color: s.color }}>{s.val}</span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-4 flex-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3 text-white/30">Per-Frame Pipeline</div>
            {[
              { step: '01', label: 'OpenCV reads RTSP frame', color: '#ED2738' },
              { step: '02', label: 'BGR→RGB → PIL Image',     color: '#F59E0B' },
              { step: '03', label: 'CLIP GPU → 512-dim vec',  color: '#76B900' },
              { step: '04', label: 'FAISS.add() + save()',    color: '#3B82F6' },
              { step: '05', label: 'INFINIA S3 upload (÷5)', color: '#10B981' },
            ].map(s => (
              <div key={s.step} className="flex items-center gap-2 py-1.5">
                <span className="text-[9px] font-black w-6 flex-shrink-0" style={{ color: s.color }}>{s.step}</span>
                <span className="text-[10px] text-white/40">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Slide 5 — FAISS Vector DB
function Slide05FAISS() {
  const [vectors, setVectors] = useState(81)

  useEffect(() => {
    const iv = setInterval(() => {
      setVectors(v => v + 1)
    }, 2000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="h-full flex flex-col p-10" style={{ background: '#060D1A' }}>
      <SlideLabel num={5} tag="FAISS Vector Database" />
      <h2 className="text-4xl font-black text-white mb-1">GPU-Accelerated Persistent Vector Index</h2>
      <p className="text-white/30 text-sm mb-7">IndexFlatIP · cosine similarity · auto-saved to disk · auto-reindexed on restart</p>

      <div className="grid grid-cols-2 gap-6 flex-1">
        {/* Left — FAISS internals */}
        <div className="flex flex-col gap-4">
          {/* Live vector count */}
          <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(118,185,0,0.08)', border: '1px solid rgba(118,185,0,0.3)' }}>
            <div className="text-5xl font-black mb-1" style={{ color: '#76B900' }}>{vectors}</div>
            <div className="text-xs text-white/40 uppercase tracking-widest">Live Vector Count (growing)</div>
            <div className="text-[10px] text-white/20 mt-1">Sources: uploaded videos + 3 RTSP streams</div>
          </div>

          {/* How it works */}
          <div className="rounded-2xl p-4 flex-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-4 text-white/30">Index Architecture</div>
            <div className="space-y-3">
              {[
                { icon: <Cpu className="w-3.5 h-3.5" />, label: 'FAISS IndexFlatIP', desc: 'Inner product on L2-normalized = cosine similarity. Exact NN, GPU accelerated.', color: '#76B900' },
                { icon: <Database className="w-3.5 h-3.5" />, label: 'Disk Persistence', desc: 'data/faiss/index.faiss + metadata.json. Auto-saved every 50 frames, reloaded on restart.', color: '#3B82F6' },
                { icon: <Activity className="w-3.5 h-3.5" />, label: 'Auto-Reindex', desc: 'On startup if index is empty → rebuilds from INFINIA manifests automatically.', color: '#F59E0B' },
                { icon: <Zap className="w-3.5 h-3.5" />, label: '512-dim CLIP Vectors', desc: 'Each vector: 1 frame from RTSP or uploaded video. Metadata: stream, timestamp, tags.', color: '#ED2738' },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${f.color}18`, color: f.color }}>
                    {f.icon}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{f.label}</div>
                    <div className="text-[10px] text-white/30 leading-relaxed">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — search flow */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: '#3B82F6' }}>Query Flow</div>
            <div className="space-y-2">
              {[
                { label: '"Car near entrance"', arrow: false, isQuery: true },
                { label: 'CLIP text encoder → 512-dim vector', arrow: true, color: '#76B900' },
                { label: 'FAISS.search(k=20) · cosine similarity', arrow: true, color: '#76B900' },
                { label: 'Filter by score > 0.25', arrow: true, color: '#F59E0B' },
                { label: 'Return metadata + S3 frame URLs', arrow: true, color: '#10B981' },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  {row.arrow && <ArrowRight className="w-3 h-3 flex-shrink-0 text-slate-600" />}
                  <div className={`text-xs px-3 py-1.5 rounded-lg ${row.isQuery ? 'font-bold text-white' : 'text-white/50'}`}
                    style={row.isQuery ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' } : {}}>
                    {row.label}
                  </div>
                  {row.color && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${row.color}18`, color: row.color }}>
                      GPU
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* vs alternatives */}
          <div className="rounded-2xl p-4 flex-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3 text-white/30">DDN VSS vs Alternatives</div>
            <div className="space-y-2">
              {[
                { label: 'Pinecone / Weaviate',  cost: '$500K–$2M/yr', ours: false },
                { label: 'Separate FAISS server', cost: 'Extra infra + latency', ours: false },
                { label: 'DDN VSS FAISS GPU',    cost: '$0 · co-located · <1ms', ours: true  },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span className={`text-xs ${row.ours ? 'font-bold' : ''}`} style={{ color: row.ours ? '#76B900' : 'rgba(255,255,255,0.3)' }}>
                    {row.ours ? '✓ ' : '✗ '}{row.label}
                  </span>
                  <span className="text-[10px]" style={{ color: row.ours ? '#76B900' : 'rgba(255,255,255,0.25)' }}>{row.cost}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Slide 6 — Semantic Search (interactive)
function Slide06Search() {
  return (
    <div className="h-full flex flex-col p-10" style={{ background: '#060D1A' }}>
      <SlideLabel num={6} tag="Semantic Search" />
      <h2 className="text-4xl font-black text-white mb-1">Natural Language Search — Live Demo</h2>
      <p className="text-white/30 text-sm mb-6">Click a query · watch CLIP encode · FAISS return results in &lt;1.2s</p>

      <div className="flex gap-6 flex-1">
        {/* Interactive search */}
        <div className="flex-1 flex flex-col">
          <div className="rounded-2xl p-5 flex-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <SearchSimulator />
          </div>
        </div>

        {/* How it works */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-4">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(118,185,0,0.06)', border: '1px solid rgba(118,185,0,0.2)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: '#76B900' }}>Search Sources</div>
            {[
              { label: 'Uploaded Videos',   n: '3',  color: '#3B82F6' },
              { label: 'RTSP Live Frames',  n: '∞',  color: '#ED2738' },
              { label: 'FAISS Vectors',     n: '81+', color: '#76B900' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-[11px] text-white/40">{s.label}</span>
                <span className="text-sm font-black" style={{ color: s.color }}>{s.n}</span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-4 flex-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3 text-white/30">Why Semantic?</div>
            <div className="space-y-2.5">
              {[
                '"car crash" → finds "vehicle collision"',
                '"crowd" → finds "group of people"',
                '"night" → finds low-light frames',
                'No keywords · No tags · No rules',
              ].map(pt => (
                <div key={pt} className="flex items-start gap-2 text-[10px] text-white/40">
                  <span style={{ color: '#76B900' }} className="flex-shrink-0">→</span>
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'rgba(237,39,56,0.06)', border: '1px solid rgba(237,39,56,0.2)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-2" style={{ color: '#ED2738' }}>Result Includes</div>
            {['Similarity score (0–1)', 'Source stream / file', 'Timestamp', 'AI tags + caption', 'S3 frame URL'].map(r => (
              <div key={r} className="text-[10px] text-white/30 py-0.5 flex items-center gap-1.5">
                <span style={{ color: '#ED2738' }}>·</span>{r}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Slide 7 — Full Pipeline
function Slide07Pipeline() {
  const steps = [
    { n: '01', icon: <Radio className="w-4 h-4" />,    title: 'RTSP / Upload',   sub: 'MediaMTX · MP4 · MOV',   color: '#ED2738' },
    { n: '02', icon: <Camera className="w-4 h-4" />,   title: 'Frame Capture',   sub: 'OpenCV · 1 frame/2s',    color: '#F59E0B' },
    { n: '03', icon: <Cpu className="w-4 h-4" />,      title: 'CLIP + BLIP',     sub: 'GPU · 512-dim · caption', color: '#76B900' },
    { n: '04', icon: <Layers className="w-4 h-4" />,   title: 'LLM Enrich',      sub: 'GPT-4o · Ollama 7B',     color: '#3B82F6' },
    { n: '05', icon: <Database className="w-4 h-4" />, title: 'FAISS Index',     sub: 'GPU · IndexFlatIP · save', color: '#8B5CF6' },
    { n: '06', icon: <Cloud className="w-4 h-4" />,    title: 'DDN INFINIA',     sub: 'Keyframes · manifests',  color: '#10B981' },
    { n: '07', icon: <Search className="w-4 h-4" />,   title: 'NL Search',       sub: 'CLIP → FAISS → results', color: '#F59E0B' },
  ]

  return (
    <div className="h-full flex flex-col p-10" style={{ background: '#060D1A' }}>
      <SlideLabel num={7} tag="End-to-End Pipeline" />
      <h2 className="text-4xl font-black text-white mb-1">Complete AI Video Intelligence Pipeline</h2>
      <p className="text-white/30 text-sm mb-8">From live camera to searchable intelligence — fully automated, no manual steps</p>

      {/* Horizontal pipeline */}
      <div className="flex items-stretch gap-0 mb-8 flex-shrink-0">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex-1 rounded-2xl p-4 flex flex-col items-center text-center"
              style={{ background: `${s.color}0D`, border: `1px solid ${s.color}30` }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                style={{ background: `${s.color}20`, color: s.color }}>
                {s.icon}
              </div>
              <div className="text-[9px] font-black tracking-widest mb-1" style={{ color: s.color }}>{s.n}</div>
              <div className="text-xs font-bold text-white leading-tight">{s.title}</div>
              <div className="text-[9px] text-white/25 mt-0.5 leading-tight">{s.sub}</div>
            </div>
            {i < steps.length - 1 && (
              <div className="w-5 flex-shrink-0 flex items-center justify-center">
                <ArrowRight className="w-3 h-3 text-slate-700" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* DDN Infinia callout */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' }}>
        <div className="text-sm font-bold mb-3" style={{ color: '#10B981' }}>★ DDN INFINIA — The Unified Intelligence Layer</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          {[
            'S3-compatible object store — keyframes + manifest + embeddings in one place',
            'GPU-Direct NVMe: disk → GPU with zero CPU bottleneck',
            'No separate vector DB needed — FAISS index lives alongside raw video',
            'Linear scale: 1 PB and 100 PB respond identically to search queries',
          ].map(pt => (
            <div key={pt} className="flex items-start gap-2 text-xs text-white/40">
              <span style={{ color: '#10B981' }} className="mt-0.5 flex-shrink-0">●</span>
              <span>{pt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 flex-shrink-0">
        <Kpi value="<1ms"   label="FAISS Search"     color="#76B900" bg="rgba(118,185,0,0.08)"   />
        <Kpi value="$0"     label="Vector DB Cost"   color="#3B82F6" bg="rgba(59,130,246,0.08)"  />
        <Kpi value=">85%"  label="GPU Utilization"  color="#ED2738" bg="rgba(237,39,56,0.08)"   />
        <Kpi value="512d"   label="CLIP Dimensions"  color="#F59E0B" bg="rgba(245,158,11,0.08)"  />
        <Kpi value="∞"      label="Scale Ceiling"    color="#10B981" bg="rgba(16,185,129,0.08)"  />
      </div>
    </div>
  )
}

// Slide 8 — Business Case
function Slide08Business() {
  return (
    <div className="h-full flex flex-col p-10" style={{ background: '#060D1A' }}>
      <SlideLabel num={8} tag="Business Case" />
      <h2 className="text-4xl font-black text-white mb-1">Strategic Value Framework</h2>
      <p className="text-white/30 text-sm mb-7">GTC 2026 · NVIDIA VSS × DDN INFINIA</p>

      <div className="grid grid-cols-3 gap-5 flex-1">
        {[
          {
            label: 'Business Outcome', badge: 'Dark Data → Intelligence',
            fg: '#10B981', bg: 'rgba(16,185,129,0.06)',
            bullets: [
              '1 analyst replaces 3-person tagging team',
              'PB-scale NLP search in <2 seconds',
              'RTSP cameras searchable in real-time',
              'Edge-case curation: weeks → minutes',
            ],
            quote: '"Our video estate became a live intelligence asset."',
          },
          {
            label: 'Financial Outcome', badge: '$2M–$5M Eliminated',
            fg: '#F59E0B', bg: 'rgba(245,158,11,0.06)',
            bullets: [
              '$500K–$2M vector DB cost → $0 (FAISS GPU)',
              '$800K–$3M/yr cloud egress removed',
              'Annotation budget eliminated (AI tags)',
              'Zero marginal cost per FAISS query',
            ],
            quote: '"One infra decision eliminated three budget lines."',
          },
          {
            label: 'AI Infrastructure', badge: 'GPU: 40% → >85%',
            fg: '#ED2738', bg: 'rgba(237,39,56,0.06)',
            bullets: [
              'CLIP + FAISS co-located on GPU — zero I/O starvation',
              'RTSP → CLIP → FAISS in one GPU pass (<50ms)',
              'NVIDIA VSS blueprint — zero integration debt',
              'Auto-reindex on restart — zero manual ops',
            ],
            quote: '"GPUs now run at the speed we paid for."',
          },
        ].map(p => (
          <div key={p.label} className="rounded-2xl p-5 flex flex-col"
            style={{ background: p.bg, border: `1px solid ${p.fg}25` }}>
            <div className="text-sm font-bold mb-1" style={{ color: p.fg }}>{p.label}</div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full w-fit mb-4"
              style={{ background: 'rgba(255,255,255,0.06)', color: p.fg, border: `1px solid ${p.fg}30` }}>
              {p.badge}
            </span>
            <ul className="space-y-2 flex-1">
              {p.bullets.map(b => (
                <li key={b} className="text-xs text-white/40 flex items-start gap-1.5">
                  <span style={{ color: p.fg }} className="mt-0.5 flex-shrink-0">→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t" style={{ borderColor: `${p.fg}20` }}>
              <p className="text-xs italic" style={{ color: p.fg }}>{p.quote}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide 9 — Closing
function Slide09Closing() {
  return (
    <div className="h-full flex" style={{ background: '#060D1A' }}>
      <div className="w-1.5 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #76B900, #ED2738)' }} />
      <div className="w-72 flex-shrink-0 flex flex-col justify-between p-8 border-r" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div>
          <div className="flex items-center gap-2 mb-10">
            <div className="w-2 h-2 rounded-full bg-[#ED2738]" />
            <div className="w-2 h-2 rounded-full" style={{ background: '#76B900' }} />
            <span className="text-white/30 text-[10px] font-mono ml-2 tracking-widest">GTC 2026</span>
          </div>
          <p className="text-white/60 text-xl font-light leading-relaxed mb-4">
            Your cameras are generating intelligence right now.
          </p>
          <p className="text-2xl font-bold leading-tight" style={{ color: '#76B900' }}>
            Are you capturing it?
          </p>
        </div>
        <div>
          <div className="space-y-2 mb-6">
            {['● Scan QR for live demo access', '● Proof of concept: 2-week setup', '● Build.DDN.com/vss documentation'].map(c => (
              <div key={c} className="text-white/30 text-xs">{c}</div>
            ))}
          </div>
          <p className="text-sm italic" style={{ color: '#76B900' }}>"Let me show you how."</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-14">
        <div className="mb-8">
          <div className="text-5xl font-black text-white mb-1">Build.DDN:VSS</div>
          <div className="text-white/30 text-base">Multimodal Semantic Video Search</div>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <span className="text-3xl font-black" style={{ color: '#ED2738' }}>DDN</span>
          <span className="text-white/20 text-2xl">×</span>
          <span className="text-3xl font-black" style={{ color: '#76B900' }}>NVIDIA</span>
        </div>

        <div className="h-px mb-8" style={{ background: 'rgba(255,255,255,0.07)' }} />

        <div className="grid grid-cols-2 gap-3 mb-8">
          {[
            { v: 'RTSP + VOD',  l: 'Ingestion Sources',  c: '#ED2738' },
            { v: 'FAISS GPU',   l: 'Vector Database',     c: '#76B900' },
            { v: '<1ms',        l: 'Search Latency',      c: '#3B82F6' },
            { v: '$0',          l: 'Vector DB License',   c: '#F59E0B' },
          ].map(s => (
            <Kpi key={s.l} value={s.v} label={s.l} color={s.c} bg={`${s.c}0D`} />
          ))}
        </div>

        <p className="text-white/20 text-xs">
          NVIDIA GPU · DDN INFINIA · CLIP · BLIP · FAISS · MediaMTX · GTC 2026
        </p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN DECK CONTROLLER
// ════════════════════════════════════════════════════════════════════════════
const slides = [
  { title: 'Cover',             component: Slide01Cover    },
  { title: 'The Challenge',     component: Slide02Problem  },
  { title: 'Architecture',      component: Slide03Architecture },
  { title: 'Live RTSP Streams', component: Slide04RTSP     },
  { title: 'FAISS Vector DB',   component: Slide05FAISS    },
  { title: 'Semantic Search',   component: Slide06Search   },
  { title: 'Full Pipeline',     component: Slide07Pipeline },
  { title: 'Business Case',     component: Slide08Business },
  { title: 'Closing',           component: Slide09Closing  },
]

export default function GtcDeck() {
  const [current, setCurrent]     = useState(0)
  const [direction, setDirection] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const goTo = useCallback((idx: number) => {
    if (idx < 0 || idx >= slides.length) return
    setDirection(idx > current ? 1 : -1)
    setCurrent(idx)
  }, [current])

  const goNext = useCallback(() => goTo(current + 1), [current, goTo])
  const goPrev = useCallback(() => goTo(current - 1), [current, goTo])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')  { e.preventDefault(); goPrev() }
      if (e.key === 'Escape') { setFullscreen(false); document.exitFullscreen?.() }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev])

  const toggleFullscreen = () => {
    if (!fullscreen) { containerRef.current?.requestFullscreen?.() }
    else { document.exitFullscreen?.() }
    setFullscreen(f => !f)
  }

  const ActiveSlide = slides[current].component

  return (
    <div ref={containerRef}
      className="min-h-[calc(100vh-var(--nav-height))] pt-[var(--nav-height)] flex flex-col"
      style={{ background: '#030812' }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b flex-shrink-0"
        style={{ background: '#060D1A', borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: '#76B900' }}>
            GTC 2026
          </span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
          <span className="text-xs text-white/30">{slides[current].title}</span>
          <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="flex items-center gap-1.5">
            <LiveDot />
            <span className="text-[10px] text-white/30">3 cameras live</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Slide dots */}
          {slides.map((s, i) => (
            <button key={i} onClick={() => goTo(i)}
              title={s.title}
              className="rounded-full transition-all"
              style={{
                width: i === current ? '24px' : '6px',
                height: '6px',
                background: i === current ? '#76B900' : 'rgba(255,255,255,0.15)',
              }} />
          ))}

          <div className="w-px h-4 mx-2" style={{ background: 'rgba(255,255,255,0.1)' }} />

          {/* Fullscreen */}
          <button onClick={toggleFullscreen}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Slide area */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={current}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute inset-0"
          >
            <ActiveSlide />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-3 border-t flex-shrink-0"
        style={{ background: '#060D1A', borderColor: 'rgba(255,255,255,0.07)' }}>
        <button onClick={goPrev} disabled={current === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all"
          style={{
            background: current === 0 ? 'transparent' : 'rgba(255,255,255,0.06)',
            color: current === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>

        <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {current + 1} / {slides.length} · <span style={{ color: '#76B900' }}>F</span> fullscreen · <span style={{ color: '#76B900' }}>→</span> next
        </span>

        <button onClick={goNext} disabled={current === slides.length - 1}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all"
          style={{
            background: current === slides.length - 1 ? 'transparent' : 'rgba(118,185,0,0.12)',
            color: current === slides.length - 1 ? 'rgba(255,255,255,0.15)' : '#76B900',
            border: `1px solid ${current === slides.length - 1 ? 'rgba(255,255,255,0.08)' : 'rgba(118,185,0,0.3)'}`,
          }}>
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
