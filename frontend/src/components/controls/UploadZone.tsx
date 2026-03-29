import { useCallback, useRef, useState } from 'react'
import { Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'

const ACCEPTED_FORMATS = ['.wav', '.flac', '.aiff', '.aif', '.mp3', '.m4a']
const MAX_SIZE_MB = 500

interface Props {
  onFileSelected: (file: File) => void
  accept?: string[]
  maxSizeMb?: number
  disabled?: boolean
}

interface FileInfo {
  name: string
  sizeMb: number
  format: string
}

export function UploadZone({
  onFileSelected, accept = ACCEPTED_FORMATS, maxSizeMb = MAX_SIZE_MB, disabled = false,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
    if (!accept.includes(ext)) {
      setError(`Format ${ext} not supported. Use: ${accept.join(', ')}`)
      return
    }
    const sizeMb = file.size / (1024 * 1024)
    if (sizeMb > maxSizeMb) {
      setError(`File too large (${sizeMb.toFixed(1)} MB). Max: ${maxSizeMb} MB`)
      return
    }
    setError(null)
    setFileInfo({ name: file.name, sizeMb, format: ext.slice(1).toUpperCase() })
    onFileSelected(file)
  }, [accept, maxSizeMb, onFileSelected])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={clsx(
        'relative border-2 border-dashed rounded-lg p-8 cursor-pointer transition-all duration-200',
        'flex flex-col items-center justify-center gap-3 min-h-[160px]',
        dragging  ? 'border-rain-blue bg-rain-blue/5 shadow-[0_0_20px_rgba(74,158,255,0.15)]' : 'border-rain-border',
        disabled  ? 'opacity-40 cursor-not-allowed' : 'hover:border-rain-muted',
        error     ? 'border-rain-red/60' : '',
        fileInfo  ? 'border-rain-green/40 bg-rain-green/5' : '',
      )}
    >
      <input
        ref={inputRef} type="file" className="hidden"
        accept={accept.join(',')} disabled={disabled}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      {fileInfo ? (
        <>
          <CheckCircle size={28} className="text-rain-green" />
          <div className="text-center">
            <p className="text-rain-white font-mono text-sm">{fileInfo.name}</p>
            <p className="text-rain-dim text-xs mt-1">
              {fileInfo.format} · {fileInfo.sizeMb.toFixed(1)} MB
            </p>
          </div>
        </>
      ) : error ? (
        <>
          <AlertCircle size={28} className="text-rain-red" />
          <p className="text-rain-red text-sm font-mono text-center">{error}</p>
        </>
      ) : (
        <>
          <Upload size={28} className="text-rain-dim" />
          <div className="text-center">
            <p className="text-rain-silver text-sm font-mono">Drop audio file here</p>
            <p className="text-rain-dim text-xs mt-1">{accept.join(' · ')} · max {maxSizeMb} MB</p>
          </div>
        </>
      )}
    </div>
  )
}
