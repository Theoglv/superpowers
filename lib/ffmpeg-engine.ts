"use client"

import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"

// Single-threaded UMD core. Does NOT require SharedArrayBuffer, so it works
// in any context (no COOP/COEP headers needed).
const CORE_VERSION = "0.12.6"
const CDNS = [
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
]

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
  durationSec: number
  fps: number
  width: number
  height: number
  transition: TransitionType
  kenBurns: boolean
  onProgress?: (ratio: number) => void
  onLog?: (line: string) => void
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

async function loadCoreFromCdn(base: string): Promise<{ coreURL: string; wasmURL: string }> {
  const [coreURL, wasmURL] = await Promise.all([
    withTimeout(toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"), 60_000, `fetch core JS from ${base}`),
    withTimeout(toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"), 120_000, `fetch core WASM from ${base}`),
  ])
  return { coreURL, wasmURL }
}

export async function loadFFmpeg(onLog?: (line: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg()

    // Always forward logs through whatever listener is supplied by the caller.
    // We use a mutable ref so subsequent generations can swap the listener.
    ffmpeg.on("log", ({ message }) => {
      console.log("[v0] ffmpeg:", message)
    })

    let urls: { coreURL: string; wasmURL: string } | null = null
    let lastErr: unknown = null
    for (const base of CDNS) {
      try {
        console.log("[v0] loading ffmpeg core from", base)
        urls = await loadCoreFromCdn(base)
        break
      } catch (e) {
        console.warn("[v0] CDN failed, trying next:", base, e)
        lastErr = e
      }
    }
    if (!urls) throw new Error(`Unable to download FFmpeg core: ${(lastErr as Error)?.message ?? "unknown"}`)

    try {
      await withTimeout(ffmpeg.load(urls), 60_000, "ffmpeg.load()")
    } catch (e) {
      loadingPromise = null
      throw new Error(`FFmpeg failed to initialise: ${(e as Error)?.message ?? e}`)
    }

    if (onLog) ffmpeg.on("log", ({ message }) => onLog(message))
    ffmpegSingleton = ffmpeg
    return ffmpeg
  })()

  try {
    return await loadingPromise
  } catch (e) {
    // Reset so the next attempt can retry from scratch.
    loadingPromise = null
    throw e
  }
}

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

  const prep = (idx: 0 | 1, frames: number, zoomDir: "in" | "out") => {
    const base =
      `[${idx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps}`
    if (!kenBurns) return `${base}[v${idx}]`
    const step = (0.06 / Math.max(frames - 1, 1)).toFixed(6)
    const zExpr =
      zoomDir === "in" ? `min(1.001+on*${step}\\,1.06)` : `max(1.06-on*${step}\\,1.001)`
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
  const ffmpeg = await loadFFmpeg()

  const { durationSec, fps, width, height, transition, kenBurns } = opts

  const preHold = Math.max(0.25, durationSec * 0.15)
  const postHold = Math.max(0.25, durationSec * 0.15)
  const xfadeSec = Math.max(0.5, durationSec - preHold - postHold)
  const inputASec = preHold + xfadeSec
  const inputBSec = xfadeSec + postHold

  const progressHandler = ({ progress }: { progress: number }) => {
    opts.onProgress?.(Math.max(0, Math.min(1, progress)))
  }
  const logHandler = ({ message }: { message: string }) => {
    opts.onLog?.(message)
  }
  ffmpeg.on("progress", progressHandler)
  ffmpeg.on("log", logHandler)

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

    console.log("[v0] ffmpeg exec:", args.join(" "))
    const exitCode = await ffmpeg.exec(args)
    console.log("[v0] ffmpeg exit code:", exitCode)
    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}. Check browser console for details.`)
    }

    const data = await ffmpeg.readFile("out.mp4")
    const uint8 = data as Uint8Array
    const buffer = new ArrayBuffer(uint8.byteLength)
    new Uint8Array(buffer).set(uint8)
    return new Blob([buffer], { type: "video/mp4" })
  } finally {
    ffmpeg.off("progress", progressHandler)
    ffmpeg.off("log", logHandler)
    try {
      await ffmpeg.deleteFile("a.png")
      await ffmpeg.deleteFile("b.png")
      await ffmpeg.deleteFile("out.mp4")
    } catch {
      // ignore — files may not exist on failure paths
    }
  }
}

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
