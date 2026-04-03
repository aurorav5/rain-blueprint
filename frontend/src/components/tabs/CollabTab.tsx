import { useState, useCallback, useRef, useEffect } from 'react'
import { MessageSquare, Send, Sparkles, RotateCcw, Volume2, Zap, Shield, ArrowUp, Loader2, AlertTriangle, ChevronRight } from 'lucide-react'
import { useSessionStore } from '@/stores/session'
import type { MacroValues } from '@/stores/session'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  macroSuggestion?: Partial<MacroValues>
  macroSnapshot?: MacroValues
  applied?: boolean
  confidence?: number
}

interface ApiSuggestResponse {
  macros: Record<string, number>
  explanation: string
  confidence: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = '/api/v1'

const TIER_LIMITS: Record<string, number> = {
  free: 0, spark: 0, creator: 10, artist: 20, studio_pro: 50, enterprise: 999999,
}

const ALLOWED_TIERS = new Set(['creator', 'artist', 'studio_pro', 'enterprise'])

const QUICK_PROMPTS = [
  { label: 'Make it louder for Spotify', icon: '🔊', category: 'loudness' },
  { label: 'Add warmth and vinyl feel', icon: '🎵', category: 'character' },
  { label: 'More punch on the drums', icon: '🥁', category: 'dynamics' },
  { label: 'Wider stereo image', icon: '🎧', category: 'spatial' },
  { label: 'Clean up background noise', icon: '🧹', category: 'repair' },
  { label: 'Ready for Apple Music', icon: '🍎', category: 'platform' },
  { label: 'Make vocals stand out more', icon: '🎤', category: 'presence' },
  { label: 'Professional radio-ready sound', icon: '📻', category: 'loudness' },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  loudness: 'border-amber-500/30 hover:border-amber-500/50',
  character: 'border-rose-500/30 hover:border-rose-500/50',
  dynamics: 'border-orange-500/30 hover:border-orange-500/50',
  spatial: 'border-blue-500/30 hover:border-blue-500/50',
  repair: 'border-green-500/30 hover:border-green-500/50',
  platform: 'border-purple-500/30 hover:border-purple-500/50',
  presence: 'border-cyan-500/30 hover:border-cyan-500/50',
}

const MACRO_MAP_KEYS: Record<string, keyof MacroValues> = {
  BRIGHTEN: 'brighten', GLUE: 'glue', WIDTH: 'width',
  PUNCH: 'punch', WARMTH: 'warmth', SPACE: 'space', REPAIR: 'repair',
}

// ---------------------------------------------------------------------------
// Restraint System — prevents over-processing
// ---------------------------------------------------------------------------

function applyRestraints(
  macros: Partial<MacroValues>,
  current: MacroValues,
): { macros: Partial<MacroValues>; warnings: string[] } {
  const warnings: string[] = []
  const result = { ...macros }

  for (const [key, val] of Object.entries(result) as [keyof MacroValues, number][]) {
    const cur = current[key]
    if (val > cur && cur >= 9.0) {
      delete result[key]
      warnings.push(`**${key.toUpperCase()}** is already at ${cur.toFixed(1)} — pushing further risks over-processing`)
      continue
    }
    if (val < cur && cur <= 1.0) {
      delete result[key]
      warnings.push(`**${key.toUpperCase()}** is already at ${cur.toFixed(1)} — can't reduce further`)
      continue
    }
  }

  const newWarmth = result.warmth ?? current.warmth
  const newBrighten = result.brighten ?? current.brighten
  if (newWarmth > 7.0 && newBrighten > 7.0) {
    if (result.warmth !== undefined) {
      result.warmth = Math.min(result.warmth, 7.0)
      warnings.push('Tempered **WARMTH** — high brightness + warmth together causes muddiness')
    }
  }

  if (result.width !== undefined && result.width > 8.0) {
    result.width = Math.min(result.width, 8.0)
    warnings.push('Capped **WIDTH** at 8.0 to preserve mono compatibility')
  }

  const newPunch = result.punch ?? current.punch
  const newGlue = result.glue ?? current.glue
  if (newPunch > 8.0 && newGlue > 8.0) {
    if (result.punch !== undefined) result.punch = Math.min(result.punch, 8.0)
    if (result.glue !== undefined) result.glue = Math.min(result.glue, 8.0)
    warnings.push('Capped **PUNCH** and **GLUE** — stacking both too high crushes dynamics')
  }

  return { macros: result, warnings }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Claude API macro keys (BRIGHTEN, GLUE...) to store keys (brighten, glue...) */
function mapApiMacros(apiMacros: Record<string, number>): Partial<MacroValues> {
  const mapped: Partial<MacroValues> = {}
  for (const [key, val] of Object.entries(apiMacros)) {
    const storeKey = MACRO_MAP_KEYS[key]
    if (storeKey) mapped[storeKey] = val
  }
  return mapped
}

/** Map store macro keys to API keys for the request */
function macrosToApiFormat(macros: MacroValues): Record<string, number> {
  return {
    BRIGHTEN: macros.brighten, GLUE: macros.glue, WIDTH: macros.width,
    PUNCH: macros.punch, WARMTH: macros.warmth, SPACE: macros.space, REPAIR: macros.repair,
  }
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'text-green-400'
  if (c >= 0.5) return 'text-amber-400'
  return 'text-red-400'
}

function confidenceLabel(c: number): string {
  if (c >= 0.8) return 'High confidence'
  if (c >= 0.5) return 'Moderate confidence'
  return 'Low confidence'
}

// ---------------------------------------------------------------------------
// Tier Gate Component
// ---------------------------------------------------------------------------

function TierGate({ currentTier }: { currentTier: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12">
      <Shield size={48} className="text-rain-dim/40 mb-4" />
      <h3 className="text-lg font-bold text-rain-text mb-2">AI Assist — Creator+</h3>
      <p className="text-sm text-rain-dim text-center max-w-sm mb-6">
        The AI Co-Master Engineer uses Claude to analyze your audio and suggest precise
        mastering adjustments. Available on Creator tier and above.
      </p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {[
          { tier: 'Creator', price: '$29/mo', calls: '10 AI calls' },
          { tier: 'Artist', price: '$59/mo', calls: '20 AI calls' },
          { tier: 'Studio Pro', price: '$149/mo', calls: '50 AI calls' },
          { tier: 'Enterprise', price: 'Custom', calls: 'Unlimited' },
        ].map(t => (
          <div key={t.tier} className="bg-rain-surface border border-rain-border/30 rounded-lg p-3 text-center">
            <div className="text-xs font-bold text-rain-teal">{t.tier}</div>
            <div className="text-[10px] text-rain-dim">{t.price}</div>
            <div className="text-[9px] text-rain-dim/60 mt-1">{t.calls}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-rain-dim/50 mt-4">
        Current tier: <span className="text-rain-text font-mono">{currentTier}</span>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Macro Delta Bar
// ---------------------------------------------------------------------------

function MacroDelta({ name, before, after }: { name: string; before: number; after: number }) {
  const delta = after - before
  const pctBefore = (before / 10) * 100
  const pctAfter = (after / 10) * 100
  const isIncrease = delta > 0

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-16 text-right font-mono text-rain-dim uppercase">{name}</span>
      <div className="flex-1 h-1.5 bg-rain-border/20 rounded-full relative overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-rain-dim/30 rounded-full"
          style={{ width: `${pctBefore}%` }}
        />
        <div
          className={`absolute top-0 left-0 h-full rounded-full ${isIncrease ? 'bg-rain-teal/60' : 'bg-amber-500/60'}`}
          style={{ width: `${pctAfter}%` }}
        />
      </div>
      <span className={`w-12 font-mono ${isIncrease ? 'text-rain-teal' : 'text-amber-400'}`}>
        {delta > 0 ? '+' : ''}{delta.toFixed(1)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CollabTab — AI Assist (Claude-powered)
// ---------------------------------------------------------------------------

export default function CollabTab() {
  const { macros, setMacros, fileName, status, genre, inputLufs, inputTruePeak } = useSessionStore()

  // TODO: get actual tier from auth store; default to 'creator' for dev
  const currentTier = 'creator'
  const tierLimit = TIER_LIMITS[currentTier] ?? 0
  const [usageCount, setUsageCount] = useState(0)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: fileName
        ? `I can hear **${fileName}** is loaded. Tell me what you'd like — describe the sound you're going for, and I'll adjust the mastering controls for you.\n\nYou don't need to know any technical terms. Just tell me how you want it to sound.`
        : "Welcome to the AI Co-Master Engineer. Load an audio file in the **Master** tab, then come back here and tell me how you want it to sound.\n\nI'll translate your words into precise mastering adjustments.",
      timestamp: Date.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Build conversation history for multi-turn context
  const buildConversationHistory = useCallback(() => {
    return messages
      .filter(m => m.id !== 'welcome')
      .map(m => ({ role: m.role, content: m.content }))
  }, [messages])

  // Call Claude API via backend
  const callAssistApi = useCallback(async (userQuery: string): Promise<ApiSuggestResponse> => {
    const features: Record<string, number> = {}
    if (inputLufs !== null) features.input_lufs = inputLufs
    if (inputTruePeak !== null) features.input_true_peak = inputTruePeak

    const genreProbs: Record<string, number> = {}
    if (genre) genreProbs[genre.toLowerCase()] = 1.0

    const response = await fetch(`${API_BASE}/assist/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        features,
        current_macros: macrosToApiFormat(macros),
        genre: genreProbs,
        style: 'default',
        platform_targets: ['spotify'],
        user_query: userQuery,
        conversation_history: buildConversationHistory(),
        tier: currentTier,
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'API error' }))
      throw new Error(err.detail?.message ?? err.message ?? `HTTP ${response.status}`)
    }

    return response.json()
  }, [macros, genre, inputLufs, inputTruePeak, currentTier, buildConversationHistory])

  // Send message
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isThinking) return

    setApiError(null)

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    try {
      const result = await callAssistApi(text)

      // Map API macro keys to store keys
      const mappedMacros = mapApiMacros(result.macros)

      // Apply restraint system
      const { macros: restrained, warnings } = applyRestraints(mappedMacros, macros)

      let responseText = result.explanation
      if (warnings.length > 0) {
        responseText += '\n\nI held back on a few things:'
        for (const w of warnings) {
          responseText += `\n- ${w}`
        }
      }

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
        macroSuggestion: Object.keys(restrained).length > 0 ? restrained : undefined,
        macroSnapshot: { ...macros },
        confidence: result.confidence,
      }
      setMessages(prev => [...prev, assistantMsg])
      setUsageCount(prev => prev + 1)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setApiError(errorMessage)

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `I couldn't reach the AI service right now. Error: ${errorMessage}\n\nTry again in a moment, or adjust the controls manually in the Master tab.`,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsThinking(false)
    }
  }, [input, isThinking, macros, callAssistApi])

  // Apply macro suggestion
  const handleApply = useCallback((msgId: string, suggestion: Partial<MacroValues>) => {
    setMacros(suggestion)
    setMessages(prev =>
      prev.map(m => m.id === msgId ? { ...m, applied: true } : m)
    )
  }, [setMacros])

  // Undo: restore macros from snapshot
  const handleUndo = useCallback((msgId: string, snapshot: MacroValues) => {
    setMacros(snapshot)
    setMessages(prev =>
      prev.map(m => m.id === msgId ? { ...m, applied: false } : m)
    )
  }, [setMacros])

  // Reset chat
  const handleReset = useCallback(() => {
    setMessages([{
      id: 'welcome-reset',
      role: 'assistant',
      content: "Fresh start! Tell me what sound you're going for.",
      timestamp: Date.now(),
    }])
    setApiError(null)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const handleQuickPrompt = useCallback((prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }, [])

  // Tier gate
  if (!ALLOWED_TIERS.has(currentTier)) {
    return <TierGate currentTier={currentTier} />
  }

  return (
    <div className="flex flex-col h-full page-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-rain-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-rain-teal" />
          <span className="text-xs font-bold text-rain-teal uppercase tracking-widest">
            AI Assist
          </span>
          <span className="text-[9px] font-mono text-rain-dim ml-2">
            powered by Claude
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Usage meter */}
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1 bg-rain-border/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-rain-teal rounded-full transition-all"
                style={{ width: `${Math.min(100, (usageCount / tierLimit) * 100)}%` }}
              />
            </div>
            <span className="text-[8px] font-mono text-rain-dim">
              {usageCount}/{tierLimit}
            </span>
          </div>
          {status === 'complete' && (
            <span className="badge badge-green text-[9px]">
              <Volume2 size={10} /> MASTERED
            </span>
          )}
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono text-rain-dim hover:text-rain-text transition-colors"
          >
            <RotateCcw size={10} /> Clear
          </button>
        </div>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
          <AlertTriangle size={12} className="text-red-400 shrink-0" />
          <span className="text-[10px] text-red-300 font-mono truncate">{apiError}</span>
          <button
            onClick={() => setApiError(null)}
            className="text-[9px] text-red-400 hover:text-red-300 ml-auto shrink-0"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${
              msg.role === 'user'
                ? 'bg-rain-teal/10 border border-rain-teal/20 rounded-2xl rounded-br-sm px-4 py-2.5'
                : 'bg-rain-surface border border-rain-border/30 rounded-2xl rounded-bl-sm px-4 py-2.5'
            }`}>
              {/* Message text with basic markdown rendering */}
              <div className="text-[13px] leading-relaxed text-rain-text whitespace-pre-wrap">
                {msg.content.split('\n').map((line, i) => (
                  <p key={i} className={line === '' ? 'h-2' : ''}>
                    {line.split(/(\*\*.*?\*\*|\*.*?\*)/).map((part, j) => {
                      if (part.startsWith('**') && part.endsWith('**'))
                        return <strong key={j} className="text-rain-teal font-bold">{part.slice(2, -2)}</strong>
                      if (part.startsWith('*') && part.endsWith('*'))
                        return <em key={j} className="text-rain-text/80">{part.slice(1, -1)}</em>
                      return <span key={j}>{part}</span>
                    })}
                  </p>
                ))}
              </div>

              {/* Confidence indicator */}
              {msg.confidence !== undefined && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-20 h-1 bg-rain-border/20 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        msg.confidence >= 0.8 ? 'bg-green-400' :
                        msg.confidence >= 0.5 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${msg.confidence * 100}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-mono ${confidenceColor(msg.confidence)}`}>
                    {confidenceLabel(msg.confidence)} ({(msg.confidence * 100).toFixed(0)}%)
                  </span>
                </div>
              )}

              {/* Macro suggestion with delta visualization */}
              {msg.macroSuggestion && (
                <div className="mt-3 pt-2 border-t border-rain-border/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-mono text-rain-dim uppercase">Suggested changes:</span>
                  </div>

                  {/* Delta bars */}
                  <div className="space-y-1 mb-3">
                    {Object.entries(msg.macroSuggestion).map(([key, val]) => (
                      <MacroDelta
                        key={key}
                        name={key}
                        before={msg.macroSnapshot?.[key as keyof MacroValues] ?? 5.0}
                        after={val as number}
                      />
                    ))}
                  </div>

                  {msg.applied ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-green-400 flex items-center gap-1">
                        <Zap size={10} /> Applied
                      </span>
                      {msg.macroSnapshot && (
                        <button
                          onClick={() => handleUndo(msg.id, msg.macroSnapshot!)}
                          className="text-[10px] font-mono text-rain-dim hover:text-amber-400 transition-colors flex items-center gap-1"
                        >
                          <RotateCcw size={9} /> Undo
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleApply(msg.id, msg.macroSuggestion!)}
                      className="btn-primary text-[11px] px-3 py-1.5 rounded-lg"
                    >
                      <Zap size={12} className="inline mr-1" />
                      Apply Changes
                    </button>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <div className="text-[8px] font-mono text-rain-dim mt-1.5 text-right">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-rain-surface border border-rain-border/30 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="text-rain-teal animate-spin" />
                <span className="text-[10px] text-rain-dim font-mono">Analyzing your request...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts (show when few messages) */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2 shrink-0">
          <p className="text-[9px] font-mono text-rain-dim uppercase tracking-wider mb-2">Try saying:</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map(p => (
              <button
                key={p.label}
                onClick={() => handleQuickPrompt(p.label)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rain-surface border text-[11px] text-rain-text/70 hover:text-rain-teal transition-colors ${CATEGORY_COLORS[p.category] ?? 'border-rain-border/30'}`}
              >
                <span>{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-rain-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={fileName ? "Describe the sound you want..." : "Load audio first, then describe your sound..."}
              disabled={!fileName || isThinking}
              className="w-full bg-rain-surface border border-rain-border/30 rounded-xl px-4 py-2.5 text-[13px] text-rain-text placeholder:text-rain-dim/50 focus:border-rain-teal/40 focus:outline-none transition-colors disabled:opacity-40"
            />
          </div>
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isThinking || !fileName}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-rain-teal text-rain-black disabled:bg-rain-dim/30 disabled:text-rain-dim transition-colors hover:bg-rain-cyan"
          >
            {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[8px] font-mono text-rain-dim/40 mt-1.5 text-center">
          AI suggestions adjust the 7 mastering controls. You always have the final say.
        </p>
      </div>
    </div>
  )
}
