import { useState, useCallback } from 'react'
import { UploadZone } from '../controls/UploadZone'
import { Waveform } from '../visualizers/Waveform'
import { Button } from '../common/Button'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { renderLocal } from '@/hooks/useLocalRender'

const PLATFORMS = ['spotify', 'apple_music', 'youtube', 'tidal', 'amazon_music', 'tiktok', 'soundcloud', 'vinyl']
const GENRES = ['default', 'electronic', 'hiphop', 'rock', 'pop', 'classical', 'jazz']

export function MasteringTab() {
  const { tier, tierGte } = useAuthStore()
  const { status, inputLufs, outputLufs, setInputBuffer, setStatus, setResult, setError } = useSessionStore()

  const [file, setFile] = useState<File | null>(null)
  const [platform, setPlatform] = useState('spotify')
  const [genre, setGenre] = useState('default')
  const [aiGenerated, setAiGenerated] = useState(false)

  const handleFile = useCallback((f: File) => {
    setFile(f)
    f.arrayBuffer().then((buf) => setInputBuffer(buf))
  }, [setInputBuffer])

  const handleMaster = async () => {
    if (!file) return
    setStatus('processing', 0)
    try {
      const buf = await file.arrayBuffer()
      if (tier === 'free') {
        // Free tier: full local WASM render, zero network calls
        setStatus('processing', 50)
        const result = await renderLocal(buf, genre, platform)
        useSessionStore.getState().setOutputBuffer(result.outputBuffer)
        setResult(result.integratedLufs, result.truePeakDbtp, {
          overall: 0, spotify: 0, apple_music: 0, youtube: 0, tidal: 0, codec_penalty: {},
        }, '')
      }
      // Paid tier: dispatch to backend (implemented in PART-6)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg.startsWith('RAIN-') ? msg.split(':')[0] ?? 'RAIN-E300' : 'RAIN-E300')
    }
  }

  const isProcessing = status === 'processing' || status === 'analyzing'

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <UploadZone onFileSelected={handleFile} disabled={isProcessing} />

      {file && (
        <Waveform inputLufs={inputLufs} outputLufs={outputLufs} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-rain-dim text-xs font-mono block mb-1">PLATFORM</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full bg-rain-panel border border-rain-border rounded px-2 py-1.5 text-rain-white text-sm font-mono"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p.replace('_', ' ').toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-rain-dim text-xs font-mono block mb-1">GENRE</label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full bg-rain-panel border border-rain-border rounded px-2 py-1.5 text-rain-white text-sm font-mono"
          >
            {GENRES.map((g) => (
              <option key={g} value={g}>{g.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={aiGenerated}
          onChange={(e) => setAiGenerated(e.target.checked)}
          className="accent-rain-blue"
        />
        <span className="text-rain-silver text-xs font-mono">AI GENERATED CONTENT</span>
      </label>

      <Button
        onClick={() => void handleMaster()}
        loading={isProcessing}
        disabled={!file}
        size="lg"
        className="w-full"
      >
        {isProcessing ? 'MASTERING…' : 'MASTER'}
      </Button>

      {status === 'complete' && (
        <div className="border border-rain-border rounded p-3 space-y-2">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-rain-dim">OUTPUT LUFS</span>
            <span className="text-rain-cyan">{outputLufs?.toFixed(1)} LUFS</span>
          </div>
          {tier === 'free' ? (
            <div className="text-center py-2 border border-rain-border rounded">
              <p className="text-rain-dim text-xs font-mono mb-2">
                UPGRADE TO DOWNLOAD
              </p>
              <Button size="sm" variant="ghost">Upgrade to Spark — $9/mo</Button>
            </div>
          ) : (
            <Button size="md" variant="primary" className="w-full">
              DOWNLOAD
            </Button>
          )}
        </div>
      )}

      <p className="text-rain-dim text-[10px] font-mono">
        {tier === 'free'
          ? '⚡ Free tier — rendered locally, listen only. Rain doesn\'t live in the cloud.'
          : 'Preview measurement — final render may differ slightly.'}
      </p>
    </div>
  )
}
