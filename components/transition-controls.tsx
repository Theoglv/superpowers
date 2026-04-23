"use client"

import type { TransitionType } from "@/lib/ffmpeg-engine"
import { cn } from "@/lib/utils"

export interface TransitionSettings {
  duration: number
  fps: number
  transition: TransitionType
  kenBurns: boolean
  quality: "preview" | "standard" | "high"
}

interface Props {
  settings: TransitionSettings
  onChange: (s: TransitionSettings) => void
  disabled?: boolean
}

const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: "fade", label: "Cinematic fade" },
  { value: "dissolve", label: "Dissolve" },
  { value: "hblur", label: "Soft blur" },
  { value: "smoothleft", label: "Smooth left" },
  { value: "smoothright", label: "Smooth right" },
  { value: "smoothup", label: "Smooth up" },
  { value: "smoothdown", label: "Smooth down" },
  { value: "circleopen", label: "Circle open" },
  { value: "circleclose", label: "Circle close" },
  { value: "radial", label: "Radial" },
  { value: "zoomin", label: "Zoom in" },
  { value: "fadeblack", label: "Fade through black" },
  { value: "fadewhite", label: "Fade through white" },
]

export function TransitionControls({ settings, onChange, disabled }: Props) {
  return (
    <div className={cn("flex flex-col gap-5", disabled && "opacity-60 pointer-events-none")}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Duration</label>
          <span className="text-sm text-muted-foreground tabular-nums">{settings.duration.toFixed(1)}s</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={settings.duration}
          onChange={(e) => onChange({ ...settings, duration: Number.parseFloat(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Transition style</label>
        <select
          value={settings.transition}
          onChange={(e) => onChange({ ...settings, transition: e.target.value as TransitionType })}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {TRANSITIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Quality</label>
        <div className="grid grid-cols-3 gap-2">
          {(["preview", "standard", "high"] as const).map((q) => {
            const labels = { preview: "Preview", standard: "Standard", high: "High" }
            const sub = { preview: "480p · 24fps", standard: "720p · 25fps", high: "1080p · 30fps" }
            const active = settings.quality === q
            return (
              <button
                key={q}
                type="button"
                onClick={() => {
                  const fps = q === "preview" ? 24 : q === "standard" ? 25 : 30
                  onChange({ ...settings, quality: q, fps })
                }}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50 hover:bg-accent/30",
                )}
              >
                <span className="text-sm font-medium">{labels[q]}</span>
                <span className="text-xs text-muted-foreground">{sub[q]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Ken Burns motion</span>
          <span className="text-xs text-muted-foreground">Subtle zoom on both frames for cinematic feel</span>
        </div>
        <input
          type="checkbox"
          checked={settings.kenBurns}
          onChange={(e) => onChange({ ...settings, kenBurns: e.target.checked })}
          className="h-4 w-4 accent-primary"
        />
      </label>
    </div>
  )
}
