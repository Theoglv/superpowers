import { Film, Lock, Zap } from "lucide-react"
import { VideoTransitionGenerator } from "@/components/video-transition-generator"

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
        <header className="flex flex-col gap-4 mb-10">
          <div className="flex items-center gap-2 text-primary">
            <Film className="h-5 w-5" />
            <span className="text-sm font-medium tracking-wide uppercase">Morph</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-balance max-w-2xl">
            Cinematic video transitions between two images.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl text-pretty leading-relaxed">
            Drop a start frame and an end frame. Morph generates a smooth, cinematic clip between them &mdash;
            100% free, entirely in your browser, no account, no upload.
          </p>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground mt-2">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-4 w-4" />
              On-device processing
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="h-4 w-4" />
              Powered by FFmpeg.wasm
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Film className="h-4 w-4" />
              MP4 export up to 1080p
            </span>
          </div>
        </header>

        <VideoTransitionGenerator />

        <footer className="mt-16 pt-6 border-t border-border text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-2">
          <span>Runs locally via FFmpeg compiled to WebAssembly.</span>
          <span>No images, no videos, no data ever leave your machine.</span>
        </footer>
      </div>
    </main>
  )
}
