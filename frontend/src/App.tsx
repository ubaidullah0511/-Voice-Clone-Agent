import { useEffect, useState } from 'react'
import './App.css'
import ReferenceUpload from './components/ReferenceUpload'
import PresetList from './components/PresetList'
import StyleSelector from './components/StyleSelector'
import StabilitySelector from './components/StabilitySelector'
import ScriptInput, { MAX_SCRIPT_CHARS } from './components/ScriptInput'
import AudioResult from './components/AudioResult'
import HistoryList from './components/HistoryList'
import { WandIcon } from './components/Icons'
import {
  ApiError,
  createPreset,
  deleteHistoryEntry,
  deletePreset,
  getHealth,
  getJobStatus,
  getLanguages,
  listHistory,
  listPresets,
  startGenerate,
  type HistoryEntry,
  type JobStatus,
  type Preset,
} from './api'

export default function App() {
  const [modelStatus, setModelStatus] = useState<'checking' | 'ready' | 'down'>('checking')
  const [languages, setLanguages] = useState<string[]>([])

  const [presets, setPresets] = useState<Preset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  const [newPresetName, setNewPresetName] = useState('')
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refText, setRefText] = useState('')
  const [creatingPreset, setCreatingPreset] = useState(false)

  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [text, setText] = useState('')
  const [language, setLanguage] = useState('English')
  const [style, setStyle] = useState('natural')
  const [stability, setStability] = useState('balanced')

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refreshPresets() {
    listPresets()
      .then((r) => setPresets(r.presets))
      .catch(() => {})
  }

  function refreshHistory() {
    listHistory()
      .then((r) => setHistory(r.history))
      .catch(() => {})
  }

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      getHealth()
        .then((h) => {
          if (cancelled) return
          if (h.model_loaded) {
            setModelStatus('ready')
            getLanguages()
              .then((r) => !cancelled && setLanguages(r.languages))
              .catch(() => {})
            refreshPresets()
            refreshHistory()
          } else {
            setModelStatus('checking')
            setTimeout(poll, 2000)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setModelStatus('down')
            setTimeout(poll, 3000)
          }
        })
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleCreatePreset() {
    if (!refFile) return
    setCreatingPreset(true)
    setError(null)
    try {
      const preset = await createPreset(newPresetName, refFile, refText, language)
      setPresets((prev) => [preset, ...prev])
      setSelectedPresetId(preset.id)
      setNewPresetName('')
      setRefFile(null)
      setRefText('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save preset')
    } finally {
      setCreatingPreset(false)
    }
  }

  async function handleDeletePreset(id: string) {
    try {
      await deletePreset(id)
      setPresets((prev) => prev.filter((p) => p.id !== id))
      if (selectedPresetId === id) setSelectedPresetId(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete preset')
    }
  }

  async function handleDeleteHistory(id: string) {
    try {
      await deleteHistoryEntry(id)
      setHistory((prev) => prev.filter((h) => h.id !== id))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete history entry')
    }
  }

  function pollJob(jobId: string): Promise<JobStatus> {
    return new Promise((resolve, reject) => {
      const tick = () => {
        getJobStatus(jobId)
          .then((job) => {
            setProgress({ done: job.chunks_done, total: job.total_chunks })
            if (job.status === 'done') {
              resolve(job)
            } else if (job.status === 'error') {
              reject(new ApiError(job.error ?? 'Generation failed'))
            } else {
              setTimeout(tick, 1000)
            }
          })
          .catch(reject)
      }
      tick()
    })
  }

  async function handleGenerate() {
    if (!selectedPresetId) return
    setGenerating(true)
    setError(null)
    setAudioUrl(null)
    setProgress(null)
    try {
      const { job_id, total_chunks } = await startGenerate({
        presetId: selectedPresetId,
        text,
        language,
        style,
        stability,
      })
      setProgress({ done: 0, total: total_chunks })
      const job = await pollJob(job_id)
      setAudioUrl(job.audio_url)
      refreshHistory()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const canGenerate =
    modelStatus === 'ready' &&
    !!selectedPresetId &&
    text.trim().length > 0 &&
    text.length <= MAX_SCRIPT_CHARS &&
    !generating

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo-mark">
            <span />
            <span />
            <span />
          </span>
          <h1>Voice Clone Studio</h1>
        </div>
        <span className={`badge badge-${modelStatus}`}>
          <span className="badge-dot" />
          {modelStatus === 'ready'
            ? 'Model ready'
            : modelStatus === 'checking'
              ? 'Loading model...'
              : 'Backend unreachable'}
        </span>
      </header>

      <PresetList
        presets={presets}
        selectedPresetId={selectedPresetId}
        onSelect={setSelectedPresetId}
        onDelete={handleDeletePreset}
      />

      <ReferenceUpload
        name={newPresetName}
        onNameChange={setNewPresetName}
        refText={refText}
        onRefTextChange={setRefText}
        fileName={refFile?.name ?? null}
        onFileSelected={setRefFile}
        creating={creatingPreset}
        onCreate={handleCreatePreset}
      />

      <section className="panel">
        <div className="panel-header">
          <h2>Style</h2>
        </div>
        <StyleSelector value={style} onChange={setStyle} />
        <div className="panel-header panel-header-spaced">
          <h2>Stability</h2>
        </div>
        <StabilitySelector value={stability} onChange={setStability} />
      </section>

      <ScriptInput
        text={text}
        onTextChange={setText}
        language={language}
        onLanguageChange={setLanguage}
        languages={languages.length ? languages : [language]}
      />

      {error && <p className="error">{error}</p>}

      <button
        type="button"
        className={generating ? 'generate-btn generate-btn-busy' : 'generate-btn'}
        disabled={!canGenerate}
        onClick={handleGenerate}
      >
        <WandIcon />
        {generating
          ? progress && progress.total > 1
            ? `Generating... chunk ${progress.done}/${progress.total}`
            : 'Generating...'
          : 'Generate'}
      </button>

      <AudioResult audioUrl={audioUrl} />

      <HistoryList history={history} onDelete={handleDeleteHistory} />
    </div>
  )
}
