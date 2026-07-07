import type { Preset } from '../api'
import { CheckIcon, TrashIcon } from './Icons'

interface Props {
  presets: Preset[]
  selectedPresetId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #06b6d4, #6366f1)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #ec4899, #8b5cf6)',
  'linear-gradient(135deg, #f59e0b, #ec4899)',
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

export default function PresetList({ presets, selectedPresetId, onSelect, onDelete }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Saved presets</h2>
        {presets.length > 0 && <span className="count-badge">{presets.length}</span>}
      </div>

      {presets.length === 0 ? (
        <p className="empty-hint">No saved presets yet -- create one below to get started.</p>
      ) : (
        <div className="preset-grid">
          {presets.map((preset) => {
            const selected = preset.id === selectedPresetId
            return (
              <div key={preset.id} className={selected ? 'preset-card preset-card-selected' : 'preset-card'}>
                <button type="button" className="preset-card-main" onClick={() => onSelect(preset.id)}>
                  <span className="avatar" style={{ background: avatarGradient(preset.name) }}>
                    {initials(preset.name)}
                  </span>
                  <span className="preset-card-body">
                    <strong>{preset.name}</strong>
                    <span className="list-meta">{preset.language}</span>
                  </span>
                  {selected && (
                    <span className="selected-check">
                      <CheckIcon size={12} />
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger preset-delete"
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => onDelete(preset.id)}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
