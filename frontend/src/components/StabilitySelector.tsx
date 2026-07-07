import type { CSSProperties } from 'react'

const LEVELS = [
  { id: 'stable', color: '#10b981' },
  { id: 'balanced', color: '#6366f1' },
  { id: 'creative', color: '#f43f5e' },
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
