import type { CSSProperties } from 'react'

const STYLES = [
  { id: 'natural', color: '#64748b' },
  { id: 'clear', color: '#06b6d4' },
  { id: 'expressive', color: '#f59e0b' },
  { id: 'dramatic', color: '#ec4899' },
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
