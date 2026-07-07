interface Props {
  audioUrl: string | null
}

export default function AudioResult({ audioUrl }: Props) {
  if (!audioUrl) return null

  return (
    <section className="panel panel-result">
      <div className="panel-header">
        <h2>Result</h2>
      </div>
      <audio controls src={audioUrl} autoPlay />
      <a href={audioUrl} download className="download-link">
        Download .wav
      </a>
    </section>
  )
}
