import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Search, Database, Radio, Cpu, Cloud, Zap, Camera,
  Layers, Activity, ArrowRight, Play, Pause
} from 'lucide-react'

const slideVariants = {
  enter:  (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80 }),
  center: { opacity: 1, x: 0 },
  exit:   (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80 }),
}

// ── Shared components ─────────────────────────────────────────────────────────
function SlideLabel({ num, tag }: { num: number; tag: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: '#76B900' }}>
        {String(num).padStart(2, '0')} — {tag}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(118,185,0,0.3)' }} />
    </div>
  )
}

function Kpi({ value, label, color, bg }: { value: string; label: string; color: string; bg: string }) {
  return (
    <div className="rounded-2xl px-4 py-3 text-center" style={{ background: bg, border: `1.5px solid ${color}30` }}>
      <div className="text-2xl font-black" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-0.5 font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function LiveDot({ color = '#76B900' }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: color }} />
    </span>
  )
}

// ── HLS Camera Preview ────────────────────────────────────────────────────────
function RtspPreviewCard({ streamPath, label, resolution }: { streamPath: string; label: string; resolution?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<any>(null)
  const [ready, setReady]     = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let hls: any
    import('hls.js').then(({ default: Hls }) => {
      if (!videoRef.current) return
      const hlsUrl = `/hls/${streamPath}/index.m3u8`
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, maxBufferLength: 4, backBufferLength: 0 })
        hlsRef.current = hls
        hls.loadSource(hlsUrl)
        hls.attachMedia(videoRef.current)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => {})
          setReady(true); setPlaying(true)
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
    <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video group cursor-pointer shadow-lg" onClick={toggle}>
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#76B900', borderTopColor: 'transparent' }} />
          <p className="text-[10px] text-slate-400">Connecting…</p>
        </div>
      )}
      <video ref={videoRef} autoPlay muted playsInline
        className="w-full h-full object-cover"
        style={{ display: ready ? 'block' : 'none' }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      {/* LIVE badge */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600/90 backdrop-blur-sm">
        <LiveDot color="white" />
        <span className="text-[9px] font-black text-white tracking-wider">LIVE</span>
      </div>

      {/* Resolution badge */}
      {resolution && (
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold"
          style={{ background: 'rgba(118,185,0,0.85)', color: '#fff' }}>
          {resolution}
        </div>
      )}

      {/* Bottom label + play toggle */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] text-white/80 font-semibold">{label}</span>
        <button className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {playing ? <Pause className="w-3 h-3 text-white" /> : <Play className="w-3 h-3 text-white" />}
        </button>
      </div>
    </div>
  )
}

// ── Interactive Search Simulator ──────────────────────────────────────────────
function SearchSimulator() {
  const queries = ['Person near entrance gate', 'Vehicle in parking lot', 'Empty corridor at night', 'Crowd near exit']
  const [q, setQ]           = useState('')
  const [typing, setTyping] = useState(false)
  const [results, setResults] = useState(false)
  const [active, setActive] = useState(-1)

  const runDemo = (query: string, idx: number) => {
    setQ(''); setResults(false); setTyping(true); setActive(idx)
    let i = 0
    const iv = setInterval(() => {
      setQ(query.slice(0, ++i))
      if (i >= query.length) { clearInterval(iv); setTyping(false); setTimeout(() => setResults(true), 500) }
    }, 38)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-slate-50 border border-slate-200">
        <Search className="w-4 h-4 flex-shrink-0 text-slate-400" />
        <span className="flex-1 text-sm font-mono text-slate-700 min-h-[1.25rem]">
          {q}{typing && <span className="animate-pulse text-[#76B900]">|</span>}
        </span>
        {results && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{ background: '#F4FBEA', color: '#76B900', border: '1px solid rgba(118,185,0,0.3)' }}>
            &lt;1.2s
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {queries.map((qu, i) => (
          <button key={qu} onClick={() => runDemo(qu, i)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all border"
            style={{
              background: active === i && results ? '#F4FBEA' : '#F8FAFC',
              color: active === i && results ? '#76B900' : '#64748B',
              borderColor: active === i && results ? 'rgba(118,185,0,0.4)' : '#E2E8F0',
            }}>
            {qu}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {results && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-3 gap-2">
              {[
                { score: '0.94', src: 'cam3', ts: '14:23:07', tag: 'entrance' },
                { score: '0.91', src: 'cam1', ts: '14:19:44', tag: 'outdoor'  },
                { score: '0.87', src: 'cam1', ts: '14:21:55', tag: 'vehicle'  },
              ].map((r, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                  <div className="aspect-video bg-slate-100 flex items-center justify-center relative">
                    <Camera className="w-5 h-5 text-slate-300" />
                    <span className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded font-bold text-white"
                      style={{ background: '#76B900' }}>{r.score}</span>
                  </div>
                  <div className="p-1.5 bg-white">
                    <div className="text-[9px] text-slate-400 font-mono">{r.ts} · {r.src}</div>
                    <div className="text-[9px] text-slate-400">#{r.tag}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              FAISS cosine similarity · CLIP ViT-B/32 · GPU accelerated
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDES — WHITE THEME
// ════════════════════════════════════════════════════════════════════════════

function Slide01Cover() {
  return (
    <div className="h-full flex bg-white">
      {/* Left accent bar */}
      <div className="w-1.5 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #ED2738, #76B900)' }} />

      {/* Left dark panel */}
      <div className="w-72 flex-shrink-0 flex flex-col justify-between p-8 border-r border-slate-100"
        style={{ background: 'linear-gradient(160deg, #1E293B 60%, #0F172A 100%)' }}>
        <div>
          <div className="flex items-center gap-2 mb-10">
            <div className="w-2 h-2 rounded-full bg-[#ED2738]" />
            <div className="w-2 h-2 rounded-full" style={{ background: '#76B900' }} />
            <span className="text-white/30 text-[10px] font-mono ml-2 tracking-widest">GTC 2026</span>
          </div>
          <div className="text-5xl font-black text-white mb-0.5">DDN</div>
          <div className="text-sm font-light text-white/30 mb-8 tracking-widest">INFINIA</div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-px bg-white/10" /><span className="text-white/20 text-xs">×</span><div className="w-8 h-px bg-white/10" />
          </div>
          <div className="text-2xl font-black mt-3" style={{ color: '#76B900' }}>NVIDIA</div>
          <div className="text-[11px] text-white/30 mt-0.5 tracking-wider">VSS BLUEPRINT</div>
        </div>
        <div className="space-y-3">
          {[
            { label: 'RTSP Live Ingestion', color: '#ED2738' },
            { label: 'FAISS GPU Vector DB', color: '#76B900' },
            { label: 'CLIP · BLIP · VLM',  color: '#3B82F6' },
            { label: 'DDN INFINIA Storage', color: '#F59E0B' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: f.color }} />
              <span className="text-[11px] text-white/50 font-medium">{f.label}</span>
            </div>
          ))}
          <div className="pt-3 border-t border-white/10">
            <div className="text-[9px] text-white/20 uppercase tracking-widest">DDN Theatre · Build.DDN:VSS</div>
          </div>
        </div>
      </div>

      {/* Right white content */}
      <div className="flex-1 flex flex-col justify-center px-14">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 w-fit"
          style={{ background: '#F4FBEA', border: '1px solid rgba(118,185,0,0.35)' }}>
          <LiveDot />
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#76B900' }}>Live Demo System Active</span>
        </div>
        <h1 className="text-6xl font-black text-slate-900 leading-none mb-2">From Video</h1>
        <h1 className="text-6xl font-black leading-none mb-2" style={{ color: '#ED2738' }}>Chaos</h1>
        <h1 className="text-6xl font-black text-slate-900 leading-none mb-8">to Intelligence.</h1>
        <p className="text-slate-500 text-base leading-relaxed max-w-md mb-10">
          Real-time RTSP ingestion → CLIP GPU embedding → FAISS vector search →
          natural language queries at any scale, stored on DDN INFINIA.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'RTSP Live Streams', color: '#ED2738', bg: '#FFF0F1' },
            { label: 'FAISS GPU Index',   color: '#76B900', bg: '#F4FBEA' },
            { label: 'CLIP · BLIP · VLM', color: '#3B82F6', bg: '#EFF6FF' },
            { label: 'LLM Enrichment',   color: '#F59E0B', bg: '#FFFBEB' },
            { label: 'DDN INFINIA S3',   color: '#10B981', bg: '#ECFDF5' },
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

function Slide02Problem() {
  return (
    <div className="h-full flex flex-col p-10 bg-white">
      <SlideLabel num={2} tag="The Challenge" />
      <h2 className="text-4xl font-black text-slate-900 mb-2">95% of Enterprise Video Is Dark Data</h2>
      <p className="text-slate-400 text-sm mb-8">Petabytes sit unindexed, unsearchable, invisible to AI — a cost center with zero intelligence value.</p>
      <div className="grid grid-cols-3 gap-5 flex-1">
        {[
          { icon: '🕒', title: 'Hours of Manual Search', body: 'Analysts scrub footage frame-by-frame. CCTV has zero semantic awareness — no NLP, no AI, no context.', color: '#ED2738', bg: '#FFF0F1' },
          { icon: '💸', title: '$2M–$5M Wasted Annually', body: 'Separate vector DB licenses, cloud egress costs, annotation tooling compound into runaway spend.', color: '#F59E0B', bg: '#FFFBEB' },
          { icon: '📡', title: 'No Live Stream Intelligence', body: 'RTSP camera feeds generate terabytes daily — without real-time AI ingestion, every frame is immediately lost.', color: '#8B5CF6', bg: '#F5F3FF' },
        ].map(card => (
          <div key={card.title} className="rounded-2xl p-6 flex flex-col"
            style={{ background: card.bg, border: `1.5px solid ${card.color}25` }}>
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className="text-base font-bold mb-2" style={{ color: card.color }}>{card.title}</div>
            <p className="text-slate-500 text-sm leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl p-4 flex items-center gap-4"
        style={{ background: '#F4FBEA', border: '1.5px solid rgba(118,185,0,0.3)' }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(118,185,0,0.15)' }}>
          <Zap className="w-5 h-5" style={{ color: '#76B900' }} />
        </div>
        <p className="text-slate-600 text-sm">
          <span className="font-bold text-slate-800">DDN VSS</span> solves this: real-time RTSP ingestion → CLIP GPU embedding → FAISS vector index → natural language search. Built on the{' '}
          <span style={{ color: '#76B900' }} className="font-semibold">NVIDIA VSS Blueprint</span>, co-located on DDN INFINIA.
        </p>
      </div>
    </div>
  )
}

function Slide03Architecture() {
  const layers = [
    { label: 'LAYER 1 · Ingestion',     color: '#ED2738', items: [
        { icon: <Radio className="w-4 h-4" />,    name: 'RTSP Live Streams', sub: 'MediaMTX · H264 25fps' },
        { icon: <Cloud className="w-4 h-4" />,    name: 'Video File Upload',  sub: 'MP4/MOV via UI' },
    ]},
    { label: 'LAYER 2 · AI Processing', color: '#76B900', items: [
        { icon: <Cpu className="w-4 h-4" />,      name: 'CLIP ViT-B/32',     sub: '512-dim · GPU' },
        { icon: <Activity className="w-4 h-4" />, name: 'BLIP Captioning',   sub: 'Keyframe descriptions' },
        { icon: <Layers className="w-4 h-4" />,   name: 'LLM Enrichment',    sub: 'GPT-4o · Ollama' },
    ]},
    { label: 'LAYER 3 · Storage',       color: '#3B82F6', items: [
        { icon: <Database className="w-4 h-4" />, name: 'FAISS GPU Index',   sub: 'IndexFlatIP · persisted' },
        { icon: <Cloud className="w-4 h-4" />,    name: 'DDN INFINIA S3',    sub: 'Keyframes · metadata' },
    ]},
    { label: 'LAYER 4 · Query',         color: '#F59E0B', items: [
        { icon: <Search className="w-4 h-4" />,   name: 'Semantic Search',   sub: 'NL → CLIP → FAISS' },
        { icon: <Zap className="w-4 h-4" />,      name: 'RAG Pipeline',      sub: 'LLM synthesis' },
    ]},
  ]

  return (
    <div className="h-full flex flex-col p-10 bg-white">
      <SlideLabel num={3} tag="Architecture" />
      <h2 className="text-4xl font-black text-slate-900 mb-1">NVIDIA VSS Blueprint + DDN INFINIA</h2>
      <p className="text-slate-400 text-sm mb-7">Four AI layers · GPU-accelerated throughout · Zero separate vector DB license</p>
      <div className="grid grid-cols-4 gap-4 flex-1">
        {layers.map(layer => (
          <div key={layer.label} className="rounded-2xl p-4 flex flex-col gap-3 bg-slate-50"
            style={{ border: `1.5px solid ${layer.color}25` }}>
            <div className="text-[10px] font-black tracking-widest uppercase" style={{ color: layer.color }}>{layer.label}</div>
            {layer.items.map(item => (
              <div key={item.name} className="rounded-xl p-3"
                style={{ background: `${layer.color}0A`, border: `1px solid ${layer.color}20` }}>
                <div className="flex items-center gap-2 mb-1" style={{ color: layer.color }}>
                  {item.icon}
                  <span className="text-xs font-bold text-slate-800">{item.name}</span>
                </div>
                <div className="text-[10px] text-slate-400 ml-6">{item.sub}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-3 mt-5">
        {[
          { v: '1 frame/2s', l: 'Capture Rate',   c: '#ED2738', bg: '#FFF0F1' },
          { v: '512-dim',    l: 'CLIP Vectors',    c: '#76B900', bg: '#F4FBEA' },
          { v: '<1ms',       l: 'FAISS Search',    c: '#3B82F6', bg: '#EFF6FF' },
          { v: 'Every 10s',  l: 'INFINIA Store',   c: '#F59E0B', bg: '#FFFBEB' },
          { v: '25 FPS',     l: 'HLS Preview',     c: '#10B981', bg: '#ECFDF5' },
        ].map(s => (
          <div key={s.l} className="rounded-xl px-3 py-2.5 text-center"
            style={{ background: s.bg, border: `1.5px solid ${s.c}25` }}>
            <div className="text-base font-black" style={{ color: s.c }}>{s.v}</div>
            <div className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wide">{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide04RTSP() {
  const [counters, setCounters] = useState({ captured: 0, indexed: 0, uploaded: 0 })
  useEffect(() => {
    const iv = setInterval(() => setCounters(c => ({
      captured: c.captured + 1,
      indexed:  c.indexed  + 1,
      uploaded: c.uploaded + (c.captured % 5 === 0 ? 1 : 0),
    })), 2000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="h-full flex flex-col p-10 bg-white">
      <SlideLabel num={4} tag="Live RTSP Ingestion" />
      <h2 className="text-4xl font-black text-slate-900 mb-1">2 Live Camera Streams — Ingesting Now</h2>
      <p className="text-slate-400 text-sm mb-6">OpenCV grabs 1 frame / 2s · CLIP GPU embeds · FAISS indexes · INFINIA stores every 10s</p>
      <div className="flex gap-6 flex-1">
        {/* Camera grid - 2 cameras */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          <RtspPreviewCard streamPath="cam1" label="Parking Lot — Cam 1" resolution="768p" />
          <RtspPreviewCard streamPath="cam3" label="Entrance Gate — Cam 3" resolution="1080p" />
          {/* Pipeline flow below cameras */}
          <div className="col-span-2 rounded-2xl p-4 bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2">
              {[
                { n: '01', t: 'OpenCV reads RTSP', c: '#ED2738' },
                { n: '02', t: 'BGR→PIL Image',     c: '#F59E0B' },
                { n: '03', t: 'CLIP GPU → 512d',   c: '#76B900' },
                { n: '04', t: 'FAISS.add() + save', c: '#3B82F6' },
                { n: '05', t: 'INFINIA S3 (÷5)',   c: '#10B981' },
              ].map((s, i, arr) => (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <div className="flex-1 rounded-xl px-3 py-2 text-center"
                    style={{ background: `${s.c}0A`, border: `1px solid ${s.c}25` }}>
                    <div className="text-[9px] font-black" style={{ color: s.c }}>{s.n}</div>
                    <div className="text-[10px] font-semibold text-slate-700 mt-0.5 leading-tight">{s.t}</div>
                  </div>
                  {i < arr.length - 1 && <ArrowRight className="w-3 h-3 flex-shrink-0 text-slate-300" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live counters panel */}
        <div className="w-52 flex-shrink-0 flex flex-col gap-4">
          <div className="rounded-2xl p-4 border" style={{ background: '#F4FBEA', borderColor: 'rgba(118,185,0,0.3)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: '#76B900' }}>Live Counters</div>
            {[
              { label: 'Frames Captured', val: counters.captured, color: '#ED2738' },
              { label: 'FAISS Indexed',   val: counters.indexed,  color: '#76B900' },
              { label: 'INFINIA Stored',  val: counters.uploaded, color: '#3B82F6' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-2 border-b border-white/60">
                <span className="text-[11px] text-slate-500">{s.label}</span>
                <span className="text-sm font-black font-mono" style={{ color: s.color }}>{s.val}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4 flex-1 bg-slate-50 border border-slate-100">
            <div className="text-[10px] font-black tracking-widest uppercase mb-3 text-slate-400">Stream Config</div>
            {[
              { k: 'Protocol', v: 'RTSP / H264' },
              { k: 'Server',   v: 'MediaMTX :8554' },
              { k: 'Interval', v: '1 frame / 2s' },
              { k: 'Preview',  v: 'HLS :8888 / 25fps' },
              { k: 'Cameras',  v: 'cam1 + cam3' },
            ].map(r => (
              <div key={r.k} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-[10px] text-slate-400">{r.k}</span>
                <span className="text-[10px] font-bold text-slate-700">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide05FAISS() {
  const [vectors, setVectors] = useState(81)
  useEffect(() => {
    const iv = setInterval(() => setVectors(v => v + 1), 2000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="h-full flex flex-col p-10 bg-white">
      <SlideLabel num={5} tag="FAISS Vector Database" />
      <h2 className="text-4xl font-black text-slate-900 mb-1">GPU-Accelerated Persistent Vector Index</h2>
      <p className="text-slate-400 text-sm mb-7">IndexFlatIP · cosine similarity · auto-saved to disk · auto-reindexed on restart</p>
      <div className="grid grid-cols-2 gap-6 flex-1">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl p-5 text-center" style={{ background: '#F4FBEA', border: '1.5px solid rgba(118,185,0,0.35)' }}>
            <div className="text-5xl font-black mb-1" style={{ color: '#76B900' }}>{vectors}</div>
            <div className="text-xs text-slate-400 uppercase tracking-widest">Live Vector Count (growing)</div>
            <div className="text-[10px] text-slate-300 mt-1">Sources: uploaded videos + 2 RTSP streams</div>
          </div>
          <div className="rounded-2xl p-4 flex-1 bg-slate-50 border border-slate-100">
            <div className="text-[10px] font-black tracking-widest uppercase mb-4 text-slate-400">Index Architecture</div>
            <div className="space-y-3">
              {[
                { icon: <Cpu className="w-3.5 h-3.5" />,      label: 'FAISS IndexFlatIP',  desc: 'Inner product on L2-normalized vectors = cosine similarity. Exact NN, GPU accelerated.', color: '#76B900' },
                { icon: <Database className="w-3.5 h-3.5" />, label: 'Disk Persistence',   desc: 'data/faiss/index.faiss + metadata.json. Auto-saved every 50 frames, reloaded on restart.', color: '#3B82F6' },
                { icon: <Activity className="w-3.5 h-3.5" />, label: 'Auto-Reindex',       desc: 'On startup if index empty → rebuilds from INFINIA manifests automatically.', color: '#F59E0B' },
                { icon: <Zap className="w-3.5 h-3.5" />,      label: '512-dim CLIP Vectors',desc: 'Each vector: 1 frame from RTSP or uploaded video. Metadata: stream, timestamp, tags.', color: '#ED2738' },
              ].map(f => (
                <div key={f.label} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${f.color}12`, color: f.color }}>{f.icon}</div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">{f.label}</div>
                    <div className="text-[10px] text-slate-400 leading-relaxed">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl p-4" style={{ background: '#EFF6FF', border: '1.5px solid rgba(59,130,246,0.25)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: '#3B82F6' }}>Query Flow</div>
            {[
              { label: '"Car near entrance"', isQuery: true },
              { label: 'CLIP text encoder → 512-dim vector', color: '#76B900' },
              { label: 'FAISS.search(k=20) cosine similarity', color: '#76B900' },
              { label: 'Filter score > 0.25 threshold', color: '#F59E0B' },
              { label: 'Return metadata + S3 frame URLs', color: '#10B981' },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                {!row.isQuery && <ArrowRight className="w-3 h-3 flex-shrink-0 text-slate-300" />}
                <div className={`text-xs px-3 py-1.5 rounded-lg ${row.isQuery ? 'font-bold text-slate-800 bg-white border border-slate-200' : 'text-slate-500'}`}>
                  {row.label}
                </div>
                {row.color && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${row.color}15`, color: row.color }}>GPU</span>}
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4 flex-1 bg-slate-50 border border-slate-100">
            <div className="text-[10px] font-black tracking-widest uppercase mb-3 text-slate-400">DDN VSS vs Alternatives</div>
            {[
              { label: 'Pinecone / Weaviate',   cost: '$500K–$2M/yr', ours: false },
              { label: 'Separate FAISS server', cost: 'Extra infra + latency', ours: false },
              { label: 'DDN VSS FAISS GPU',     cost: '$0 · co-located · <1ms', ours: true  },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className={`text-xs font-${row.ours ? 'bold' : 'medium'}`}
                  style={{ color: row.ours ? '#76B900' : '#94A3B8' }}>
                  {row.ours ? '✓ ' : '✗ '}{row.label}
                </span>
                <span className="text-[10px]" style={{ color: row.ours ? '#76B900' : '#CBD5E1' }}>{row.cost}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide06Search() {
  return (
    <div className="h-full flex flex-col p-10 bg-white">
      <SlideLabel num={6} tag="Semantic Search" />
      <h2 className="text-4xl font-black text-slate-900 mb-1">Natural Language Search — Live Demo</h2>
      <p className="text-slate-400 text-sm mb-6">Click a query · watch CLIP encode · FAISS return results in &lt;1.2s</p>
      <div className="flex gap-6 flex-1">
        <div className="flex-1 flex flex-col">
          <div className="rounded-2xl p-5 flex-1 bg-slate-50 border border-slate-100">
            <SearchSimulator />
          </div>
        </div>
        <div className="w-60 flex-shrink-0 flex flex-col gap-4">
          <div className="rounded-2xl p-4" style={{ background: '#F4FBEA', border: '1.5px solid rgba(118,185,0,0.3)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-3" style={{ color: '#76B900' }}>Search Sources</div>
            {[
              { label: 'Uploaded Videos',  n: '3+', color: '#3B82F6' },
              { label: 'RTSP Live Frames', n: '∞',  color: '#ED2738' },
              { label: 'FAISS Vectors',    n: '81+', color: '#76B900' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-2 border-b border-white/80">
                <span className="text-[11px] text-slate-500">{s.label}</span>
                <span className="text-sm font-black" style={{ color: s.color }}>{s.n}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4 flex-1 bg-slate-50 border border-slate-100">
            <div className="text-[10px] font-black tracking-widest uppercase mb-3 text-slate-400">Why Semantic?</div>
            {[
              '"car crash" → "vehicle collision"',
              '"crowd" → "group of people"',
              '"night" → low-light frames',
              'No keywords · No tags · No rules',
            ].map(pt => (
              <div key={pt} className="flex items-start gap-2 text-[10px] text-slate-500 py-1.5 border-b border-slate-100">
                <span style={{ color: '#76B900' }} className="flex-shrink-0">→</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#FFF0F1', border: '1.5px solid rgba(237,39,56,0.2)' }}>
            <div className="text-[10px] font-black tracking-widest uppercase mb-2" style={{ color: '#ED2738' }}>Result Includes</div>
            {['Similarity score (0–1)', 'Source stream / file', 'Timestamp', 'AI tags + caption', 'S3 frame URL'].map(r => (
              <div key={r} className="text-[10px] text-slate-500 py-0.5 flex items-center gap-1.5">
                <span style={{ color: '#ED2738' }}>·</span>{r}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide07Pipeline() {
  const steps = [
    { n: '01', icon: <Radio className="w-4 h-4" />,    title: 'RTSP / Upload',    sub: 'MediaMTX · MP4',       color: '#ED2738', bg: '#FFF0F1' },
    { n: '02', icon: <Camera className="w-4 h-4" />,   title: 'Frame Capture',    sub: 'OpenCV · 1fr/2s',      color: '#F59E0B', bg: '#FFFBEB' },
    { n: '03', icon: <Cpu className="w-4 h-4" />,      title: 'CLIP + BLIP',      sub: 'GPU · 512-dim',        color: '#76B900', bg: '#F4FBEA' },
    { n: '04', icon: <Layers className="w-4 h-4" />,   title: 'LLM Enrich',       sub: 'GPT-4o · Ollama',      color: '#3B82F6', bg: '#EFF6FF' },
    { n: '05', icon: <Database className="w-4 h-4" />, title: 'FAISS Index',      sub: 'GPU · IndexFlatIP',    color: '#8B5CF6', bg: '#F5F3FF' },
    { n: '06', icon: <Cloud className="w-4 h-4" />,    title: 'DDN INFINIA',      sub: 'Keyframes + manifests', color: '#10B981', bg: '#ECFDF5' },
    { n: '07', icon: <Search className="w-4 h-4" />,   title: 'NL Search',        sub: 'CLIP → FAISS → results', color: '#F59E0B', bg: '#FFFBEB' },
  ]

  return (
    <div className="h-full flex flex-col p-10 bg-white">
      <SlideLabel num={7} tag="End-to-End Pipeline" />
      <h2 className="text-4xl font-black text-slate-900 mb-1">Complete AI Video Intelligence Pipeline</h2>
      <p className="text-slate-400 text-sm mb-8">From live camera to searchable intelligence — fully automated</p>
      <div className="flex items-stretch gap-1 mb-6 flex-shrink-0">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className="flex-1 rounded-2xl p-3 flex flex-col items-center text-center"
              style={{ background: s.bg, border: `1.5px solid ${s.color}30` }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                style={{ background: `${s.color}18`, color: s.color }}>{s.icon}</div>
              <div className="text-[9px] font-black tracking-widest mb-1" style={{ color: s.color }}>{s.n}</div>
              <div className="text-xs font-bold text-slate-800 leading-tight">{s.title}</div>
              <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">{s.sub}</div>
            </div>
            {i < steps.length - 1 && (
              <div className="w-4 flex-shrink-0 flex items-center justify-center">
                <ArrowRight className="w-3 h-3 text-slate-300" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-2xl p-5 mb-4 flex-shrink-0"
        style={{ background: '#ECFDF5', border: '1.5px solid rgba(16,185,129,0.3)' }}>
        <div className="text-sm font-bold mb-3" style={{ color: '#10B981' }}>★ DDN INFINIA — The Unified Intelligence Layer</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
          {[
            'S3-compatible — keyframes + manifest + embeddings in one place',
            'GPU-Direct NVMe: disk → GPU with zero CPU bottleneck',
            'No separate vector DB — FAISS lives alongside raw video',
            'Linear scale: 1PB and 100PB respond identically',
          ].map(pt => (
            <div key={pt} className="flex items-start gap-2 text-xs text-slate-600">
              <span style={{ color: '#10B981' }} className="mt-0.5 flex-shrink-0">●</span><span>{pt}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3 flex-shrink-0">
        <Kpi value="<1ms"  label="FAISS Search"    color="#76B900" bg="#F4FBEA" />
        <Kpi value="$0"    label="Vector DB Cost"  color="#3B82F6" bg="#EFF6FF" />
        <Kpi value=">85%"  label="GPU Utilization" color="#ED2738" bg="#FFF0F1" />
        <Kpi value="512d"  label="CLIP Dimensions" color="#F59E0B" bg="#FFFBEB" />
        <Kpi value="∞"     label="Scale Ceiling"   color="#10B981" bg="#ECFDF5" />
      </div>
    </div>
  )
}

function Slide08Business() {
  return (
    <div className="h-full flex flex-col p-10 bg-white">
      <SlideLabel num={8} tag="Business Case" />
      <h2 className="text-4xl font-black text-slate-900 mb-1">Strategic Value Framework</h2>
      <p className="text-slate-400 text-sm mb-7">GTC 2026 · NVIDIA VSS × DDN INFINIA</p>
      <div className="grid grid-cols-3 gap-5 flex-1">
        {[
          { label: 'Business Outcome', badge: 'Dark Data → Intelligence', fg: '#10B981', bg: '#ECFDF5',
            bullets: ['1 analyst replaces 3-person tagging team', 'PB-scale NLP search in <2 seconds', 'RTSP cameras searchable in real-time', 'Edge-case curation: weeks → minutes'],
            quote: '"Our video estate became a live intelligence asset."' },
          { label: 'Financial Outcome', badge: '$2M–$5M Eliminated', fg: '#F59E0B', bg: '#FFFBEB',
            bullets: ['$500K–$2M vector DB cost → $0 (FAISS GPU)', '$800K–$3M/yr cloud egress removed', 'Annotation budget eliminated', 'Zero marginal cost per FAISS query'],
            quote: '"One infra decision eliminated three budget lines."' },
          { label: 'AI Infrastructure', badge: 'GPU: 40% → >85%', fg: '#ED2738', bg: '#FFF0F1',
            bullets: ['CLIP + FAISS co-located on GPU — zero I/O starvation', 'RTSP → CLIP → FAISS in one GPU pass (<50ms)', 'NVIDIA VSS blueprint — zero integration debt', 'Auto-reindex on restart — zero manual ops'],
            quote: '"GPUs now run at the speed we paid for."' },
        ].map(p => (
          <div key={p.label} className="rounded-2xl p-5 flex flex-col"
            style={{ background: p.bg, border: `1.5px solid ${p.fg}25` }}>
            <div className="text-sm font-bold mb-1" style={{ color: p.fg }}>{p.label}</div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full w-fit mb-4"
              style={{ background: 'white', color: p.fg, border: `1px solid ${p.fg}30` }}>{p.badge}</span>
            <ul className="space-y-2 flex-1">
              {p.bullets.map(b => (
                <li key={b} className="text-xs text-slate-600 flex items-start gap-1.5">
                  <span style={{ color: p.fg }} className="mt-0.5 flex-shrink-0">→</span><span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-3 border-t" style={{ borderColor: `${p.fg}25` }}>
              <p className="text-xs italic" style={{ color: p.fg }}>{p.quote}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide09Closing() {
  return (
    <div className="h-full flex bg-white">
      <div className="w-1.5 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #76B900, #ED2738)' }} />
      <div className="w-72 flex-shrink-0 flex flex-col justify-between p-8 border-r border-slate-100"
        style={{ background: 'linear-gradient(160deg, #1E293B 60%, #0F172A 100%)' }}>
        <div>
          <div className="flex items-center gap-2 mb-10">
            <div className="w-2 h-2 rounded-full bg-[#ED2738]" />
            <div className="w-2 h-2 rounded-full" style={{ background: '#76B900' }} />
            <span className="text-white/30 text-[10px] font-mono ml-2 tracking-widest">GTC 2026</span>
          </div>
          <p className="text-white/70 text-xl font-light leading-relaxed mb-4">Your cameras are generating intelligence right now.</p>
          <p className="text-2xl font-bold leading-tight" style={{ color: '#76B900' }}>Are you capturing it?</p>
        </div>
        <div>
          <div className="space-y-2 mb-6">
            {['● Scan QR for live demo access', '● PoC: 2-week setup', '● Build.DDN.com/vss docs'].map(c => (
              <div key={c} className="text-white/30 text-xs">{c}</div>
            ))}
          </div>
          <p className="text-sm italic" style={{ color: '#76B900' }}>"Let me show you how."</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-14">
        <div className="mb-8">
          <div className="text-5xl font-black text-slate-900 mb-1">Build.DDN:VSS</div>
          <div className="text-slate-400 text-base">Multimodal Semantic Video Search</div>
        </div>
        <div className="flex items-center gap-4 mb-8">
          <span className="text-3xl font-black" style={{ color: '#ED2738' }}>DDN</span>
          <span className="text-slate-300 text-2xl">×</span>
          <span className="text-3xl font-black" style={{ color: '#76B900' }}>NVIDIA</span>
        </div>
        <div className="h-px bg-slate-100 mb-8" />
        <div className="grid grid-cols-2 gap-3 mb-8">
          {[
            { v: 'RTSP + VOD', l: 'Ingestion Sources', c: '#ED2738', bg: '#FFF0F1' },
            { v: 'FAISS GPU',  l: 'Vector Database',   c: '#76B900', bg: '#F4FBEA' },
            { v: '<1ms',       l: 'Search Latency',    c: '#3B82F6', bg: '#EFF6FF' },
            { v: '$0',         l: 'Vector DB License', c: '#F59E0B', bg: '#FFFBEB' },
          ].map(s => (
            <Kpi key={s.l} value={s.v} label={s.l} color={s.c} bg={s.bg} />
          ))}
        </div>
        <p className="text-slate-300 text-xs">NVIDIA GPU · DDN INFINIA · CLIP · BLIP · FAISS · MediaMTX · GTC 2026</p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN CONTROLLER
// ════════════════════════════════════════════════════════════════════════════
const slides = [
  { title: 'Cover',             component: Slide01Cover        },
  { title: 'The Challenge',     component: Slide02Problem      },
  { title: 'Architecture',      component: Slide03Architecture },
  { title: 'Live RTSP Streams', component: Slide04RTSP         },
  { title: 'FAISS Vector DB',   component: Slide05FAISS        },
  { title: 'Semantic Search',   component: Slide06Search       },
  { title: 'Full Pipeline',     component: Slide07Pipeline     },
  { title: 'Business Case',     component: Slide08Business     },
  { title: 'Closing',           component: Slide09Closing      },
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
      if (e.key === 'f' || e.key === 'F') { if (!fullscreen) containerRef.current?.requestFullscreen?.(); else document.exitFullscreen?.(); setFullscreen(f => !f) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, fullscreen])

  const ActiveSlide = slides[current].component

  return (
    <div ref={containerRef}
      className="min-h-[calc(100vh-var(--nav-height))] pt-[var(--nav-height)] flex flex-col bg-slate-100">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-white border-b border-slate-100 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: '#76B900' }}>GTC 2026</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-400">{slides[current].title}</span>
          <span className="w-1 h-1 rounded-full bg-slate-200" />
          <div className="flex items-center gap-1.5">
            <LiveDot /><span className="text-[10px] text-slate-400">2 cameras live</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button key={i} onClick={() => goTo(i)} title={s.title}
              className="rounded-full transition-all"
              style={{
                width: i === current ? '24px' : '6px',
                height: '6px',
                background: i === current ? '#76B900' : '#E2E8F0',
              }} />
          ))}
          <div className="w-px h-4 bg-slate-200 mx-2" />
          <button onClick={() => { if (!fullscreen) containerRef.current?.requestFullscreen?.(); else document.exitFullscreen?.(); setFullscreen(f => !f) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors">
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Slide */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div key={current} custom={direction} variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute inset-0">
            <ActiveSlide />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-slate-100 flex-shrink-0">
        <button onClick={goPrev} disabled={current === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all border"
          style={{
            background: current === 0 ? '#F8FAFC' : 'white',
            color: current === 0 ? '#CBD5E1' : '#475569',
            borderColor: current === 0 ? '#F1F5F9' : '#E2E8F0',
          }}>
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <span className="text-xs text-slate-300 font-mono">
          {current + 1} / {slides.length} · <span className="text-[#76B900]">F</span> fullscreen · <span className="text-[#76B900]">→</span> next
        </span>
        <button onClick={goNext} disabled={current === slides.length - 1}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all border"
          style={{
            background: current === slides.length - 1 ? '#F8FAFC' : '#F4FBEA',
            color: current === slides.length - 1 ? '#CBD5E1' : '#76B900',
            borderColor: current === slides.length - 1 ? '#F1F5F9' : 'rgba(118,185,0,0.35)',
          }}>
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
