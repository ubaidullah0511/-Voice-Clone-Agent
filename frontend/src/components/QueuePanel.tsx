import { useEffect, useState } from 'react'
import { cancelQueuedJob, downloadUrl, listQueue, reorderQueue, type QueueEntry } from '../api'
import { useAudioActivity } from '../AudioActivityContext'
import { downloadName, formatDuration } from '../format'
import { TrashIcon } from './Icons'

interface Props {
  active: boolean
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Processing',
  done: 'Done',
  error: 'Failed',
  canceled: 'Canceled',
}

export default function QueuePanel({ active }: Props) {
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const { setActiveAudio } = useAudioActivity()

  function refresh() {
    listQueue()
      .then((r) => setQueue(r.queue))
      .catch(() => {})
  }

  useEffect(() => {
    if (!active) return
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  async function handleCancel(jobId: string) {
    try {
      await cancelQueuedJob(jobId)
    } finally {
      refresh()
    }
  }

  async function moveQueued(queuedIds: string[], jobId: string, direction: -1 | 1) {
    const idx = queuedIds.indexOf(jobId)
    const swapWith = idx + direction
    if (idx < 0 || swapWith < 0 || swapWith >= queuedIds.length) return
    const reordered = [...queuedIds]
    ;[reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]]
    try {
      await reorderQueue(reordered)
    } finally {
      refresh()
    }
  }

  const running = queue.filter((e) => e.status === 'running')
  const queued = queue.filter((e) => e.status === 'queued')
  const finished = queue.filter((e) => e.status !== 'running' && e.status !== 'queued')
  const queuedIds = queued.map((e) => e.job_id)
  const ordered = [...running, ...queued, ...finished]

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Queue</h2>
        {queue.length > 0 && <span className="count-badge">{queue.length}</span>}
      </div>

      {ordered.length === 0 ? (
        <p className="empty-hint">No jobs yet -- submitted generations will show up here.</p>
      ) : (
        <ul className="queue-list">
          {ordered.map((entry) => {
            const queuedIdx = queuedIds.indexOf(entry.job_id)
            return (
              <li key={entry.job_id} className="queue-row">
                <div className="queue-row-top">
                  <div className="queue-row-title">
                    <strong>{entry.preset_name}</strong>
                    <span className={`badge-pill queue-status-${entry.status}`}>
                      {STATUS_LABELS[entry.status] ?? entry.status}
                    </span>
                  </div>
                  <span className="list-meta">
                    {entry.status === 'queued' && entry.eta_s != null && `~${formatDuration(entry.eta_s)} until start`}
                    {entry.status === 'running' &&
                      `${entry.chunks_done}/${entry.total_chunks} chunks -- ~${formatDuration(entry.eta_s)} left`}
                    {entry.status === 'done' && `done in ${formatDuration(entry.elapsed_s)}`}
                    {entry.status === 'error' && 'failed'}
                    {entry.status === 'canceled' && 'canceled'}
                  </span>
                </div>
                <p className="queue-text">{entry.text_preview}</p>
                {entry.error && <p className="error">{entry.error}</p>}
                {entry.audio_url && (
                  <div className="list-actions">
                    <audio
                      controls
                      src={entry.audio_url}
                      onPlay={(e) => setActiveAudio(e.currentTarget)}
                      onPause={() => setActiveAudio(null)}
                      onEnded={() => setActiveAudio(null)}
                    />
                    <a
                      href={downloadUrl(entry.audio_url, downloadName(entry.preset_name, entry.submitted_at))}
                      download
                      className="download-link"
                    >
                      Download
                    </a>
                  </div>
                )}
                {entry.status === 'queued' && (
                  <div className="queue-row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Move up in queue"
                      disabled={queuedIdx <= 0}
                      onClick={() => moveQueued(queuedIds, entry.job_id, -1)}
                    >
                      ^
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Move down in queue"
                      disabled={queuedIdx < 0 || queuedIdx >= queuedIds.length - 1}
                      onClick={() => moveQueued(queuedIds, entry.job_id, 1)}
                    >
                      v
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      aria-label="Cancel queued job"
                      onClick={() => handleCancel(entry.job_id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
