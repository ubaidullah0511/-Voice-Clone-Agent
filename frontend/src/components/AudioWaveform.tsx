import { useEffect, useRef } from 'react'
import { listQueue } from '../api'
import { useAudioActivity } from '../AudioActivityContext'

const MIN_BARS = 24
const BAR_PITCH = 14 // px per bar (width + gap), used to size bar count to the canvas

export default function AudioWaveform() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { activeAudio } = useAudioActivity()

  const processingRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const dataRef = useRef<Uint8Array | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceCacheRef = useRef(new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>())

  // Poll the queue for "any job running" -- drives the Processing animation
  // state. There's no real audio signal to visualize during generation (the
  // clip doesn't exist until the job finishes), so this stays procedural.
  useEffect(() => {
    let cancelled = false
    function poll() {
      listQueue()
        .then((r) => {
          if (!cancelled) processingRef.current = r.queue.some((e) => e.status === 'running')
        })
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Hook real Web Audio API amplitude to whichever element is actively playing.
  useEffect(() => {
    if (!activeAudio) {
      analyserRef.current = null
      return
    }
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    let source = sourceCacheRef.current.get(activeAudio)
    if (!source) {
      source = ctx.createMediaElementSource(activeAudio)
      sourceCacheRef.current.set(activeAudio, source)
    }

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    source.connect(analyser)
    analyser.connect(ctx.destination)
    analyserRef.current = analyser
    dataRef.current = new Uint8Array(analyser.frequencyBinCount)

    return () => {
      source?.disconnect(analyser)
      analyser.disconnect()
    }
  }, [activeAudio])

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    let width = 0
    let height = 0

    function resize() {
      const rect = container!.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = window.devicePixelRatio || 1
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      ctx2d!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    let frame = 0
    let raf = 0

    function draw() {
      frame++
      ctx2d!.clearRect(0, 0, width, height)

      const barCount = Math.max(MIN_BARS, Math.floor(width / BAR_PITCH))
      const analyser = analyserRef.current
      const data = dataRef.current
      let amplitudes: number[]

      if (analyser && data) {
        analyser.getByteFrequencyData(data)
        amplitudes = Array.from({ length: barCount }, (_, i) => {
          const idx = Math.floor((i / barCount) * data.length)
          return data[idx] / 255
        })
      } else if (processingRef.current) {
        amplitudes = Array.from({ length: barCount }, (_, i) => {
          const t = frame * 0.09 + i * 0.5
          return 0.32 + 0.34 * Math.abs(Math.sin(t))
        })
      } else {
        amplitudes = Array.from({ length: barCount }, (_, i) => {
          const t = frame * 0.02 + i * 0.35
          return 0.1 + 0.08 * Math.abs(Math.sin(t))
        })
      }

      const gap = 3
      const barWidth = Math.max(2, width / barCount - gap)

      for (let i = 0; i < barCount; i++) {
        const amp = amplitudes[i]
        const barHeight = Math.max(3, amp * height * 0.85)
        const x = i * (barWidth + gap)
        const y = (height - barHeight) / 2

        // Pseudo-3D: bars near center read taller/brighter, edges recede.
        const centerFactor = 1 - Math.abs(i - barCount / 2) / (barCount / 2)
        const alpha = 0.45 + 0.5 * centerFactor
        const radius = Math.min(barWidth / 2, 4)

        const grad = ctx2d!.createLinearGradient(0, y, 0, y + barHeight)
        grad.addColorStop(0, `rgba(181, 185, 240, ${alpha})`)
        grad.addColorStop(1, `rgba(64, 129, 117, ${alpha})`)

        ctx2d!.fillStyle = grad
        ctx2d!.shadowColor = 'rgba(64, 129, 117, 0.55)'
        ctx2d!.shadowBlur = 10 * centerFactor + 3

        ctx2d!.beginPath()
        ctx2d!.moveTo(x, y + radius)
        ctx2d!.arcTo(x, y, x + radius, y, radius)
        ctx2d!.lineTo(x + barWidth - radius, y)
        ctx2d!.arcTo(x + barWidth, y, x + barWidth, y + radius, radius)
        ctx2d!.lineTo(x + barWidth, y + barHeight - radius)
        ctx2d!.arcTo(x + barWidth, y + barHeight, x + barWidth - radius, y + barHeight, radius)
        ctx2d!.lineTo(x + radius, y + barHeight)
        ctx2d!.arcTo(x, y + barHeight, x, y + barHeight - radius, radius)
        ctx2d!.closePath()
        ctx2d!.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="waveform-hero" ref={containerRef}>
      <canvas ref={canvasRef} />
    </div>
  )
}
