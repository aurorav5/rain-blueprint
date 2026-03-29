import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth'

// ── Types ──────────────────────────────────────────────────────────────────

interface Collaborator {
  id: string
  name: string
  email: string
  avatar: string
  online: boolean
  role: 'owner' | 'editor' | 'viewer'
  editingParam: string | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: string
}

interface TimelineComment {
  id: string
  author: string
  avatar: string
  positionPct: number   // 0–100
  timestamp: string
  text: string
  resolved: boolean
}

// ── Static mock data ───────────────────────────────────────────────────────

const INITIAL_COLLABORATORS: Collaborator[] = [
  {
    id: 'user_001',
    name: 'Phil Bölke',
    email: 'phil@arcovel.com',
    avatar: 'PB',
    online: true,
    role: 'owner',
    editingParam: 'target_lufs',
  },
  {
    id: 'user_002',
    name: 'Maya Chen',
    email: 'maya@arcovel.com',
    avatar: 'MC',
    online: true,
    role: 'editor',
    editingParam: 'eq_gains[3]',
  },
  {
    id: 'user_003',
    name: 'Jordan Kim',
    email: 'j.kim@studio.io',
    avatar: 'JK',
    online: false,
    role: 'viewer',
    editingParam: null,
  },
]

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg_001',
    role: 'user',
    content: 'Make it warmer',
    timestamp: '14:32',
  },
  {
    id: 'msg_002',
    role: 'ai',
    content:
      "I'd suggest boosting the low-mids slightly and adding some tape saturation. Here's what I recommend:\n\n• **eq_gains[1]** (250 Hz): +1.5 dB — adds body and warmth\n• **eq_gains[2]** (500 Hz): +0.8 dB — thickens the mid-range\n• **saturation_mode**: tape · **saturation_drive**: 0.35 — gentle harmonic coloring\n• **mb_ratio_low**: reduce from 2.5 → 2.0 — lets the low-end breathe more naturally\n\nApply these together and run another preview render to hear the difference.",
    timestamp: '14:32',
  },
  {
    id: 'msg_003',
    role: 'user',
    content: "Can you also check the high end? It feels a bit harsh around 8k.",
    timestamp: '14:33',
  },
]

const AI_TYPING_RESPONSE =
  "Analysing your high-frequency content… The 8 kHz region shows some build-up from the snare transients. I'd try:\n\n• **eq_gains[5]** (8 kHz): -1.2 dB — tames harshness without losing air\n• **eq_gains[6]** (12 kHz): -0.5 dB — smooth top-end rolloff\n\nThis should preserve presence while reducing listener fatigue."

const INITIAL_COMMENTS: TimelineComment[] = [
  {
    id: 'cmt_001',
    author: 'Phil Bölke',
    avatar: 'PB',
    positionPct: 12,
    timestamp: '14:15',
    text: 'Kick feels a little muddy here — maybe trim 200 Hz?',
    resolved: false,
  },
  {
    id: 'cmt_002',
    author: 'Maya Chen',
    avatar: 'MC',
    positionPct: 47,
    timestamp: '14:28',
    text: 'Love this section! The stereo width is perfect.',
    resolved: true,
  },
  {
    id: 'cmt_003',
    author: 'Jordan Kim',
    avatar: 'JK',
    positionPct: 78,
    timestamp: '14:31',
    text: 'Outro tail feels clipped — check head/tail silence settings.',
    resolved: false,
  },
]

// ── Avatar chip ────────────────────────────────────────────────────────────

function AvatarChip({
  initials,
  online,
  size = 'md',
}: {
  initials: string
  online: boolean
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[8px]' : 'w-8 h-8 text-[9px]'
  return (
    <div className="relative shrink-0">
      <div
        className={`${dim} rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#D946EF] flex items-center justify-center font-mono font-bold text-white`}
      >
        {initials}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#141225] ${
          online ? 'bg-[#AAFF00]' : 'bg-[#4A4565]'
        }`}
      />
    </div>
  )
}

// ── Role badge ─────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Collaborator['role'] }) {
  const styles: Record<Collaborator['role'], string> = {
    owner:  'bg-[#F97316]/15 text-[#F97316] border-[#F97316]/30',
    editor: 'bg-[#8B5CF6]/15 text-[#8B5CF6] border-[#8B5CF6]/30',
    viewer: 'bg-[#2A2545] text-rain-dim border-[#2A2545]',
  }
  return (
    <span
      className={`px-1.5 py-0.5 rounded border text-[8px] font-mono font-bold tracking-wider ${styles[role]}`}
    >
      {role.toUpperCase()}
    </span>
  )
}

// ── Markdown-lite renderer (bold only) ────────────────────────────────────

function RenderMd({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, li) => {
        // Replace **text** with <strong>
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        return (
          <span key={li} className="block">
            {parts.map((part, pi) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={pi} className="text-[#E8E6F0] font-semibold">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={pi}>{part}</span>
              )
            )}
          </span>
        )
      })}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CollabTab() {
  const { tierGte } = useAuthStore()
  const isStudioPro = tierGte('studio_pro')

  // Session sharing
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSent, setInviteSent] = useState(false)
  const [collaborators] = useState<Collaborator[]>(INITIAL_COLLABORATORS)

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Timeline comments
  const [comments, setComments] = useState<TimelineComment[]>(INITIAL_COMMENTS)
  const [activeComment, setActiveComment] = useState<string | null>(null)

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleInvite = () => {
    if (!inviteEmail.trim()) return
    setInviteSent(true)
    setInviteEmail('')
    setTimeout(() => setInviteSent(false), 3000)
  }

  const handleSendMessage = () => {
    const text = inputText.trim()
    if (!text || isTyping) return

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setIsTyping(true)

    // Simulate RAIN AI (claude-opus-4-6) response
    setTimeout(() => {
      setIsTyping(false)
      const aiMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'ai',
        content: AI_TYPING_RESPONSE,
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, aiMsg])
    }, 2200)
  }

  const handleResolveComment = (id: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, resolved: true } : c))
    setActiveComment(null)
  }

  const onlineCount = collaborators.filter(c => c.online).length

  return (
    <div className="p-4 max-w-5xl space-y-4">

      {/* ── Studio Pro gate ─────────────────────────────────────────────── */}
      {!isStudioPro && (
        <div className="panel-card border-[#8B5CF6]/40">
          <div className="panel-card-body flex items-center gap-3 py-3">
            <span className="text-lg select-none">🔒</span>
            <div className="flex-1">
              <p className="text-[10px] font-mono font-bold text-[#8B5CF6] tracking-wider">
                COLLABORATION — STUDIO PRO
              </p>
              <p className="text-[9px] font-mono text-rain-dim mt-0.5">
                Upgrade to Studio Pro ($149/mo) to invite collaborators, use RAIN AI Chat, and annotate sessions.
              </p>
            </div>
            <button className="shrink-0 px-3 py-1.5 rounded border border-[#8B5CF6]/50 bg-[#8B5CF6]/20 text-[#8B5CF6] text-[9px] font-mono font-bold tracking-wider hover:bg-[#8B5CF6]/30 transition-colors">
              UPGRADE
            </button>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 xl:grid-cols-2 gap-4 ${!isStudioPro ? 'opacity-40 pointer-events-none select-none' : ''}`}>

        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Session sharing */}
          <div className="panel-card">
            <div className="panel-card-header">
              <span className="text-[10px] font-mono tracking-widest text-[#E8E6F0]">
                SESSION SHARING
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-[9px] font-mono text-rain-dim">
                <span className="w-2 h-2 rounded-full bg-[#AAFF00] animate-pulse" />
                {onlineCount} online
              </span>
            </div>
            <div className="panel-card-body space-y-4">
              {/* Invite input */}
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  placeholder="Invite by email…"
                  className="flex-1 bg-[#0D0B1A] border border-[#2A2545] rounded px-3 py-2 text-[10px] font-mono text-[#E8E6F0] placeholder:text-rain-dim outline-none focus:border-[#8B5CF6] transition-colors"
                />
                <button
                  onClick={handleInvite}
                  className={`shrink-0 px-3 py-2 rounded border text-[9px] font-mono font-bold tracking-wider transition-all ${
                    inviteSent
                      ? 'bg-[#AAFF00]/15 border-[#AAFF00]/40 text-[#AAFF00]'
                      : 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-[#8B5CF6] hover:bg-[#8B5CF6]/30'
                  }`}
                >
                  {inviteSent ? 'SENT ✓' : 'INVITE'}
                </button>
              </div>

              {/* Collaborator list */}
              <div className="space-y-2">
                {collaborators.map(collab => (
                  <div
                    key={collab.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded border border-[#2A2545] bg-[#0D0B1A]/50"
                  >
                    <AvatarChip initials={collab.avatar} online={collab.online} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#E8E6F0] truncate">{collab.name}</span>
                        <RoleBadge role={collab.role} />
                      </div>
                      <p className="text-[8px] font-mono text-rain-dim truncate">{collab.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {collab.online ? (
                        <span className="text-[8px] font-mono text-[#AAFF00]">● ONLINE</span>
                      ) : (
                        <span className="text-[8px] font-mono text-rain-dim">○ OFFLINE</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Session lock status */}
          <div className="panel-card">
            <div className="panel-card-header">
              <span className="text-[10px] font-mono tracking-widest text-[#E8E6F0]">
                PARAMETER LOCKS
              </span>
            </div>
            <div className="panel-card-body space-y-2">
              {collaborators
                .filter(c => c.online && c.editingParam)
                .map(collab => (
                  <div
                    key={collab.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded border border-[#F97316]/20 bg-[#F97316]/5"
                  >
                    <AvatarChip initials={collab.avatar} online size="sm" />
                    <span className="text-[9px] font-mono text-[#E8E6F0]">{collab.name}</span>
                    <span className="text-[9px] font-mono text-rain-dim">is editing</span>
                    <span className="text-[9px] font-mono font-bold text-[#F97316] bg-[#F97316]/10 px-1.5 py-0.5 rounded border border-[#F97316]/30">
                      {collab.editingParam}
                    </span>
                    <span className="ml-auto text-[8px] font-mono text-rain-dim">🔒 locked</span>
                  </div>
                ))}
              {collaborators.filter(c => c.online && c.editingParam).length === 0 && (
                <p className="text-[9px] font-mono text-rain-dim text-center py-2">
                  No parameters currently locked
                </p>
              )}
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* RAIN AI Chat */}
          <div className="panel-card flex flex-col" style={{ minHeight: '380px' }}>
            <div className="panel-card-header shrink-0">
              <span className="text-[10px] font-mono tracking-widest text-[#E8E6F0]">
                RAIN AI CHAT
              </span>
              <span className="ml-auto text-[8px] font-mono text-rain-dim">
                claude-opus-4-6
              </span>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: '280px' }}>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  {msg.role === 'ai' ? (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#D946EF] flex items-center justify-center text-[8px] font-mono font-bold text-white mt-0.5">
                      R∞N
                    </div>
                  ) : (
                    <div className="shrink-0 w-7 h-7 rounded-full bg-[#2A2545] flex items-center justify-center text-[8px] font-mono font-bold text-[#E8E6F0] mt-0.5">
                      YOU
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={`max-w-[78%] px-3 py-2 rounded-lg text-[9px] font-mono leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#E8E6F0] rounded-tr-sm'
                        : 'bg-[#141225] border border-[#2A2545] text-rain-dim rounded-tl-sm'
                    }`}
                  >
                    <RenderMd text={msg.content} />
                    <span className="block text-[7px] text-rain-dim mt-1.5 opacity-60">
                      {msg.timestamp}
                    </span>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-2.5">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#D946EF] flex items-center justify-center text-[8px] font-mono font-bold text-white">
                    R∞N
                  </div>
                  <div className="px-3 py-2.5 rounded-lg rounded-tl-sm bg-[#141225] border border-[#2A2545] flex items-center gap-1">
                    {[0, 150, 300].map(delay => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-[#2A2545] p-3 flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Ask RAIN to adjust your master…"
                disabled={isTyping}
                className="flex-1 bg-[#0D0B1A] border border-[#2A2545] rounded px-3 py-2 text-[10px] font-mono text-[#E8E6F0] placeholder:text-rain-dim outline-none focus:border-[#8B5CF6] transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isTyping}
                className="shrink-0 w-9 h-9 rounded border border-[#8B5CF6]/50 bg-[#8B5CF6]/20 text-[#8B5CF6] flex items-center justify-center hover:bg-[#8B5CF6]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 6L11 6M11 6L7 2M11 6L7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Timeline comments */}
          <div className="panel-card">
            <div className="panel-card-header">
              <span className="text-[10px] font-mono tracking-widest text-[#E8E6F0]">
                TIMELINE COMMENTS
              </span>
              <span className="ml-auto text-[9px] font-mono text-rain-dim">
                {comments.filter(c => !c.resolved).length} open
              </span>
            </div>
            <div className="panel-card-body space-y-3">
              {/* Visual timeline scrubber */}
              <div className="relative h-6 bg-[#0D0B1A] rounded border border-[#2A2545] overflow-visible">
                {/* Track gradient */}
                <div className="absolute inset-y-0 left-0 right-0 mx-2 my-1.5 rounded-full bg-gradient-to-r from-[#8B5CF6]/20 via-[#D946EF]/20 to-[#F97316]/20" />
                {/* Comment pins */}
                {comments.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setActiveComment(prev => prev === c.id ? null : c.id)}
                    style={{ left: `${c.positionPct}%` }}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border transition-all ${
                      c.resolved
                        ? 'bg-[#2A2545] border-[#4A4565]'
                        : activeComment === c.id
                        ? 'bg-[#D946EF] border-[#D946EF] scale-125 shadow-[0_0_8px_rgba(217,70,239,0.6)]'
                        : 'bg-[#8B5CF6] border-[#8B5CF6] hover:scale-110'
                    }`}
                    aria-label={`Comment by ${c.author}`}
                  />
                ))}
              </div>

              {/* Comment cards */}
              <div className="space-y-2">
                {comments.map(c => (
                  <div
                    key={c.id}
                    className={`rounded border px-3 py-2.5 transition-all cursor-pointer ${
                      c.resolved
                        ? 'border-[#2A2545] bg-[#0D0B1A]/30 opacity-50'
                        : activeComment === c.id
                        ? 'border-[#D946EF]/40 bg-[#D946EF]/5'
                        : 'border-[#2A2545] bg-[#0D0B1A]/50 hover:border-[#4A4565]'
                    }`}
                    onClick={() => setActiveComment(prev => prev === c.id ? null : c.id)}
                  >
                    <div className="flex items-start gap-2">
                      <AvatarChip
                        initials={c.avatar}
                        online={collaborators.find(col => col.avatar === c.avatar)?.online ?? false}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-mono font-semibold text-[#E8E6F0]">{c.author}</span>
                          <span className="text-[8px] font-mono text-rain-dim">@ {c.positionPct.toFixed(0)}%</span>
                          <span className="text-[8px] font-mono text-rain-dim">{c.timestamp}</span>
                          {c.resolved && (
                            <span className="text-[7px] font-mono font-bold px-1 py-0.5 rounded bg-[#AAFF00]/10 text-[#AAFF00] border border-[#AAFF00]/20">
                              RESOLVED
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] font-mono text-rain-dim mt-1 leading-snug">{c.text}</p>
                        {activeComment === c.id && !c.resolved && (
                          <button
                            onClick={e => { e.stopPropagation(); handleResolveComment(c.id) }}
                            className="mt-2 text-[8px] font-mono font-bold text-[#AAFF00] hover:underline"
                          >
                            ✓ Mark resolved
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
