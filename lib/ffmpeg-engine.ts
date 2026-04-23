"use client"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

// Single-threaded core — works everywhere as long as COOP/COEP headers are set,
// and keeps the bundle light (~30 MB wasm vs ~60 MB for the MT version).
const CORE_VERSION = "0.12.10"
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`

let ffmpegSingleton: FFmpeg | null = null
let loadingPromise: Promise<FFmpeg> | null = null

export type TransitionType =
  | "fade"
  | "fadeblack"
  | "fadewhite"
  | "dissolve"
  | "smoothleft"
  | "smoothright"
  | "smoothup"
  | "smoothdown"
  | "circleopen"
  | "circleclose"
  | "radial"
  | "hblur"
  | "zoomin"

export interface TransitionOptions {
  frameA: File | Blob
  frameB: File | Blob
  durationSec: number // total output duration
  fps: number
  width: number
  height: number
  transition: TransitionType
  kenBurns: boolean // subtle in/out zoom on each frame
  onProgress?: (ratio: number) => void
  onLog?: (line: string) => void
}

export async function loadFFmpeg(onLog?: (line: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg()
    if (onLog) {
      ffmpeg.on("log", ({ message }) => onLog(message))
    }
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    })
    ffmpegSingleton = ffmpeg
    return ffmpeg
  })()

  return loadingPromise
}

/**
 * Build the filter_complex string that:
 *  1. normalises each image to the target canvas (letterbox),
 *  2. optionally applies a subtle Ken Burns (zoom in on A, zoom out on B),
 *  3. xfades A into B with the chosen transition.
 */
function buildFilterComplex(opts: {
  width: number
  height: number
  fps: number
  totalSec: number
  xfadeSec: number
  offsetSec: number
  transition: TransitionType
  kenBurns: boolean
}) {
  const { width, height, fps, totalSec, xfadeSec, offsetSec, transition, kenBurns } = opts
  const framesA = Math.round((offsetSec + xfadeSec) * fps)
  const framesB = Math.round((totalSec - offsetSec) * fps)

  // Prepare each stream: fit-to-canvas on pure black, lock SAR, set fps.
  const prep = (idx: 0 | 1, frames: number, zoomDir: "in" | "out") => {
    const base =
      `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps}`
    if (!kenBurns) return `${base}[v${idx}]`
    // Gentle Ken Burns: z goes from 1.00 → 1.06 (in) or 1.06 → 1.00 (out).
    // Using zoompan with a trivial motion keeps the subject centred.
    const zExpr =
      zoomDir === "in"
        ? `min(1.001+on*${(0.06 / Math.max(frames - 1, 1)).toFixed(6)},1.06)`
        : `max(1.06-on*${(0.06 / Math.max(frames - 1, 1)).toFixed(6)},1.001)`
    return (
      `${base},zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:s=${width}x${height}:fps=${fps}[v${idx}]`
    )
  }

  const chainA = prep(0, framesA, "in")
  const chainB = prep(1, framesB, "out")
  const xfade = `[v0][v1]xfade=transition=${transition}:duration=${xfadeSec.toFixed(3)}:offset=${offsetSec.toFixed(3)},format=yuv420p[v]`

  return `${chainA};${chainB};${xfade}`
}

export async function generateTransition(opts: TransitionOptions): Promise<Blob> {
  const ffmpeg = await loadFFmpeg(opts.onLog)

  const { durationSec, fps, width, height, transition, kenBurns } = opts

  // Timeline split: short pre-hold, long smooth blend, short post-hold.
  const preHold = Math.max(0.25, durationSec * 0.15)
  const postHold = Math.max(0.25, durationSec * 0.15)
  const xfadeSec = Math.max(0.5, durationSec - preHold - postHold)
  const inputASec = preHold + xfadeSec
  const inputBSec = xfadeSec + postHold

  // Forward ffmpeg's internal progress (0..1 of the encode).
  const progressHandler = ({ progress }: { progress: number }) => {
    opts.onProgress?.(Math.max(0, Math.min(1, progress)))
  }
  ffmpeg.on("progress", progressHandler)

  try {
    await ffmpeg.writeFile("a.png", await fetchFile(opts.frameA))
    await ffmpeg.writeFile("b.png", await fetchFile(opts.frameB))

    const filter = buildFilterComplex({
      width,
      height,
      fps,
      totalSec: durationSec,
      xfadeSec,
      offsetSec: preHold,
      transition,
      kenBurns,
    })

    const args = [
      "-loop", "1", "-t", inputASec.toFixed(3), "-i", "a.png",
      "-loop", "1", "-t", inputBSec.toFixed(3), "-i", "b.png",
      "-filter_complex", filter,
      "-map", "[v]",
      "-r", String(fps),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "out.mp4",
    ]

    await ffmpeg.exec(args)

    const data = await ffmpeg.readFile("out.mp4")
    const uint8 = data as Uint8Array
    // Copy into a fresh buffer so the Blob is detached from FFmpeg's heap.
    const buffer = new ArrayBuffer(uint8.byteLength)
    new Uint8Array(buffer).set(uint8)
    return new Blob([buffer], { type: "video/mp4" })
  } finally {
    ffmpeg.off("progress", progressHandler)
    // Clean the virtual FS so the next run starts fresh.
    try {
      await ffmpeg.deleteFile("a.png")
      await ffmpeg.deleteFile("b.png")
      await ffmpeg.deleteFile("out.mp4")
    } catch {
      // ignore — files may not exist on failure paths
    }
  }
}

/** Read an image file and return its natural dimensions. */
export function readImageDimensions(file: File | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(dims)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}
