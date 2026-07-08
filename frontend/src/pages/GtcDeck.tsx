import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Upload, UserCheck, Search, RefreshCw,
  Play, Pause, Volume2, VolumeX
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────
interface VideoSlotProps {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  accent: string
  accentBg: string
  badge: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60 }),
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SlideMeta({ num, title }: { num: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#ED2738] text-white text-xs font-bold">
        {String(num).padStart(2, '0')}
      </span>
      <span className="text-xs font-bold tracking-widest uppercase text-[#ED2738]">{title}</span>
    </div>
  )
}

function StatBadge({ value, label, color = '#ED2738', bg = '#fff5f5' }: {
  value: string; label: string; color?: string; bg?: string
}) {
  return (
    <div className="rounded-2xl px-5 py-4 text-center" style={{ background: bg, border: `1.5px solid ${color}20` }}>
      <div className="text-3xl font-black" style={{ color }}>{value}</div>
      <div className="text-xs mt-1 font-medium text-slate-500">{label}</div>
    </div>
  )
}

function PipelineStep({ num, title, sub, color, bg, last = false }: {
  num: string; title: string; sub: string; color: string; bg: string; last?: boolean
}) {
  return (
    <div className="flex items-center gap-0">
      <div className="rounded-2xl px-4 py-3 flex-shrink-0" style={{ background: bg, border: `1.5px solid ${color}` }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color }}>{num}</div>
        <div className="text-sm font-bold text-slate-800 leading-tight">{title}</div>
        <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{sub}</div>
      </div>
      {!last && (
        <svg className="w-8 h-4 flex-shrink-0 mx-1" viewBox="0 0 32 16" fill="none">
          <path d="M0 8 H28 M22 2 L30 8 L22 14" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}

function VideoSlot({ title, description, icon, accent, accentBg, badge }: VideoSlotProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSrc(URL.createObjectURL(file))
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true) }
    else { videoRef.current.pause(); setPlaying(false) }
  }

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: accentBg, border: `1.5px solid ${accent}30` }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: `1px solid ${accent}20` }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}18`, color: accent }}>
          {icon}
        </div>
        <div>
          <div className="text-sm font-bold text-slate-800 leading-tight">{title}</div>
          <div className="text-[11px] text-slate-500 leading-tight">{description}</div>
        </div>
        <span className="ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: `${accent}15`, color: accent }}>{badge}</span>
      </div>

      {/* Video area */}
      <div className="relative flex-1 min-h-[160px] flex items-center justify-center bg-slate-900 overflow-hidden">
        {src ? (
          <>
            <video
              ref={videoRef}
              src={src}
              muted={muted}
              loop
              className="w-full h-full object-cover"
              onEnded={() => setPlaying(false)}
            />
            {/* Controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-2"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
              <button onClick={togglePlay}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted }}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <div className="ml-auto text-[10px] text-white/60 font-medium">Live Demo</div>
            </div>
          </>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-5 rounded-xl transition-all hover:scale-105"
            style={{ border: `1.5px dashed ${accent}50`, background: `${accent}08` }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: `${accent}18`, color: accent }}>
              <Upload className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-slate-500">Drop video or click to upload</span>
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
          </button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDES
// ══════════════════════════════════════════════════════════════════════════════

function Slide01Cover() {
  return (
    <div className="h-full flex">
      {/* Left dark panel */}
      <div className="w-80 flex-shrink-0 flex flex-col justify-between p-8"
        style={{ background: 'linear-gradient(160deg,#1e293b 60%,#0f172a 100%)' }}>
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-2 h-2 rounded-full bg-[#ED2738]" />
            <div className="w-2 h-2 rounded-full bg-[#76B900]" />
            <div className="w-8 h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />
            <span className="text-white/40 text-xs font-medium">GTC 2026</span>
          </div>
          <div className="text-4xl font-black text-white mb-1">DDN</div>
          <div className="text-lg font-light text-white/50 mb-6">INFINIA</div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-px bg-white/20" />
            <span className="text-white/30 text-xs">×</span>
            <div className="w-6 h-px bg-white/20" />
          </div>
          <div className="text-2xl font-bold mt-4" style={{ color: '#76B900' }}>NVIDIA</div>
          <div className="text-xs text-white/40 mt-1">VSS Blueprint</div>
        </div>
        <div>
          <div className="text-[10px] text-white/30 font-medium uppercase tracking-widest">DDN Theatre Booth</div>
          <div className="text-[10px] text-white/20 mt-1">Build.DDN:VSS  ·  Multimodal Semantic Video Search</div>
        </div>
      </div>

      {/* Right white content */}
      <div className="flex-1 flex flex-col justify-center px-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 w-fit"
          style={{ background: '#FFF8E6', border: '1px solid #F59E0B30' }}>
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#F59E0B' }}>
            ✦ GTC 2026 Showcase
          </span>
        </div>
        <h1 className="text-5xl font-black text-slate-900 leading-tight mb-2">
          From Video Chaos
        </h1>
        <h1 className="text-5xl font-black leading-tight mb-2" style={{ color: '#ED2738' }}>
          to Instant
        </h1>
        <h1 className="text-5xl font-black text-slate-900 leading-tight mb-6">
          Intelligence.
        </h1>
        <p className="text-slate-500 text-base leading-relaxed max-w-md mb-8">
          AI-powered semantic search across petabyte-scale video — natural language queries,
          sub-2-second results, no separate vector database.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'GPU Accelerated', color: '#ED2738', bg: '#FFF0F1' },
            { label: 'Multimodal AI',   color: '#76B900', bg: '#F4FBEA' },
            { label: 'DDN Native',      color: '#3B82F6', bg: '#EFF6FF' },
            { label: 'LLM Enriched',    color: '#F59E0B', bg: '#FFFBEB' },
          ].map(p => (
            <span key={p.label} className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: p.bg, color: p.color, border: `1px solid ${p.color}25` }}>
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
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={2} title="The Challenge" />
      <h2 className="text-3xl font-black text-slate-900 mb-2">The Problem with Video Data</h2>
      <p className="text-slate-500 mb-6 text-sm">
        Enterprises sit on petabytes of dark, untagged video. AI teams burn weeks finding edge cases for model fine-tuning.
      </p>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            icon: '🕒', title: 'Hours of Manual Search',
            body: 'Analysts scrub through footage frame-by-frame—timestamp by timestamp. Traditional CCTV has no semantic awareness.',
            color: '#ED2738', bg: '#FFF0F1',
          },
          {
            icon: '💸', title: '$2M–$5M Wasted Annually',
            body: 'Manual annotation tooling, vector DB licenses, cloud egress bills, and S3 cold-storage tiers compound into runaway cost.',
            color: '#F59E0B', bg: '#FFFBEB',
          },
          {
            icon: '🔒', title: '95% Dark Data',
            body: 'The vast majority of enterprise video is siloed, unindexed, and invisible to AI training pipelines — a cost center with zero intelligence value.',
            color: '#8B5CF6', bg: '#F5F3FF',
          },
        ].map(card => (
          <div key={card.title} className="rounded-2xl p-6 flex flex-col"
            style={{ background: card.bg, border: `1.5px solid ${card.color}25` }}>
            <div className="text-3xl mb-3">{card.icon}</div>
            <div className="text-base font-bold mb-2" style={{ color: card.color }}>{card.title}</div>
            <p className="text-slate-500 text-sm leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide03Solution() {
  return (
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={3} title="The Solution" />
      <h2 className="text-3xl font-black text-slate-900 mb-2">Type It. Find It. Act On It.</h2>

      {/* Search box */}
      <div className="rounded-2xl px-5 py-3.5 mb-3 flex items-center gap-3"
        style={{ background: '#F4FBEA', border: '1.5px solid #76B90060' }}>
        <Search className="w-5 h-5 flex-shrink-0 text-slate-400" />
        <span className="text-slate-700 text-base font-medium">
          "White SUV near Gate 3 between 14:00 and 20:00"
        </span>
        <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ background: '#76B90015', color: '#76B900' }}>
          Results in &lt;2s
        </span>
      </div>

      {/* Tag pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          ['#vehicle_presence', '#10B981', '#ECFDF5'],
          ['#restricted_access', '#ED2738', '#FFF0F1'],
          ['#crowd_density_high', '#F59E0B', '#FFFBEB'],
          ['#low_visibility_fog', '#3B82F6', '#EFF6FF'],
          ['#pedestrian_zone',   '#8B5CF6', '#F5F3FF'],
          ['#gate3_perimeter',   '#76B900', '#F4FBEA'],
        ].map(([tag, color, bg]) => (
          <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: bg, color, border: `1px solid ${color}30` }}>
            {tag}
          </span>
        ))}
      </div>

      <div className="w-full h-px bg-slate-100 mb-5" />

      {/* 3 capabilities */}
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            icon: '🧠', title: 'Semantic Understanding',
            body: 'Maps synonyms automatically — "car crash" finds "vehicle collision". Understands scenes, objects, behaviors and context.',
            color: '#76B900', bg: '#F4FBEA',
          },
          {
            icon: '⚡', title: 'GPU-Accelerated AI',
            body: 'BLIP captions every keyframe. CLIP creates semantic embeddings co-located with video in DDN Infinia. Zero data movement.',
            color: '#ED2738', bg: '#FFF0F1',
          },
          {
            icon: '💬', title: 'LLM Enrichment',
            body: 'GPT-4o-mini or Ollama 7B generates narrative summaries and AI search hashtags automatically on every upload.',
            color: '#3B82F6', bg: '#EFF6FF',
          },
        ].map(c => (
          <div key={c.title} className="rounded-2xl p-5 flex flex-col"
            style={{ background: c.bg, border: `1.5px solid ${c.color}25` }}>
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-sm font-bold mb-1" style={{ color: c.color }}>{c.title}</div>
            <p className="text-slate-500 text-xs leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide04Architecture() {
  return (
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={4} title="Architecture" />
      <h2 className="text-3xl font-black text-slate-900 mb-1">How It Works Under the Hood</h2>
      <p className="text-slate-400 text-sm mb-6">Built on NVIDIA VSS Blueprint · Powered by DDN Infinia</p>

      {/* Pipeline */}
      <div className="flex items-start gap-1 overflow-x-auto mb-6 flex-shrink-0">
        {[
          { n: '01', t: 'Video Upload', s: 'MP4 / MOV drag-in', c: '#ED2738', bg: '#FFF0F1' },
          { n: '02', t: 'GPU Chunking', s: 'Scene segmentation', c: '#F59E0B', bg: '#FFFBEB' },
          { n: '03', t: 'AI Analysis',  s: 'BLIP + CLIP embeds', c: '#76B900', bg: '#F4FBEA' },
          { n: '04', t: 'LLM Enrich',  s: 'GPT-4o / Ollama 7B', c: '#3B82F6', bg: '#EFF6FF' },
          { n: '05', t: 'DDN Infinia', s: 'Metadata + vectors', c: '#10B981', bg: '#ECFDF5' },
        ].map((s, i) => (
          <PipelineStep key={i} num={s.n} title={s.t} sub={s.s} color={s.c} bg={s.bg} last={i === 4} />
        ))}
      </div>

      {/* Infinia callout */}
      <div className="rounded-2xl p-5 mb-5 flex-shrink-0"
        style={{ background: '#F4FBEA', border: '1.5px solid #76B90040' }}>
        <div className="text-sm font-bold mb-3" style={{ color: '#76B900' }}>
          ★ DDN Infinia — The Intelligence Layer
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {[
            'Distributed key-value store — unlimited metadata capacity',
            'GPU-Direct NVMe: disk → GPU with zero CPU bottleneck',
            'No separate vector DB — CLIP embeddings stored natively',
            'Linear scale: 1PB and 100PB respond identically',
          ].map(pt => (
            <div key={pt} className="flex items-start gap-2 text-xs text-slate-600">
              <span style={{ color: '#76B900' }} className="mt-0.5">●</span>
              <span>{pt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stat badges */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <StatBadge value="~40%→>85%" label="GPU Utilization" color="#ED2738" bg="#FFF0F1" />
        <StatBadge value="< 2s"    label="Query Latency"   color="#76B900" bg="#F4FBEA" />
        <StatBadge value="$0"      label="Vector DB Cost"  color="#3B82F6" bg="#EFF6FF" />
        <StatBadge value="∞"       label="Scale Ceiling"   color="#10B981" bg="#ECFDF5" />
      </div>
    </div>
  )
}

function Slide05Ingestion() {
  return (
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={5} title="Demo 01 · Ingestion" />
      <h2 className="text-3xl font-black text-slate-900 mb-1">Video Ingestion Pipeline</h2>
      <p className="text-slate-400 text-sm mb-6">
        Upload any video → GPU chunking → AI analysis → LLM enrichment → stored in DDN Infinia with full metadata
      </p>

      <div className="flex gap-6 flex-1">
        {/* Video slot */}
        <div className="w-[52%] flex-shrink-0">
          <VideoSlot
            id="ingestion"
            title="Ingestion Demo"
            description="Upload video & watch AI processing in real time"
            icon={<Upload className="w-4 h-4" />}
            accent="#ED2738"
            accentBg="#FFF8F8"
            badge="Demo 01"
          />
        </div>

        {/* Steps */}
        <div className="flex-1 flex flex-col gap-3">
          {[
            { n: '1', t: 'Upload Trigger',     d: 'Video dropped into the Media Intelligence page — stored instantly to DDN Infinia raw bucket.',                                           c: '#ED2738' },
            { n: '2', t: 'GPU Frame Analysis', d: 'BLIP generates captions for every keyframe. CLIP creates 512-dim semantic embeddings — all on GPU, co-located with storage.',          c: '#F59E0B' },
            { n: '3', t: 'LLM Enrichment',     d: 'GPT-4o-mini or Ollama 7B synthesizes captions into a narrative summary and generates AI search hashtags.',                            c: '#76B900' },
            { n: '4', t: 'Manifest Written',   d: 'All metadata — summary, enriched tags, embeddings, chunk paths — stored natively on the Infinia object. No separate DB.',             c: '#3B82F6' },
          ].map(step => (
            <div key={step.n} className="flex items-start gap-3 rounded-xl p-3.5"
              style={{ background: `${step.c}08`, border: `1px solid ${step.c}20` }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                style={{ background: step.c }}>
                {step.n}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">{step.t}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Slide06HumanLoop() {
  return (
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={6} title="Demo 02 · Human in the Loop" />
      <h2 className="text-3xl font-black text-slate-900 mb-1">Human-in-the-Loop Curation</h2>
      <p className="text-slate-400 text-sm mb-6">
        Review AI-generated tags, refine summaries, add context — every edit persists to DDN Infinia instantly
      </p>

      <div className="flex gap-6 flex-1">
        {/* Video slot */}
        <div className="w-[52%] flex-shrink-0">
          <VideoSlot
            id="human-loop"
            title="Human in the Loop Demo"
            description="Edit AI tags & summaries on the video card"
            icon={<UserCheck className="w-4 h-4" />}
            accent="#8B5CF6"
            accentBg="#F8F5FF"
            badge="Demo 02"
          />
        </div>

        {/* Explanation */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="rounded-2xl p-4" style={{ background: '#F8F5FF', border: '1.5px solid #8B5CF620' }}>
            <div className="text-sm font-bold mb-2" style={{ color: '#8B5CF6' }}>What the Analyst Sees</div>
            <div className="space-y-2">
              {[
                '🔮  AI-generated summary shown in orange "Enriched" card',
                '#️⃣  LLM search tags displayed as orange hashtag pills',
                '✏️  Click Edit to modify tags or summary inline',
                '💾  Save writes directly back to DDN Infinia manifest',
              ].map(item => (
                <div key={item} className="text-xs text-slate-600 flex items-start gap-2">
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#F4FBEA', border: '1.5px solid #76B90020' }}>
            <div className="text-sm font-bold mb-2" style={{ color: '#76B900' }}>Why This Matters</div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ground-truth annotations from domain experts improve search precision over time.
              AI does the heavy lifting; humans add the context that models miss.
              All corrections are stored as enriched metadata — searchable immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide07Search() {
  return (
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={7} title="Demo 03 · Semantic Search" />
      <h2 className="text-3xl font-black text-slate-900 mb-1">Natural Language Search</h2>
      <p className="text-slate-400 text-sm mb-4">
        Search the entire video archive with plain English — results in under 2 seconds, at any scale
      </p>

      {/* Example queries */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          '"Person in red jacket near entrance"',
          '"Crowded corridor with bags"',
          '"Empty parking lot at night"',
          '"Two people arguing"',
        ].map(q => (
          <span key={q} className="px-3 py-1.5 rounded-full text-xs text-slate-600 font-medium"
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
            {q}
          </span>
        ))}
      </div>

      <div className="flex gap-6 flex-1">
        {/* Video slot */}
        <div className="w-[52%] flex-shrink-0">
          <VideoSlot
            id="search"
            title="Search Demo"
            description="Watch natural language query return video clips"
            icon={<Search className="w-4 h-4" />}
            accent="#3B82F6"
            accentBg="#F0F7FF"
            badge="Demo 03"
          />
        </div>

        {/* How it works */}
        <div className="flex-1 flex flex-col gap-3">
          {[
            { icon: '🔤', t: 'Query Embedding', d: 'Your text query is embedded via CLIP into the same 512-dim vector space as the video frames.',      c: '#3B82F6' },
            { icon: '🔍', t: 'Cosine Similarity', d: 'Similarity search runs across all stored embeddings in DDN Infinia — no round-trip to a separate vector DB.', c: '#8B5CF6' },
            { icon: '🏷️', t: 'Tag Matching',    d: 'LLM-enriched hashtags are also matched — boosting recall for domain-specific terminology.',           c: '#10B981' },
            { icon: '⚡', t: 'Sub-2s Results',   d: 'Ranked results surface with presigned video URLs, AI summaries, and matched tags — ready to play.', c: '#F59E0B' },
          ].map(step => (
            <div key={step.t} className="flex items-start gap-3 rounded-xl p-3"
              style={{ background: `${step.c}08`, border: `1px solid ${step.c}20` }}>
              <span className="text-lg">{step.icon}</span>
              <div>
                <div className="text-xs font-bold" style={{ color: step.c }}>{step.t}</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{step.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Slide08ContinuousIngestion() {
  return (
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={8} title="Demo 04 · Continuous Ingestion" />
      <h2 className="text-3xl font-black text-slate-900 mb-1">Continuous Ingestion — Always On</h2>
      <p className="text-slate-400 text-sm mb-4">
        Bucket monitor watches DDN Infinia for new uploads — AI enrichment runs automatically, 24/7
      </p>

      <div className="flex gap-6 flex-1">
        {/* Video slot */}
        <div className="w-[52%] flex-shrink-0">
          <VideoSlot
            id="continuous"
            title="Continuous Ingestion Demo"
            description="Watch the pipeline auto-process new uploads"
            icon={<RefreshCw className="w-4 h-4" />}
            accent="#10B981"
            accentBg="#F0FDF8"
            badge="Demo 04"
          />
        </div>

        {/* How it works */}
        <div className="flex-1 flex flex-col gap-3">
          <div className="rounded-2xl p-4 flex-shrink-0" style={{ background: '#ECFDF5', border: '1.5px solid #10B98120' }}>
            <div className="text-sm font-bold mb-3" style={{ color: '#10B981' }}>How the Pipeline Runs</div>
            <div className="space-y-2.5">
              {[
                { icon: '👁️', label: 'Bucket Monitor polls DDN Infinia every 30s for new objects' },
                { icon: '🤖', label: 'New video triggers automatic GPU-accelerated AI processing' },
                { icon: '✨', label: 'LLM enrichment runs on completion — tags + summary written to manifest' },
                { icon: '🔎', label: 'Video is immediately searchable — no manual intervention required' },
              ].map(pt => (
                <div key={pt.label} className="flex items-start gap-2 text-xs text-slate-600">
                  <span>{pt.icon}</span>
                  <span>{pt.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#F4FBEA', border: '1px solid #76B90015' }}>
            <div className="text-xs font-bold mb-1" style={{ color: '#76B900' }}>Scalability</div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Scales linearly with DDN Infinia — adding 100TB of new video requires zero rebalancing,
              zero reindexing, zero downtime. Every new asset is live the moment processing completes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Slide09BusinessCase() {
  return (
    <div className="h-full flex flex-col p-10">
      <SlideMeta num={9} title="Business Case" />
      <h2 className="text-3xl font-black text-slate-900 mb-1">Strategic Value Framework</h2>
      <p className="text-slate-400 text-sm mb-6">GTC 2026 Showcase · NVIDIA VSS × DDN Infinia</p>

      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            label: 'Business Outcome',
            badge: 'Dark Data → Intelligence',
            fg: '#10B981', bg: '#ECFDF5',
            bullets: [
              '1 analyst replaces 3-person tagging team',
              'PB-scale NLP results in < 2 seconds',
              'Edge-case curation: weeks → minutes',
              'AI iteration: months → days',
            ],
            quote: '"Our data estate became an active intelligence asset."',
          },
          {
            label: 'Financial Outcome',
            badge: '$2M–$5M Eliminated',
            fg: '#F59E0B', bg: '#FFFBEB',
            bullets: [
              '$500K–$2M vector DB deferred to $0',
              '$800K–$3M/yr egress costs removed',
              'Annotation budget eliminated',
              'CLIP reuse → zero marginal cost per query',
            ],
            quote: '"One infra decision eliminated three budget lines."',
          },
          {
            label: 'AI Infra Impact',
            badge: 'GPU: 40% → >85%',
            fg: '#ED2738', bg: '#FFF0F1',
            bullets: [
              'Co-located inference — zero I/O starvation',
              'Sub-2s TTFT (time-to-first-token)',
              'NVIDIA VSS blueprint — zero integration debt',
              'Linear scale — no rebalancing needed',
            ],
            quote: '"GPUs now run at the speed we paid for."',
          },
        ].map(p => (
          <div key={p.label} className="rounded-2xl p-5 flex flex-col"
            style={{ background: p.bg, border: `1.5px solid ${p.fg}25` }}>
            <div className="text-sm font-bold mb-1" style={{ color: p.fg }}>{p.label}</div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full w-fit mb-3"
              style={{ background: 'white', color: p.fg, border: `1px solid ${p.fg}30` }}>
              {p.badge}
            </span>
            <ul className="space-y-1.5 flex-1">
              {p.bullets.map(b => (
                <li key={b} className="text-xs text-slate-600 flex items-start gap-1.5">
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

function Slide10Closing() {
  return (
    <div className="h-full flex">
      {/* Left dark panel */}
      <div className="w-80 flex-shrink-0 flex flex-col justify-between p-8"
        style={{ background: 'linear-gradient(160deg,#1e293b 60%,#0f172a 100%)' }}>
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-2 h-2 rounded-full bg-[#ED2738]" />
            <div className="w-2 h-2 rounded-full bg-[#76B900]" />
            <span className="text-white/40 text-xs font-medium ml-2">GTC 2026</span>
          </div>
          <p className="text-white/70 text-xl font-light leading-relaxed mb-4">
            Abu Dhabi's infrastructure is world-class.
          </p>
          <p className="text-amber-400 text-2xl font-bold leading-tight">
            Your video intelligence should match it.
          </p>
        </div>
        <div>
          <div className="space-y-2 mb-6">
            {[
              '● Scan QR for live demo access',
              '● Proof of concept discussions',
              '● Build.DDN.com documentation',
            ].map(c => (
              <div key={c} className="text-white/40 text-xs">{c}</div>
            ))}
          </div>
          <p className="text-amber-400/80 text-sm italic">"Let me show you how."</p>
        </div>
      </div>

      {/* Right content */}
      <div className="flex-1 flex flex-col justify-center px-12">
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

        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatBadge value="< 2s"  label="results at any scale" color="#ED2738" bg="#FFF0F1" />
          <StatBadge value=">85%"  label="GPU utilization"       color="#76B900" bg="#F4FBEA" />
          <StatBadge value="$0"    label="vector DB cost"        color="#3B82F6" bg="#EFF6FF" />
        </div>

        <p className="text-slate-400 text-xs">
          Powered by NVIDIA GPU  ·  Stored on DDN Infinia  ·  GTC 2026
        </p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const slides = [
  { title: 'Cover',                component: Slide01Cover },
  { title: 'The Problem',          component: Slide02Problem },
  { title: 'The Solution',         component: Slide03Solution },
  { title: 'Architecture',         component: Slide04Architecture },
  { title: 'Demo: Ingestion',      component: Slide05Ingestion },
  { title: 'Human in the Loop',    component: Slide06HumanLoop },
  { title: 'Semantic Search',      component: Slide07Search },
  { title: 'Continuous Ingestion', component: Slide08ContinuousIngestion },
  { title: 'Business Case',        component: Slide09BusinessCase },
  { title: 'Closing',              component: Slide10Closing },
]

export default function GtcDeck() {
  const [current, setCurrent] = useState(0)
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

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Space') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp') { e.preventDefault(); goPrev() }
      if (e.key === 'Escape') setFullscreen(false)
      if (e.key === 'f' || e.key === 'F') setFullscreen(f => !f)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev])

  const toggleFullscreen = () => {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
    setFullscreen(f => !f)
  }

  const ActiveSlide = slides[current].component

  return (
    <div className="min-h-[calc(100vh-var(--nav-height))] pt-[var(--nav-height)] bg-slate-50 flex flex-col">
      {/* Deck header bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[#ED2738] tracking-widest uppercase">GTC 2026 Deck</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-400">{slides[current].title}</span>
        </div>

        {/* Slide dots */}
        <div className="hidden md:flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              title={s.title}
              className={`rounded-full transition-all duration-200 ${
                i === current
                  ? 'w-6 h-2 bg-[#ED2738]'
                  : 'w-2 h-2 bg-slate-200 hover:bg-slate-300'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">
            {current + 1} / {slides.length}
          </span>
          <button onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Slide stage */}
      <div ref={containerRef} className="flex-1 flex flex-col mx-auto w-full max-w-[1280px] px-4 py-4">
        <div className="relative flex-1 bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100"
          style={{ minHeight: '560px' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              <ActiveSlide />
            </motion.div>
          </AnimatePresence>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100">
            <motion.div
              className="h-full bg-gradient-to-r from-[#ED2738] to-[#76B900]"
              animate={{ width: `${((current + 1) / slides.length) * 100}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Navigation controls */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={goPrev}
            disabled={current === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 text-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          {/* Slide labels strip */}
          <div className="hidden md:flex items-center gap-1 overflow-hidden max-w-[600px]">
            {slides.map((s, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`text-[10px] px-2.5 py-1 rounded-lg transition-all whitespace-nowrap font-medium ${
                  i === current
                    ? 'bg-[#ED2738] text-white'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>

          <button
            onClick={goNext}
            disabled={current === slides.length - 1}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 text-slate-600"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Keyboard hint */}
        <div className="text-center mt-2">
          <span className="text-[11px] text-slate-300">
            ← → Arrow keys to navigate  ·  F for fullscreen  ·  Click slide dots above
          </span>
        </div>
      </div>
    </div>
  )
}
