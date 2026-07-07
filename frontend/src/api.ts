export interface HealthResponse {
  model_loaded: boolean
  sample_rate: number | null
}

export interface LanguagesResponse {
  languages: string[]
}

export interface Preset {
  id: string
  name: string
  language: string
  ref_text: string
  audio_path: string
  created_at: number
}

export interface HistoryEntry {
  id: string
  preset_id: string
  preset_name: string
  text: string
  language: string
  style: string
  stability: string
  audio_url: string
  duration_s: number
  created_at: number
}

export interface GenerateJobStart {
  job_id: string
  total_chunks: number
}

export interface JobStatus {
  status: 'running' | 'done' | 'error'
  chunks_done: number
  total_chunks: number
  audio_url: string | null
  sample_rate: number | null
  error: string | null
}

export interface ApiErrorBody {
  detail: string
}

export class ApiError extends Error {}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as ApiErrorBody
      if (body.detail) detail = body.detail
    } catch {
      // ignore -- fall back to statusText
    }
    throw new ApiError(detail)
  }
  return res.json() as Promise<T>
}

export function getHealth(): Promise<HealthResponse> {
  return fetch('/api/health').then(parseOrThrow<HealthResponse>)
}

export function getLanguages(): Promise<LanguagesResponse> {
  return fetch('/api/languages').then(parseOrThrow<LanguagesResponse>)
}

export function listPresets(): Promise<{ presets: Preset[] }> {
  return fetch('/api/presets').then(parseOrThrow<{ presets: Preset[] }>)
}

export function createPreset(
  name: string,
  audio: File,
  refText: string,
  language: string,
): Promise<Preset> {
  const form = new FormData()
  form.append('audio', audio)
  form.append('name', name)
  form.append('ref_text', refText)
  form.append('language', language)
  return fetch('/api/presets', { method: 'POST', body: form }).then(parseOrThrow<Preset>)
}

export function deletePreset(presetId: string): Promise<{ ok: boolean }> {
  return fetch(`/api/presets/${presetId}`, { method: 'DELETE' }).then(
    parseOrThrow<{ ok: boolean }>,
  )
}

export function listHistory(): Promise<{ history: HistoryEntry[] }> {
  return fetch('/api/history').then(parseOrThrow<{ history: HistoryEntry[] }>)
}

export function deleteHistoryEntry(entryId: string): Promise<{ ok: boolean }> {
  return fetch(`/api/history/${entryId}`, { method: 'DELETE' }).then(
    parseOrThrow<{ ok: boolean }>,
  )
}

export interface GenerateParams {
  presetId: string
  text: string
  language: string
  style: string
  stability: string
}

export function startGenerate(params: GenerateParams): Promise<GenerateJobStart> {
  return fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset_id: params.presetId,
      text: params.text,
      language: params.language,
      style: params.style,
      stability: params.stability,
    }),
  }).then(parseOrThrow<GenerateJobStart>)
}

export function getJobStatus(jobId: string): Promise<JobStatus> {
  return fetch(`/api/jobs/${jobId}`).then(parseOrThrow<JobStatus>)
}
