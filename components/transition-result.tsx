"use client"

import { Download, RotateCcw } from "lucide-react"

interface Props {
  videoUrl: string
  onReset: () => void
  fileName?: string
}

export function TransitionResult({ videoUrl, onReset, fileName = "transition.mp4" }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl overflow-hidden border border-border bg-black">
        <video
          src={videoUrl}
          controls
          autoPlay
          loop
          playsInline
          className="w-full h-auto block"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <a
          href={videoUrl}
          download={fileName}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex-1"
        >
          <Download className="h-4 w-4" />
          Download MP4
        </a>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg border border-border bg-card hover:bg-accent/40 font-medium transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          New transition
        </button>
      </div>
    </div>
  )
}
