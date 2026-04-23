/** @type {import('next').NextConfig} */
const nextConfig = {
  // FFmpeg.wasm single-threaded core does NOT require SharedArrayBuffer,
  // so we intentionally do NOT set COOP/COEP headers here — they can break
  // cross-origin resource loading inside preview iframes.
}

export default nextConfig
