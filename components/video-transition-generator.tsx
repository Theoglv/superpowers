"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Clapperboard, Loader2, Sparkles, TriangleAlert } from "lucide-react"
import { FrameDropzone } from "./frame-dropzone"
import { TransitionControls, type TransitionSettings } from "./transition-controls"
import { TransitionResult } from "./transition-result"
import { generateTransition, readImageDimensions, loadFFmpeg } from "@/lib/ffmpeg-engine"

type Status = "idle" | "loading-engine" | "generating" | "done" | "error"

const QUALITY_DIMENSIONS: Record<TransitionSettings["quality"], number> = {
  preview: 480,
  standard: 720,
  high: 1080,
}

export function VideoTransitionGenerator() {
  const [frameA, setFrameA] = useState<File | null>(null)
  const [frameB, setFrameB] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logLine, setLogLine] = useState<string>("")
  const [settings, setSettings] = useState<TransitionSettings>({
    duration: 4,
    fps: 25,
    transition: "fade",
    kenBurns: true,
    quality: "standard",
  })

  const elapsedTimerRef = useRef<number | null>(null)

  // Preload FFmpeg as soon as both images are present — shaves latency off the first generation.
  useEffect(() => {
    if (frameA && frameB && status === "idle") {
      loadFFmpeg().catch(() => {
        // silent — will surface on generate
      })
    }
  }, [frameA, frameB, status])

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
      if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current)
    }
  }, [videoUrl])

  const reset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(null)
    setStatus("idle")
    setProgress(0)
    setElapsed(0)
    setError(null)
    setLogLine("")
  }, [videoUrl])

  const handleGenerate = useCallback(async () => {
    if (!frameA || !frameB) return
    setError(null)
    setProgress(0)
    setElapsed(0)
    setVideoUrl(null)
    setStatus("loading-engine")

    const startedAt = performance.now()
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsed((performance.now() - startedAt) / 1000)
    }, 250) as unknown as number

    try {
      // Pick an output resolution that respects the first frame's aspect ratio
      // but stays inside the chosen quality budget.
      const dimsA = await readImageDimensions(frameA)
      const longEdge = QUALITY_DIMENSIONS[settings.quality]
      const scale = longEdge / Math.max(dimsA.width, dimsA.height)
      // Round to even numbers — libx264 rejects odd dimensions with yuv420p.
      const width = Math.max(2, Math.round((dimsA.width * scale) / 2) * 2)
      const height = Math.max(2, Math.round((dimsA.height * scale) / 2) * 2)

      setStatus("generating")
      const blob = await generateTransition({
        frameA,
        frameB,
        durationSec: settings.duration,
        fps: settings.fps,
        width,
        height,
        transition: settings.transition,
        kenBurns: settings.kenBurns,
        onProgress: (r) => setProgress(r),
        onLog: (line) => setLogLine(line),
      })
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      setStatus("done")
    } catch (e) {
      console.error("[v0] generate failed", e)
      setError(e instanceof Error ? e.message : "Unknown error")
      setStatus("error")
    } finally {
      if (elapsedTimerRef.current) {
        window.clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
    }
  }, [frameA, frameB, settings])

  const canGenerate = Boolean(frameA && frameB) && (status === "idle" || status === "error" || status === "done")
  const isBusy = status === "loading-engine" || status === "generating"

  return (
    <div className="flex flex-col gap-8">
      {/* Frames */}
      <section className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-center">
        <FrameDropzone label="Start frame" file={frameA} onFileChange={setFrameA} />
        <div className="hidden md:flex items-center justify-center">
          <div className="h-12 w-12 rounded-full border border-border bg-card flex items-center justify-center">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <FrameDropzone label="End frame" file={frameB} onFileChange={setFrameB} />
      </section>

      {/* Result or controls */}
      {videoUrl && status === "done" ? (
        <TransitionResult videoUrl={videoUrl} onReset={reset} />
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold mb-4 inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Transition settings
            </h2>
            <TransitionControls settings={settings} onChange={setSettings} disabled={isBusy} />
          </div>

          <div className="flex flex-col gap-3 lg:w-64">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate || isBusy}
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {status === "loading-engine" ? "Loading engine…" : "Generating…"}
                </>
              ) : (
                <>
                  <Clapperboard className="h-4 w-4" />
                  Generate transition
                </>
              )}
            </button>

            {isBusy && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{status === "loading-engine" ? "Downloading FFmpeg (~30 MB)" : "Encoding video"}</span>
                  <span className="tabular-nums">{elapsed.toFixed(1)}s</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] duration-200"
                    style={{
                      width: status === "generating" ? `${Math.round(progress * 100)}%` : "35%",
                    }}
                  />
                </div>
                {logLine && (
                  <p className="text-[10px] text-muted-foreground font-mono truncate" title={logLine}>
                    {logLine}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <TriangleAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-destructive">Generation failed</span>
                  <span className="text-xs text-destructive/90 break-words">{error}</span>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground leading-relaxed">
              Everything runs locally in your browser via FFmpeg.wasm. Your images are never uploaded to any server.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
