export class PreviewEngine {
  private context: AudioContext | null = null
  private sourceNode: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private currentBuffer: AudioBuffer | null = null

  async init(): Promise<void> {
    this.context = new AudioContext({ sampleRate: 48000 })
    this.gainNode = this.context.createGain()
    this.analyserNode = this.context.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.gainNode.connect(this.analyserNode)
    this.analyserNode.connect(this.context.destination)
  }

  async loadAudioFile(file: File | ArrayBuffer): Promise<{ duration: number; sampleRate: number }> {
    if (this.context === null) await this.init()
    const buffer = file instanceof File ? await file.arrayBuffer() : file
    this.currentBuffer = await this.context!.decodeAudioData(buffer.slice(0))
    return { duration: this.currentBuffer.duration, sampleRate: this.currentBuffer.sampleRate }
  }

  play(startTime = 0): void {
    if (this.context === null || this.currentBuffer === null) return
    this.stop()
    this.sourceNode = this.context.createBufferSource()
    this.sourceNode.buffer = this.currentBuffer
    this.sourceNode.connect(this.gainNode!)
    this.sourceNode.start(0, startTime)
  }

  stop(): void {
    try { this.sourceNode?.stop() } catch { /* already stopped */ }
    this.sourceNode?.disconnect()
    this.sourceNode = null
  }

  setVolume(db: number): void {
    if (this.gainNode !== null) {
      this.gainNode.gain.value = Math.pow(10, db / 20)
    }
  }

  getFrequencyData(): Uint8Array {
    if (this.analyserNode === null) return new Uint8Array(0)
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteFrequencyData(data)
    return data
  }

  getWaveformData(): Uint8Array {
    if (this.analyserNode === null) return new Uint8Array(0)
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteTimeDomainData(data)
    return data
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0
  }

  destroy(): void {
    this.stop()
    void this.context?.close()
    this.context = null
  }
}

export const previewEngine = new PreviewEngine()
