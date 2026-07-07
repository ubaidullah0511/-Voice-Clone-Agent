import json
import logging
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

sys.path.insert(0, r"D:\projects")  # parent of the `qwen` package

import numpy as np
import torch
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from qwen import FasterQwen3TTS
from audio_stitcher import stitch_audio
from text_chunker import chunk_text

_whisper_model = None
_whisper_lock = threading.Lock()


def _transcribe_audio(path: str) -> str:
    """Auto-transcribe a reference clip with faster-whisper (CPU, so it doesn't
    contend with the TTS model for this machine's 4GB of VRAM)."""
    global _whisper_model
    with _whisper_lock:
        if _whisper_model is None:
            from faster_whisper import WhisperModel
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        segments, _ = _whisper_model.transcribe(path)
        return " ".join(seg.text.strip() for seg in segments).strip()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice_clone_studio")

MODEL_PATH = r"D:\models_cache\models--Qwen--Qwen3-TTS-12Hz-0.6B-Base\snapshots\5d83992436eae1d760afd27aff78a71d676296fc"

STORAGE_DIR = Path(__file__).parent / "storage"
REF_DIR = STORAGE_DIR / "references"
GEN_DIR = STORAGE_DIR / "generated"
PRESETS_FILE = STORAGE_DIR / "presets.json"
HISTORY_FILE = STORAGE_DIR / "history.json"
REF_DIR.mkdir(parents=True, exist_ok=True)
GEN_DIR.mkdir(parents=True, exist_ok=True)

# Per-chunk char budget so a single chunk's prefill + decode stay within
# max_seq_len=1024 (tuned for this machine's 4GB GPU -- see
# ../../qwen/HOW_TO_RUN.md). Empirically tested: 800 chars / 700 max_new_tokens
# with a short (~3.5s) reference clip takes ~85s and comfortably fits. Longer
# reference clips (10+s) eat into the same max_seq_len budget and will be much
# slower or may exceed it -- the talker's own StaticCache bounds check is the
# final safety net (surfaced as a chunk failure in the job's "error" field).
#
# Long scripts are handled by splitting into multiple CHUNK_MAX_CHARS-sized
# pieces (text_chunker.chunk_text), each generated independently with a fresh
# KV cache -- this is what keeps quality stable past the point where a single
# long generation would drift into noise as cache position approaches
# max_seq_len (rope embeddings extrapolating past the range this model/config
# was validated for). See audio_stitcher.stitch_audio for how the per-chunk
# audio is recombined.
CHUNK_MAX_CHARS = 800
MAX_NEW_TOKENS = 700
MAX_TOTAL_CHARS = 60_000
STITCH_GAP_SECONDS = 0.2

# Reference-audio duration bounds for new presets. ICL voice cloning gets
# unstable outside this range: too short starves the speaker encoder of
# signal; too long eats into the same max_seq_len budget generation uses and
# has been observed (empirically, this session) to cause unstable output --
# degenerate babbling that runs to the full token budget, or near-instant
# stopping -- regardless of chunk size. 23s reference clips reproduced this
# reliably; keep well under that.
MIN_REF_AUDIO_SECS = 2.0
MAX_REF_AUDIO_SECS = 15.0
# Loose sanity check that ref_text is plausibly a transcript of ref audio,
# not a placeholder (e.g. "ZAZA" for a 23s clip). Real speech is roughly
# 12-15 chars/sec; anything under ~3 chars/sec is almost certainly wrong.
MIN_REF_TEXT_CHARS_PER_SEC = 3.0

STYLE_INSTRUCTIONS = {
    "natural": None,
    "clear": "Speak clearly and plainly, enunciating each word.",
    "expressive": "Speak expressively, with varied and lively intonation.",
    "dramatic": "Speak dramatically, with strong emotional emphasis.",
}

STABILITY_PARAMS = {
    "stable": dict(temperature=0.5, top_p=0.85, top_k=30, do_sample=True),
    "balanced": dict(temperature=0.9, top_p=1.0, top_k=50, do_sample=True),
    "creative": dict(temperature=1.2, top_p=1.0, top_k=80, do_sample=True),
}

_tts: Optional[FasterQwen3TTS] = None
_gen_lock = threading.Lock()
_store_lock = threading.Lock()
_jobs_lock = threading.Lock()
_jobs: dict[str, dict] = {}


def _load_json(path: Path) -> list:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, data: list) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    tmp.replace(path)


_presets: list[dict] = _load_json(PRESETS_FILE)  # newest first
_history: list[dict] = _load_json(HISTORY_FILE)  # newest first


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tts
    _tts = FasterQwen3TTS.from_pretrained(
        MODEL_PATH,
        device="cuda",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
        max_seq_len=1024,
    )
    yield


app = FastAPI(title="CloneVoicePrompt-style TTS API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/audio", StaticFiles(directory=str(GEN_DIR)), name="audio")


@app.get("/api/health")
def health():
    return {"model_loaded": _tts is not None, "sample_rate": _tts.sample_rate if _tts else None}


@app.get("/api/languages")
def languages():
    if _tts is None:
        raise HTTPException(503, "Model not loaded yet")
    codec_language_id = _tts.model.model.config.talker_config.codec_language_id
    return {"languages": sorted(lang.capitalize() for lang in codec_language_id.keys())}


def _find_preset(preset_id: str) -> Optional[dict]:
    return next((p for p in _presets if p["id"] == preset_id), None)


@app.get("/api/presets")
def list_presets():
    return {"presets": _presets}


@app.post("/api/presets")
async def create_preset(
    audio: UploadFile = File(...),
    name: str = Form(...),
    ref_text: str = Form(""),
    language: str = Form("English"),
):
    name = name.strip()
    ref_text = ref_text.strip()
    if not name:
        raise HTTPException(400, "name is required")

    preset_id = uuid.uuid4().hex
    ext = Path(audio.filename or "ref.wav").suffix or ".wav"
    dest = REF_DIR / f"{preset_id}{ext}"
    dest.write_bytes(await audio.read())

    try:
        duration_s = sf.info(str(dest)).duration
    except Exception as e:
        dest.unlink(missing_ok=True)
        logger.exception("Failed to read reference audio for preset %r", name)
        raise HTTPException(400, f"Could not read reference audio file: {e}")

    if duration_s < MIN_REF_AUDIO_SECS:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            400,
            f"Reference audio is {duration_s:.1f}s, too short (minimum {MIN_REF_AUDIO_SECS}s) "
            "for reliable voice cloning.",
        )
    if duration_s > MAX_REF_AUDIO_SECS:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            400,
            f"Reference audio is {duration_s:.1f}s, too long (maximum {MAX_REF_AUDIO_SECS}s) -- "
            "longer reference clips have been observed to produce unstable/garbled generation "
            "on this model. Trim to a shorter, clean clip.",
        )

    if not ref_text:
        try:
            logger.info("Auto-transcribing reference audio for preset %r with faster-whisper", name)
            ref_text = _transcribe_audio(str(dest))
        except Exception as e:
            dest.unlink(missing_ok=True)
            logger.exception("Auto-transcription failed for preset %r", name)
            raise HTTPException(400, f"Auto-transcription failed: {e}. Provide ref_text manually.")
        if not ref_text:
            dest.unlink(missing_ok=True)
            raise HTTPException(
                400,
                "Auto-transcription produced empty text -- the clip may be silent or unclear. "
                "Provide ref_text manually.",
            )

    if len(ref_text) / duration_s < MIN_REF_TEXT_CHARS_PER_SEC:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            400,
            f"ref_text ({len(ref_text)} chars) looks too short to be an accurate transcript of "
            f"{duration_s:.1f}s of audio. ref_text must be the exact transcript of what's spoken "
            "in the reference clip -- a mismatched transcript causes unstable voice cloning.",
        )

    logger.info(
        "Creating preset %r: duration=%.1fs ref_text_len=%d language=%s",
        name, duration_s, len(ref_text), language,
    )

    preset = {
        "id": preset_id,
        "name": name,
        "language": language,
        "ref_text": ref_text,
        "audio_path": str(dest),
        "created_at": time.time(),
    }
    with _store_lock:
        _presets.insert(0, preset)
        _save_json(PRESETS_FILE, _presets)
    return preset


@app.delete("/api/presets/{preset_id}")
def delete_preset(preset_id: str):
    preset = _find_preset(preset_id)
    if preset is None:
        raise HTTPException(404, "Unknown preset_id")
    with _store_lock:
        _presets.remove(preset)
        _save_json(PRESETS_FILE, _presets)
    Path(preset["audio_path"]).unlink(missing_ok=True)
    return {"ok": True}


@app.get("/api/history")
def list_history():
    return {"history": _history}


@app.delete("/api/history/{entry_id}")
def delete_history_entry(entry_id: str):
    entry = next((h for h in _history if h["id"] == entry_id), None)
    if entry is None:
        raise HTTPException(404, "Unknown history entry_id")
    with _store_lock:
        _history.remove(entry)
        _save_json(HISTORY_FILE, _history)
    audio_url = entry.get("audio_url", "")
    if audio_url.startswith("/audio/"):
        (GEN_DIR / audio_url.removeprefix("/audio/")).unlink(missing_ok=True)
    return {"ok": True}


class GenerateRequest(BaseModel):
    preset_id: str
    text: str
    language: str = "English"
    style: str = "natural"
    stability: str = "balanced"


class GenerateJobStart(BaseModel):
    job_id: str
    total_chunks: int


class JobStatusResponse(BaseModel):
    status: str  # "running" | "done" | "error"
    chunks_done: int
    total_chunks: int
    audio_url: Optional[str] = None
    sample_rate: Optional[int] = None
    error: Optional[str] = None


def _run_generate_job(
    job_id: str,
    preset: dict,
    text: str,
    language: str,
    style: str,
    stability: str,
    chunks: list[str],
) -> None:
    audio_chunks: list[np.ndarray] = []
    sr: Optional[int] = None

    logger.info(
        "Job %s: starting -- preset=%r chunks=%d style=%s stability=%s",
        job_id, preset["name"], len(chunks), style, stability,
    )

    for i, chunk in enumerate(chunks):
        last_error: Optional[Exception] = None
        audio_arrays = None
        for attempt in range(2):  # one retry per chunk before giving up
            try:
                with _gen_lock:
                    audio_arrays, sr = _tts.generate_voice_clone(
                        text=chunk,
                        language=language,
                        ref_audio=preset["audio_path"],
                        ref_text=preset["ref_text"],
                        instruct=STYLE_INSTRUCTIONS[style],
                        max_new_tokens=MAX_NEW_TOKENS,
                        **STABILITY_PARAMS[stability],
                    )
                last_error = None
                break
            except RuntimeError as e:
                last_error = e
                logger.exception(
                    "Job %s: chunk %d/%d attempt %d failed", job_id, i + 1, len(chunks), attempt + 1,
                )
                # A CUDA-level error (e.g. Windows TDR killing a kernel) leaves the
                # process's CUDA context unusable -- retrying in the same process
                # would just fail again. Fail fast instead of wasting a retry.
                if "CUDA error" in str(e):
                    break

        if last_error is not None:
            error_msg = f"Chunk {i + 1}/{len(chunks)} failed: {last_error}"
            if "CUDA error" in str(last_error):
                error_msg += " -- GPU driver reset; restart the backend process before retrying."
            with _jobs_lock:
                _jobs[job_id].update(status="error", error=error_msg)
            return

        audio_chunks.append(audio_arrays[0])
        with _jobs_lock:
            _jobs[job_id]["chunks_done"] = i + 1
        logger.info("Job %s: chunk %d/%d done", job_id, i + 1, len(chunks))

    final_audio = stitch_audio(audio_chunks, sr, gap_seconds=STITCH_GAP_SECONDS)
    out_name = f"{uuid.uuid4().hex}.wav"
    sf.write(str(GEN_DIR / out_name), final_audio, sr)
    audio_url = f"/audio/{out_name}"
    duration_s = len(final_audio) / sr
    logger.info("Job %s: done -- %s (%.1fs audio)", job_id, audio_url, duration_s)

    entry = {
        "id": uuid.uuid4().hex,
        "preset_id": preset["id"],
        "preset_name": preset["name"],
        "text": text,
        "language": language,
        "style": style,
        "stability": stability,
        "audio_url": audio_url,
        "duration_s": duration_s,
        "created_at": time.time(),
    }
    with _store_lock:
        _history.insert(0, entry)
        _save_json(HISTORY_FILE, _history)

    with _jobs_lock:
        _jobs[job_id].update(status="done", audio_url=audio_url, sample_rate=sr)


@app.post("/api/generate", status_code=202)
def generate(req: GenerateRequest) -> GenerateJobStart:
    if _tts is None:
        raise HTTPException(503, "Model not loaded yet")
    preset = _find_preset(req.preset_id)
    if preset is None:
        raise HTTPException(404, "Unknown preset_id -- create a preset first")
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "text is required")
    if len(text) > MAX_TOTAL_CHARS:
        raise HTTPException(
            400,
            f"Script too long ({len(text)} > {MAX_TOTAL_CHARS} chars).",
        )
    style = req.style.lower()
    stability = req.stability.lower()
    if style not in STYLE_INSTRUCTIONS:
        raise HTTPException(400, f"Unknown style '{req.style}'")
    if stability not in STABILITY_PARAMS:
        raise HTTPException(400, f"Unknown stability '{req.stability}'")

    chunks = chunk_text(text, CHUNK_MAX_CHARS)
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {
            "status": "running",
            "chunks_done": 0,
            "total_chunks": len(chunks),
            "audio_url": None,
            "sample_rate": None,
            "error": None,
        }
    threading.Thread(
        target=_run_generate_job,
        args=(job_id, preset, text, req.language, style, stability, chunks),
        daemon=True,
    ).start()

    return GenerateJobStart(job_id=job_id, total_chunks=len(chunks))


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> JobStatusResponse:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Unknown job_id")
    return JobStatusResponse(**job)
