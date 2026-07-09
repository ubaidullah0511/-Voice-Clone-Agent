import type { CSSProperties } from 'react'

// Warm console tints from the Mastering Suite palette, light enough that
// the dark chip text stays WCAG AA (4.5:1+) when selected.
const LEVELS = [
  { id: 'stable', color: '#c9cbd1' },
  { id: 'balanced', color: '#e0b878' },
  { id: 'creative', color: '#f0a83d' },
] as const

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function StabilitySelector({ value, onChange }: Props) {
  return (
    <div className="chip-row">
      {LEVELS.map(({ id, color }) => (
        <button
          key={id}
          type="button"
          className={id === value ? 'chip chip-selected' : 'chip'}
          style={{ '--chip-color': color } as CSSProperties}
          onClick={() => onChange(id)}
        >
          <span className="chip-dot" style={{ background: color }} />
          {id[0].toUpperCase() + id.slice(1)}
        </button>
      ))}
    </div>
  )
}
