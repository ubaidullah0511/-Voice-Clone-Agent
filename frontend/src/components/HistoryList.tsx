import type { HistoryEntry } from '../api'
import { TrashIcon } from './Icons'

interface Props {
  history: HistoryEntry[]
  onDelete: (id: string) => void
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(unixSeconds * 1000).toLocaleDateString()
}

export default function HistoryList({ history, onDelete }: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>History</h2>
        {history.length > 0 && <span className="count-badge">{history.length}</span>}
      </div>

      {history.length === 0 ? (
        <p className="empty-hint">No submissions yet -- generated clips will show up here.</p>
      ) : (
        <ul className="history-list">
          {history.map((entry) => (
            <li key={entry.id} className="history-row">
              <div className="history-row-top">
                <div className="history-row-title">
                  <strong>{entry.preset_name}</strong>
                  <span className="badge-pill">{entry.style}</span>
                  <span className="badge-pill">{entry.stability}</span>
                </div>
                <span className="list-meta">{timeAgo(entry.created_at)}</span>
              </div>
              <p className="history-text">{truncate(entry.text)}</p>
              <div className="list-actions">
                <audio controls src={entry.audio_url} />
                <a href={entry.audio_url} download className="download-link">
                  Download
                </a>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  aria-label="Delete history entry"
                  onClick={() => onDelete(entry.id)}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
