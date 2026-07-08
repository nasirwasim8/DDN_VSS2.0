# GTC 2026 Presenter Script — Build.DDN:VSS
### *DDN Theatre Booth · Storytelling Style · ~8–10 min*

---

## 🎬 SLIDE 1 — COVER
> *Stand tall. Own the room. Let a beat of silence land before you speak.*

**"Every GPU cluster in this building is solving hard problems.**
**But most of them are starving.**

Not for compute. Not for memory.
They're starving for *data they can actually use.*

Video data is the fastest-growing asset in the enterprise —
and ninety-five percent of it sits completely dark. Untagged. Unindexed. Invisible.

What you are about to see is what happens when you fix that.

Welcome to **Build.DDN:VSS** — AI-powered semantic video search,
built on NVIDIA's VSS blueprint, running natively on DDN Infinia."**

---

## 📖 SLIDE 2 — THE PROBLEM
> *Slow down here. Let the pain resonate — this is the hook.*

**"Let me paint a picture you've probably lived.**

An AI team needs training data — specific edge cases. A vehicle turning left in rain.
A crowded corridor at night. A fall detection false positive.
They know it exists somewhere in their video archive.
It might be petabytes of footage across hundreds of cameras.

So what do they do?
They scrub. Manually. Frame by frame. Timestamp by timestamp.

Hours become days. Days become weeks.
Meanwhile, model training is blocked. GPU cluster sits idle.
The team that was hired to *build AI* becomes a video tagging service.

This costs **2 to 5 million dollars a year** — before you even count the delay cost.

And 95% of that video? Never touched again.
A cost center with zero intelligence value.

This is the problem we came to GTC to solve."**

---

## 💡 SLIDE 3 — THE SOLUTION
> *Energy shifts here — lift your voice.*

**"Here's what the solution looks like.**

*'White SUV near Gate 3 between 14:00 and 20:00.'*
Results. In under two seconds.

Not keyword search. Not folder-browsing. Not playing footage from timestamp.
**Semantic understanding.** The system knows 'car crash' and 'vehicle collision'
are the same thing. It understands scenes, objects, behaviors, and context.

Every frame has been analyzed by GPU-accelerated AI.
Every video has been summarized by a language model.
Every clip is tagged, embedded, and instantly retrievable.

You type what happened. You get exactly those moments.
At any scale."**

---

## 🏗️ SLIDE 4 — ARCHITECTURE
> *This is the credibility slide. Be precise but keep momentum.*

**"Let me show you how this works under the hood — because the architecture
is what makes this genuinely different.**

This is built on **NVIDIA's VSS Blueprint** — the production reference architecture
for intelligent video pipelines.
Every video that comes in goes through five automated stages:

Upload → GPU Chunking → AI Analysis — BLIP captions every keyframe, CLIP creates
512-dimensional semantic embeddings — → LLM Enrichment with GPT-4o or Ollama 7B
→ stored natively in **DDN Infinia**.

Now here's where most platforms fall apart at scale:
they separate storage from intelligence. You get a video file, a filename, a timestamp.
That's it. Your vector database is somewhere else. Your metadata is somewhere else.
Your inference pipeline is starving on I/O.

**Infinia changes the equation entirely.**

It's a distributed key-value store with unlimited metadata capacity.
Every object in Infinia *carries its own intelligence* — AI summaries, semantic tags,
CLIP embeddings — all indexed, all queryable, alongside the object itself.

And because Infinia is GPU-Direct NVMe enabled,
frames move from disk straight to GPU with zero CPU bottleneck.

The result? Over 85% GPU utilization. Sub-2-second query latency.
Zero vector database cost. And no scale ceiling.

Let me show you that live."**

---

## 🎬 SLIDE 5 — DEMO 01: INGESTION
> *Walk to the screen. Point to the pipeline steps as they animate in.*

**"This is Demo 01 — the Ingestion Pipeline.**

Watch what happens the moment a video hits the system.

Step one: It lands in DDN Infinia's raw bucket instantly.
Step two: GPU Frame Analysis kicks in — BLIP captions every keyframe,
CLIP creates 512-dim semantic embeddings, *all on GPU, co-located with storage.*
Step three: An LLM synthesizes those captions into a narrative summary —
not individual frame descriptions, but a coherent story about what the video contains.
Step four: The manifest is written. Summary, enriched tags, embeddings, chunk paths —
stored natively on the Infinia object. No separate database. No ETL. No delay."**

> *(Press → to trigger video)*

**"Watch this run."**

> *(Video plays — let it breathe, narrate what's happening on screen)*

**"You can see the pipeline working in real time.
The moment that manifest is written — that video is searchable.
Not after a batch job. Not after a reindex.
*Immediately.*"**

> *(Press → when ready to advance)*

---

## 🧑‍💼 SLIDE 6 — DEMO 02: HUMAN IN THE LOOP
> *Pause. Change tone — more intimate, conversational.*

**"AI gets you 90% of the way there.
But there are things models miss — domain context, operational nuance,
the kind of knowledge that lives in your expert's head, not in a training set.

This is Demo 02 — Human-in-the-Loop curation.

Every video in the library shows its AI-generated summary in an orange 'Enriched' card.
The LLM search tags appear as hashtag pills.

And here's the key: an analyst can click Edit, modify a tag or rewrite the summary,
hit Save — and that correction writes *directly back to the DDN Infinia manifest.*
Instantly searchable. Immediately available to every downstream query.

AI does the heavy lifting. Humans add the context models miss.
And every correction *makes the system smarter.*"**

> *(Press → to trigger video)*

> *(Video plays)*

> *(Press → when ready to advance)*

---

## 🔍 SLIDE 7 — DEMO 03: SEMANTIC SEARCH
> *This is the money slide. Build anticipation.*

**"Now — here's where it all comes together.

Demo 03. Natural language search across the entire video archive.

Your text query — whatever you type — gets embedded by CLIP into the same
512-dimensional vector space as the video frames that were already indexed.

Then we run a cosine similarity search across every stored embedding
in DDN Infinia — with no round-trip to a separate vector database.
LLM-enriched hashtags are also matched, boosting recall for domain terminology.

Ranked results surface with presigned video URLs, AI summaries, and matched tags —
ready to play. In under two seconds.

Try: *'Person in red jacket near entrance.'*
Or: *'Two people arguing.'*
Or: *'Empty parking lot at night.'*

Plain English. No schema. No metadata form. No query language to learn."**

> *(Press → to trigger video)*

> *(Video plays — react naturally to the results)*

**"There it is. Sub-two-second results.
Petabyte scale. No external vector DB.
GPU collocated with storage."**

> *(Press → when ready to advance)*

---

## ♻️ SLIDE 8 — DEMO 04: CONTINUOUS INGESTION
> *Energy up — this is the 'always on' crescendo.*

**"The final demo. And this one changes the operational model entirely.

Demo 04 — Continuous Ingestion. Always on.

A bucket monitor watches DDN Infinia on a 30-second polling cycle.
The moment a new video appears — it's automatically queued for processing.
GPU-accelerated AI runs. LLM enrichment completes. Manifest is written.
Video is searchable. *No human intervention required.*

This isn't a batch job you schedule at 2 AM.
This is a live intelligence pipeline — processing your data as fast as it arrives.

And scaling it is trivial.
Add 100 terabytes of new video — zero rebalancing, zero reindexing, zero downtime.
Every new asset is live the moment processing completes."**

> *(Press → to trigger video)*

> *(Video plays)*

> *(Press → when ready to advance)*

---

## 💼 SLIDE 9 — BUSINESS CASE
> *Ground it in numbers. Speak to both technical and business audience.*

**"Let me make this concrete — because this is what the CFO and the CTO
both need to hear.

**Business Outcome:** One analyst now replaces a three-person manual tagging team.
Edge-case curation drops from weeks to minutes.
AI iteration cycles: months to days.

**Financial Outcome:** $500K to $2 million in vector database licensing — gone.
$800K to $3 million a year in cloud egress costs — removed.
The entire annotation budget — eliminated.
Because CLIP embeddings live in Infinia. Zero marginal cost per query.

**AI Infrastructure Impact:** GPU utilization climbs from 40% to over 85%.
Because your GPUs are no longer waiting for data.
They're co-located with the storage.
Sub-2-second time-to-first-result. NVIDIA VSS blueprint. Zero integration debt.

One infrastructure decision. Three budget lines eliminated.
*GPUs running at the speed you paid for.*"**

---

## 🎯 SLIDE 10 — CLOSE
> *Back to theatre mode. Slow, deliberate, powerful.*

**"Enterprise-scale video is growing faster than humans can manage it.**

Every camera network, every production line, every autonomous vehicle fleet
is generating footage that compounds daily.
The teams trying to make sense of it are falling behind.

The question has never been whether AI can analyze video.
The question is whether your *infrastructure* can support AI at that scale —
without burning budget on vector databases, cloud egress, annotation teams,
and IO-starved GPU clusters.

**Build.DDN:VSS answers that question.**

Sub-2-second results. Over 85% GPU utilization.
Zero vector DB cost. Unlimited scale ceiling.

Built on NVIDIA VSS. Running on DDN Infinia.

*Your AI infrastructure should be built for what's next.*

Scan the QR code for live demo access.
Come talk to us at the DDN Theatre Booth.
We'd love to run a proof of concept with your data.

Thank you."**

---

## ⏱️ TIMING GUIDE

| Slide | Content | Approx. Time |
|-------|---------|-------------|
| 1 | Cover / Hook | 30s |
| 2 | The Problem | 60s |
| 3 | Solution | 45s |
| 4 | Architecture | 90s |
| 5 | Demo — Ingestion | 90s |
| 6 | Demo — HITL | 75s |
| 7 | Demo — Search | 90s |
| 8 | Demo — Continuous | 75s |
| 9 | Business Case | 60s |
| 10 | Close | 45s |
| **Total** | | **~10–12 min** |

---

> **Delivery Tips:**
> - Pause after every strong statement. Let it land.
> - Point to the slide when referencing specific numbers.
> - On demo slides, narrate what's happening on screen — don't go silent.
> - The close should feel like a theatre curtain coming down. Earn it.
