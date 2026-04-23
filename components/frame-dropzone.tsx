"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, X, ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface FrameDropzoneProps {
  label: string
  file: File | null
  onFileChange: (file: File | null) => void
}

export function FrameDropzone({ label, file, onFileChange }: FrameDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      const f = files[0]
      if (!f.type.startsWith("image/")) return
      onFileChange(f)
    },
    [onFileChange],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {file && (
          <button
            type="button"
            onClick={() => onFileChange(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative aspect-square rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden",
          "flex items-center justify-center bg-card",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/60 hover:bg-accent/30",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview || "/placeholder.svg"} alt={label} className="h-full w-full object-contain" />
            <div className="absolute bottom-2 left-2 right-2 rounded-md bg-background/80 backdrop-blur px-2 py-1 text-xs text-muted-foreground truncate">
              {file?.name}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground px-6 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ImageIcon className="h-6 w-6" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Drop an image or click
              </span>
              <span className="text-xs">PNG, JPG, WebP</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
