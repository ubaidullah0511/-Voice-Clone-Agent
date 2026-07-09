import { useEffect, useRef, useState } from 'react'
import './App.css'
import ReferenceUpload from './components/ReferenceUpload'
import VoiceGallery from './components/VoiceGallery'
import AudioWaveform from './components/AudioWaveform'
import LandingPage from './components/LandingPage'
import StyleSelector from './components/StyleSelector'
import StabilitySelector from './components/StabilitySelector'
import ScriptBlock from './components/ScriptBlock'
import HistoryList from './components/HistoryList'
import QueuePanel from './components/QueuePanel'
import AmbientCanvas from './components/AmbientCanvas'
import GenerateButton from './components/GenerateButton'
import { MAX_SCRIPT_CHARS } from './constants'
import { useGenerationActivity } from './GenerationActivityContext'
import {
  ApiError,
  createPreset,
  deleteHistoryEntry,
  deletePreset,
  getHealth,
  getLanguages,
  listHistory,
  listPresets,
  startGenerate,
  type HistoryEntry,
  type Preset,
} from './api'
import { AnimatePresence, motion } from 'framer-motion'

interface ScriptBlockState {
  id: string
  text: string
  presetId: string | null
}

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost) --
// this app is also accessed over plain HTTP via a LAN IP, where it's
// undefined and throws. These ids are just local React keys, not security-
// sensitive, so a simple counter is enough and works everywhere.
let blockIdCounter = 0
function generateBlockId(): string {
  blockIdCounter += 1
  return `block-${Date.now().toString(36)}-${blockIdCounter}`
}

function newBlock(overrides: Partial<ScriptBlockState> = {}): ScriptBlockState {
  return { id: generateBlockId(), text: '', presetId: null, ...overrides }
}

export default function App() {
  const [showLanding, setShowLanding] = useState(true)

  const [modelStatus, setModelStatus] = useState<'checking' | 'ready' | 'down'>('checking')
  const [languages, setLanguages] = useState<string[]>([])

  const [presets, setPresets] = useState<Preset[]>([])

  const [newPresetName, setNewPresetName] = useState('')
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refText, setRefText] = useState('')
  const [presetTag, setPresetTag] = useState('')
  const [newVoiceOpen, setNewVoiceOpen] = useState(false) 
  const [creatingPreset, setCreatingPreset] = useState(false)

  const [history, setHistory] = useState<HistoryEntry[]>([])

  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlockState[]>([newBlock()])
  const [language, setLanguage] = useState('English')
  const [style, setStyle] = useState('natural')
  const [stability, setStability] = useState('balanced')

  const [submittingAll, setSubmittingAll] = useState(false)
  const [pulseEpoch, setPulseEpoch] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const { queue, refresh: refreshQueue } = useGenerationActivity()
  const generationsRef = useRef<HTMLDivElement>(null)
  const scriptsRef = useRef<HTMLElement>(null)

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

  // With the Queue tab gone, finished jobs should surface in Generations
  // without a reload -- re-fetch history whenever another job completes.
  const doneCount = queue.filter((e) => e.status === 'done').length
  useEffect(() => {
    if (doneCount > 0) refreshHistory()
  }, [doneCount])

  async function handleCreatePreset() {
    if (!refFile) return
    setCreatingPreset(true)
    setError(null)
    try {
      const preset = await createPreset(newPresetName, refFile, refText, language, presetTag)
      setPresets((prev) => [preset, ...prev])
      setNewPresetName('')
      setRefFile(null)
      setRefText('')
      setPresetTag('')
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

  function handleRequeue(entry: HistoryEntry) {
    setScriptBlocks([newBlock({ text: entry.text, presetId: entry.preset_id })])
    setLanguage(entry.language)
    setStyle(entry.style)
    setStability(entry.stability)
    scriptsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function addScriptBlock() {
    setScriptBlocks((prev) => [...prev, newBlock()])
  }

  function removeScriptBlock(id: string) {
    setScriptBlocks((prev) => (prev.length > 1 ? prev.filter((b) => b.id !== id) : prev))
  }

  function updateBlock(id: string, patch: Partial<ScriptBlockState>) {
    setScriptBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setScriptBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      const swapWith = idx + direction
      if (idx < 0 || swapWith < 0 || swapWith >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swapWith]] = [next[swapWith], next[idx]]
      return next
    })
  }

  function assignPresetFromGallery(presetId: string) {
    setScriptBlocks((prev) => {
      const targetIdx = prev.findIndex((b) => !b.presetId)
      const idx = targetIdx >= 0 ? targetIdx : prev.length - 1
      return prev.map((b, i) => (i === idx ? { ...b, presetId } : b))
    })
  }

  const validBlocks = scriptBlocks.filter(
    (b) => b.text.trim().length > 0 && b.presetId && b.text.length <= MAX_SCRIPT_CHARS,
  )

  async function handleGenerateAll() {
    if (validBlocks.length === 0) {
      setError('Add at least one script with text and a selected voice.')
      return
    }
    setSubmittingAll(true)
    setError(null)
    try {
      for (const block of validBlocks) {
        await startGenerate({
          presetId: block.presetId as string,
          text: block.text,
          language,
          style,
          stability,
        })
      }
      setScriptBlocks([newBlock()])
      setPulseEpoch((n) => n + 1)
      refreshQueue()
      generationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to submit batch')
    } finally {
      setSubmittingAll(false)
    }
  }

  const canGenerateAll = modelStatus === 'ready' && validBlocks.length > 0 && !submittingAll

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />
  }

  return (
    <>
      <AmbientCanvas />
      <div className="studio-shell">
        <aside className="rail">
          <div className="rail-brand">
            <button type="button" className="brand" onClick={() => setShowLanding(true)}>
              <span className="logo-mark">
                <span />
                <span />
                <span />
              </span>
              <h1>Voice Clone Studio</h1>
            </button>
            <span className={`badge badge-${modelStatus}`}>
              <span className="badge-dot" />
              {modelStatus === 'ready'
                ? 'Model ready'
                : modelStatus === 'checking'
                  ? 'Loading model...'
                  : 'Backend unreachable'}
            </span>
          </div>

          <VoiceGallery
            presets={presets}
            selectedPresetId={null}
            onSelect={assignPresetFromGallery}
            onDelete={handleDeletePreset}
          />

          <div className="rail-new-voice">
            <button
              type="button"
              className="new-voice-trigger"
              onClick={() => setNewVoiceOpen((v) => !v)}
              aria-expanded={newVoiceOpen}
            >
              <span className={`new-voice-trigger-icon ${newVoiceOpen ? 'is-open' : ''}`}>

              </span>
              New voice
            </button>

            <AnimatePresence initial={false}>
              {newVoiceOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <ReferenceUpload
                    name={newPresetName}
                    onNameChange={setNewPresetName}
                    refText={refText}
                    onRefTextChange={setRefText}
                    tag={presetTag}
                    onTagChange={setPresetTag}
                    fileName={refFile?.name ?? null}
                    onFileSelected={setRefFile}
                    creating={creatingPreset}
                    onCreate={handleCreatePreset}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>

        <main className="workspace">
          <AudioWaveform />

          <section className="panel console-strip">
            <div className="console-cell">
              <div className="panel-header">
                <h2>Style</h2>
              </div>
              <StyleSelector value={style} onChange={setStyle} />
            </div>
            <div className="console-cell">
              <div className="panel-header">
                <h2>Stability</h2>
              </div>
              <StabilitySelector value={stability} onChange={setStability} />
            </div>
            <div className="console-cell">
              <div className="panel-header">
                <h2>Language</h2>
              </div>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {(languages.length ? languages : [language]).map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="panel" ref={scriptsRef}>
            <div className="panel-header">
              <h2>Scripts</h2>
              <span className="count-badge mono">{scriptBlocks.length}</span>
            </div>
            <div className="script-blocks">
              {scriptBlocks.map((block, i) => (
                <ScriptBlock
                  key={block.id}
                  index={i}
                  text={block.text}
                  onTextChange={(text) => updateBlock(block.id, { text })}
                  presetId={block.presetId}
                  onPresetChange={(presetId) => updateBlock(block.id, { presetId })}
                  presets={presets}
                  onRemove={() => removeScriptBlock(block.id)}
                  onMoveUp={() => moveBlock(block.id, -1)}
                  onMoveDown={() => moveBlock(block.id, 1)}
                  canMoveUp={i > 0}
                  canMoveDown={i < scriptBlocks.length - 1}
                  canRemove={scriptBlocks.length > 1}
                />
              ))}
            </div>
            <button type="button" className="add-script-btn" onClick={addScriptBlock}>
              + Add another script
            </button>
          </section>

          {error && <p className="error">{error}</p>}

          <GenerateButton
            disabled={!canGenerateAll}
            busy={submittingAll}
            count={validBlocks.length}
            pulseEpoch={pulseEpoch}
            onClick={handleGenerateAll}
          />

          <div ref={generationsRef} className="generations">
            <QueuePanel />
            <HistoryList
              history={history}
              onDelete={handleDeleteHistory}
              onRequeue={handleRequeue}
            />
          </div>
        </main>
      </div>
    </>
  )
}
