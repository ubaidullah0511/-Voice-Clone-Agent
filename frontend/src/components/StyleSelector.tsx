import type { CSSProperties } from 'react'

// Warm console tints from the Mastering Suite palette (#F0A83D amber core,
// bronze and graphite neighbors) -- dark chip text stays readable on all.
const STYLES = [
  { id: 'natural', color: '#b9955c' },
  { id: 'clear', color: '#c9cbd1' },
  { id: 'expressive', color: '#f0a83d' },
  { id: 'dramatic', color: '#c77f2a' },
] as const

interface Props {
  value: string
  onChange: (value: string) => void
}

export default function StyleSelector({ value, onChange }: Props) {
  return (
    <div className="chip-row">
      {STYLES.map(({ id, color }) => (
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
