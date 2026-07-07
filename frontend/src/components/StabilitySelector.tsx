import type { CSSProperties } from 'react'

// Tints derived from the brand palette (#408175 teal / #b5b9f0 periwinkle),
// lightened slightly where needed so --bg-primary text stays WCAG AA (4.5:1+).
const LEVELS = [
  { id: 'stable', color: '#4d9384' },
  { id: 'balanced', color: '#b5b9f0' },
  { id: 'creative', color: '#8a8fd1' },
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
