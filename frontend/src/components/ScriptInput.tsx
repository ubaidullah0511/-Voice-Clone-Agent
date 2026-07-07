export const MAX_SCRIPT_CHARS = 60_000 // must match backend's MAX_TOTAL_CHARS (webapp/backend/main.py)

interface Props {
  text: string
  onTextChange: (value: string) => void
  language: string
  onLanguageChange: (value: string) => void
  languages: string[]
}

export default function ScriptInput({
  text,
  onTextChange,
  language,
  onLanguageChange,
  languages,
}: Props) {
  const overLimit = text.length > MAX_SCRIPT_CHARS

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Script</h2>
        <select value={language} onChange={(e) => onLanguageChange(e.target.value)} className="lang-select">
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      <textarea
        placeholder="Text to synthesize"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        rows={10}
      />
      <p className={overLimit ? 'char-count char-count-over' : 'char-count'}>
        {text.length} / {MAX_SCRIPT_CHARS} characters
        {overLimit && ' -- too long'}
      </p>
    </section>
  )
}
