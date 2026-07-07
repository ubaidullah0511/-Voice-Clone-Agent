import type { CSSProperties } from 'react'

// Tints derived from the brand palette (#408175 teal / #b5b9f0 periwinkle)
// so chip colors stay on-brand instead of an unrelated rainbow.
const STYLES = [
  { id: 'natural', color: '#7a8f89' },
  { id: 'clear', color: '#b5b9f0' },
  { id: 'expressive', color: '#6fa79a' },
  { id: 'dramatic', color: '#7075c2' },
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
