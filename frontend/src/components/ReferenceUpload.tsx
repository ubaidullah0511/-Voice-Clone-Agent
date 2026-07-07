import { UploadIcon } from './Icons'

interface Props {
  name: string
  onNameChange: (value: string) => void
  refText: string
  onRefTextChange: (value: string) => void
  tag: string
  onTagChange: (value: string) => void
  fileName: string | null
  onFileSelected: (file: File) => void
  creating: boolean
  onCreate: () => void
}

export default function ReferenceUpload({
  name,
  onNameChange,
  refText,
  onRefTextChange,
  tag,
  onTagChange,
  fileName,
  onFileSelected,
  creating,
  onCreate,
}: Props) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>New preset</h2>
      </div>
      <input
        type="text"
        placeholder={'Preset name (e.g. "Narrator")'}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <label className={fileName ? 'dropzone dropzone-filled' : 'dropzone'}>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFileSelected(file)
          }}
        />
        <UploadIcon />
        {fileName ? <span>{fileName}</span> : <span>Click to choose a reference audio file</span>}
      </label>
      <textarea
        placeholder="Exact transcript of the reference audio (leave blank to auto-transcribe)"
        value={refText}
        onChange={(e) => onRefTextChange(e.target.value)}
        rows={2}
      />
      <input
        type="text"
        placeholder={'Mood/style tag (e.g. "Cinematic", optional)'}
        value={tag}
        onChange={(e) => onTagChange(e.target.value)}
      />
      <button
        type="button"
        className="primary-btn"
        disabled={!name.trim() || !fileName || creating}
        onClick={onCreate}
      >
        {creating ? 'Saving...' : 'Save preset'}
      </button>
    </section>
  )
}
