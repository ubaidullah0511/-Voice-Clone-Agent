import { useRef, useState } from 'react'
import type { Preset } from '../api'
import { CheckIcon, PauseIcon, PlayIcon, TrashIcon } from './Icons'

interface Props {
  presets: Preset[]
  selectedPresetId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

// Derived from the brand palette (#408175 teal / #B5B9F0 periwinkle) so
// avatars stay on-brand instead of an unrelated rainbow.
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #408175, #2e4540)',
  'linear-gradient(135deg, #408175, #b5b9f0)',
  'linear-gradient(135deg, #5fa093, #408175)',
  'linear-gradient(135deg, #b5b9f0, #8a8fd1)',
  'linear-gradient(135deg, #2e4540, #408175)',
  'linear-gradient(135deg, #6b70c9, #408175)',
]

function avatarGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function VoiceGallery({ presets, selectedPresetId, onSelect, onDelete }: Props) {
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function togglePreview(preset: Preset) {
    const audio = audioRef.current
    if (!audio) return
    if (previewingId === preset.id) {
      audio.pause()
      setPreviewingId(null)
      return
    }
    audio.src = preset.preview_url
    audio.play().catch(() => {})
    setPreviewingId(preset.id)
  }

  const builtins = presets.filter((p) => p.is_builtin)
  const custom = presets.filter((p) => !p.is_builtin)

  function renderCard(preset: Preset) {
    const selected = preset.id === selectedPresetId
    const previewing = previewingId === preset.id
    return (
      <div key={preset.id} className={selected ? 'gallery-card gallery-card-selected' : 'gallery-card'}>
        <button
          type="button"
          className="icon-btn gallery-preview-btn"
          aria-label={previewing ? `Pause preview of ${preset.name}` : `Preview ${preset.name}`}
          onClick={() => togglePreview(preset)}
        >
          {previewing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
        </button>
        <button type="button" className="gallery-card-main" onClick={() => onSelect(preset.id)}>
          <span className="avatar" style={{ background: avatarGradient(preset.name) }}>
            {initials(preset.name)}
          </span>
          <span className="gallery-card-body">
            <strong>{preset.name}</strong>
            <span className="gallery-card-tags">
              <span className="badge-pill">{preset.language}</span>
              {preset.tag && <span className="badge-pill badge-pill-accent">{preset.tag}</span>}
            </span>
          </span>
          {selected && (
            <span className="selected-check">
              <CheckIcon size={12} />
            </span>
          )}
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-danger gallery-delete"
          aria-label={`Delete ${preset.name}`}
          onClick={() => onDelete(preset.id)}
        >
          <TrashIcon size={14} />
        </button>
      </div>
    )
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Voices</h2>
        {presets.length > 0 && <span className="count-badge">{presets.length}</span>}
      </div>

      {presets.length === 0 ? (
        <p className="empty-hint">No saved presets yet -- create one below to get started.</p>
      ) : (
        <>
          {builtins.length > 0 && (
            <>
              <span className="gallery-section-label">Studio Voices</span>
              <div className="gallery-grid">{builtins.map(renderCard)}</div>
            </>
          )}
          {custom.length > 0 && (
            <>
              <span className="gallery-section-label">My Voices</span>
              <div className="gallery-grid">{custom.map(renderCard)}</div>
            </>
          )}
        </>
      )}

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} onEnded={() => setPreviewingId(null)} style={{ display: 'none' }} />
    </section>
  )
}
