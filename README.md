# Voice Clone Studio (local dashboard for FasterQwen3TTS)

A local web dashboard around the `qwen` package's `FasterQwen3TTS` — modeled after
[clonevoiceprompt.online/dashboard](https://clonevoiceprompt.online/dashboard)'s core generation flow:
named, reusable voice presets, style/stability controls, script input, generation history, and
play/download — **without** accounts, credits, or billing, which remain intentionally out of scope for
this local MVP.

```
webapp/
  qwen/       Vendored FasterQwen3TTS package (CUDA-graph-accelerated Qwen3-TTS wrapper) --
              see qwen/README.md and qwen/HOW_TO_RUN.md
  backend/
    main.py             FastAPI app: loads FasterQwen3TTS once, serves the REST API, runs
                        generation jobs in a background thread
    text_chunker.py     Splits a script into TTS-safe chunks (sentence boundaries first,
                        clause/word-boundary fallback for oversized sentences)
    audio_stitcher.py   Concatenates per-chunk audio with a silence gap between chunks
  frontend/   React + Vite + TypeScript dashboard
```

## Prerequisites

Follow `qwen/HOW_TO_RUN.md` first — CUDA-enabled torch, `qwen-tts`, `soundfile`, and a downloaded
model snapshot. This app reuses those exact same settings (`dtype=bfloat16`, `attn_implementation="sdpa"`,
`max_seq_len=1024`), tuned for a 4GB GPU.

Also needed:
```bash
pip install fastapi "uvicorn[standard]" python-multipart
```
```bash
cd webapp/frontend
npm install
```

## Configure

Edit `backend/main.py` and set `MODEL_PATH` to your local model snapshot path (the same one from
`HOW_TO_RUN.md` step 3).

## Run

Two terminals:

```bash
# Terminal 1 -- backend (loads the model; first startup takes a few seconds)
cd webapp/backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2 -- frontend (proxies /api and /audio to the backend, see vite.config.ts)
cd webapp/frontend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:5173**.

## Using it

1. **Saved presets** — lists previously saved voice presets; click "Use" to select one for generation, or
   "Delete" to remove it (and its reference audio) permanently.
2. **New preset** — name a preset, upload a short reference `.wav`/`.mp3` and its exact transcript, click
   "Save preset". It's immediately selected and persisted to disk (`backend/storage/presets.json`).
3. **Style & stability** — Natural/Clear/Expressive/Dramatic maps to the model's `instruct` prompt;
   Stable/Balanced/Creative maps to temperature/top-p/top-k.
4. **Script** — pick a language (populated from what the loaded model actually supports) and enter text
   (capped at 60,000 characters total — see the chunked pipeline below for how long scripts are actually
   generated on this hardware).
5. **Generate** — kicks off a generation job and shows live progress (`Generating... chunk N/M`) on the
   button while it runs; once done, produces a playable/downloadable `.wav` and adds an entry to History.
6. **History** — every generation is logged (preset used, text, style/stability, duration, timestamp)
   with inline playback, download, and delete, persisted to disk (`backend/storage/history.json`).

## Long-form generation: chunked pipeline

`max_seq_len=1024` bounds how much a *single* CUDA-graphed generation call can prefill+decode on this
4GB card. Past that, generation either hard-stops or — worse — audio quality degrades as the talker's
rotary position embeddings extrapolate past the range this model/config was validated for (it starts
slowing down, then trails off into non-speech noise). Rather than raising that number (which doesn't
fix the quality problem, and still caps the script length hard), long scripts are split into pieces and
generated independently:

```
Text  -->  Chunker  -->  TTS (per chunk, fresh KV cache)  -->  Stitcher  -->  Final .wav
```

- **Chunker** (`backend/text_chunker.py`) splits the script at sentence boundaries, greedily packing
  multiple sentences into each chunk up to `CHUNK_MAX_CHARS` (800 chars — the empirically-tested-safe
  size for `max_seq_len=1024` with a short reference clip, see `qwen/HOW_TO_RUN.md`). A single sentence
  longer than that falls back to clause boundaries, then word boundaries — text is never split mid-word.
- **Per-chunk generation** (`backend/main.py`, `_run_generate_job`) calls `generate_voice_clone` once per
  chunk. Each call gets its own fresh KV cache and rope state (this is what keeps quality stable no
  matter how many chunks came before — no chunk's cache position ever approaches `max_seq_len`). One
  retry per chunk on failure; a chunk that still fails aborts the job with a clear
  `"Chunk N/M failed: ..."` error rather than silently producing corrupt/partial output.
  - **v1 has no cross-chunk context carryover** — chunks are fully independent, so there's no prosody
    continuity across a chunk boundary (voice/style stay consistent since preset+style+stability are
    reapplied per chunk, but pacing/intonation resets per chunk). A short trailing-context-with-audio-trim
    approach was considered but deferred as unnecessarily fragile for v1; correctness over seamlessness.
- **Stitcher** (`backend/audio_stitcher.py`) concatenates the per-chunk audio with a 200ms silence gap
  between chunks to avoid clicky seams, and writes one final `.wav`.

Because a 60,000-character script can take well over an hour to generate sequentially on this GPU,
`/api/generate` returns immediately with a `job_id` instead of blocking:

- `POST /api/generate` → `{"job_id": "...", "total_chunks": N}` (job runs in a background thread)
- `GET /api/jobs/{job_id}` → `{"status": "running"|"done"|"error", "chunks_done": i, "total_chunks": N, "audio_url": ..., "error": ...}`

The frontend polls the job endpoint once a second and reflects `chunks_done`/`total_chunks` directly on
the Generate button.

## Known limitations (by design, for this local MVP)

- **No accounts/credits/billing.** Presets and history are global to this single local instance — there's
  no concept of separate users.
- **Single GPU, serialized requests.** `PredictorGraph`/`TalkerGraph`'s CUDA graphs and static buffers
  aren't reentrant, so the backend holds a global lock during generation — concurrent requests (and
  concurrent chunks within and across jobs) queue up rather than running in parallel. Fine for one local
  user, not for real multi-user traffic.
- **60,000 character script limit, but real wall-clock time scales with it.** Long scripts are chunked
  (see above) so they no longer degrade into noise or hard-fail, but generation is still sequential —
  60,000 characters is roughly 75 chunks and can take **over an hour** on this GPU. There's no cross-chunk
  prosody carryover in v1 (see above) and no partial-audio delivery — the frontend only gets audio once
  the whole job finishes; `chunks_done`/`total_chunks` progress is the only feedback during that time.
- **In-memory job state.** `_jobs` (job status/progress) lives in the backend process's memory, not on
  disk — restarting the backend mid-job loses that job's progress (though already-completed jobs' History
  entries are unaffected, since those are persisted separately).
- **Non-streaming only.** Each chunk calls `generate_voice_clone`, not the streaming variant, so a chunk's
  audio only appears once that whole chunk finishes. `generate_voice_clone_streaming` (in
  `qwen/streaming.py`) is already implemented and working — wiring it up (e.g. streaming finished chunks
  to the client as they land, instead of only at job completion) is a natural next step, just deferred.
- **No pagination/search.** Preset and history lists render in full — fine at local, single-user scale.

## Verified

Backend endpoints (`/api/health`, `/api/languages`, `/api/presets` CRUD, `/api/history` list/delete,
`/api/generate`, `/api/jobs/{id}`), the concurrency lock, **persistence of presets and history across a
backend restart**, and the full browser flow (create preset → select → style/stability → script →
generate → history → delete) have all been exercised end-to-end, producing real, non-silent generated
speech.

The chunked pipeline specifically was verified against the real model (not mocked): a multi-sentence
script correctly split into multiple chunks, each generated independently, stitched into one valid
non-silent `.wav`, with the Generate button showing live `chunk N/M` progress in a real browser session
(Playwright) and reverting to `Generate` on completion, zero console errors.
