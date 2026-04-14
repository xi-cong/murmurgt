'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { use } from 'react';
import * as Ably from 'ably';

const PALETTE = [
  '#FF3B3B', '#FF6B00', '#FF8C00', '#FFB300', '#FFE600',
  '#C8FF00', '#00FF87', '#00FFB3', '#00D4FF', '#00A8FF',
  '#4D79FF', '#7B61FF', '#9B59FF', '#C44DFF', '#FF2D9B',
  '#FF0055', '#FF4D6B', '#FF6B9B', '#FF3366', '#FF6600',
  '#00FF47', '#00FFCC', '#00E5FF', '#2979FF', '#651FFF',
  '#D500F9', '#FF1744', '#FF9100', '#FFEA00', '#76FF03',
];

const ROW_H = 52;

interface Msg {
  id: string;
  user: string;
  color: string;
  text: string;
  optimistic?: true;
  ts?: number;
}

interface LeaderEntry {
  sessionId: string;
  name: string;
  color: string;
  count: number;
  rank: number;
}

type FlashDir = 'up' | 'down';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [me, setMe] = useState({ user: '', color: '', sessionId: '' });
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [roomPaused, setRoomPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [board, setBoard] = useState<LeaderEntry[]>([]);
  const [flash, setFlash] = useState<Record<string, { dir: FlashDir; ts: number }>>({});
  const [inputError, setInputError] = useState(false);
  const prevRanks = useRef<Record<string, number>>({});
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const ablyRef = useRef<Ably.Realtime | null>(null);

  // Room lifecycle: join on mount, leave on unmount and beforeunload
  useEffect(() => {
    if (!me.sessionId) return;

    fetch('/api/room/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: code, sessionId: me.sessionId }),
    })
      .then(r => r.json())
      .then((d: { count: number }) => setMemberCount(d.count))
      .catch(() => {});

    fetch(`/api/room/messages?code=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then((history: { id: string; name: string; color: string; text: string; ts: number }[]) => {
        console.log('[history] received', history.length, 'messages', history[0] ?? null);
        setMsgs(prev => {
          // Only seed history if no messages have arrived yet (e.g. from Ably)
          if (prev.length > 0) return prev;
          return history.map(m => ({ id: m.id, user: m.name, color: m.color, text: m.text, ts: m.ts }));
        });
      })
      .catch(() => {});

    const leave = () => {
      fetch('/api/room/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code, sessionId: me.sessionId }),
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', leave);
    return () => {
      window.removeEventListener('beforeunload', leave);
      leave();
    };
  }, [code, me.sessionId]);

  // Ably: connect, subscribe, and clean up on unmount
  useEffect(() => {
    const realtime = new Ably.Realtime({
      authUrl: `/api/ably-token?room=${encodeURIComponent(code)}`,
    });
    ablyRef.current = realtime;

    const channel = realtime.channels.get(code);
    channelRef.current = channel;

    channel.subscribe('message', (msg: Ably.Message) => {
      const { id, text, name, color, ts } = msg.data as {
        id: string;
        text: string;
        name: string;
        color: string;
        ts: number;
      };
      setMsgs(prev => {
        // Replace a matching optimistic message if one exists
        const idx = prev.findIndex(
          m =>
            m.optimistic === true &&
            m.user === name &&
            m.text === text &&
            m.ts !== undefined &&
            Math.abs(ts - m.ts) < 3000,
        );
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = { id, user: name, color, text };
          return next;
        }
        return [...prev, { id, user: name, color, text }];
      });
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      realtime.close();
      ablyRef.current = null;
    };
  }, [code]);

  // Poll global pause state every 1500ms, paused when tab is hidden
  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/room/status?code=${encodeURIComponent(code)}`);
      const { paused } = await res.json() as { paused: boolean };
      setRoomPaused(paused);
    };
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { poll(); id = setInterval(poll, 1_500); };
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVisibility = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [code]);

  // Assign identity once per session
  useEffect(() => {
    let raw = sessionStorage.getItem('murmur_user');
    if (!raw) {
      const user = `User${Math.floor(1000 + Math.random() * 9000)}`;
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const sessionId = crypto.randomUUID();
      raw = JSON.stringify({ user, color, sessionId });
      sessionStorage.setItem('murmur_user', raw);
    }
    const parsed = JSON.parse(raw) as { user: string; color: string; sessionId?: string };
    // Migrate sessions created before sessionId was added
    if (!parsed.sessionId) {
      parsed.sessionId = crypto.randomUUID();
      sessionStorage.setItem('murmur_user', JSON.stringify(parsed));
    }
    setMe(parsed as { user: string; color: string; sessionId: string });
  }, []);

  // Poll leaderboard from Redis every 1500ms, paused when tab is hidden
  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/room/leaderboard?code=${encodeURIComponent(code)}`);
      const entries = await res.json() as { sessionId: string; name: string; color: string; count: number }[];
      setBoard(entries.map((e, i) => ({ ...e, rank: i + 1 })));
    };
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { poll(); id = setInterval(poll, 1_500); };
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const onVisibility = () => { document.hidden ? stop() : start(); };
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [code]);

  // Detect rank changes and trigger F1-style flash
  useEffect(() => {
    if (!board.length) return;
    const newFlash: Record<string, { dir: FlashDir; ts: number }> = {};
    const now = Date.now();

    for (const e of board) {
      const prev = prevRanks.current[e.sessionId];
      if (prev !== undefined && prev !== e.rank) {
        newFlash[e.sessionId] = { dir: e.rank < prev ? 'up' : 'down', ts: now };
      }
    }

    prevRanks.current = Object.fromEntries(board.map(e => [e.sessionId, e.rank]));

    if (Object.keys(newFlash).length) {
      setFlash(f => ({ ...f, ...newFlash }));
      setTimeout(() => {
        setFlash(f => {
          const next = { ...f };
          for (const k of Object.keys(newFlash)) {
            if (next[k]?.ts === newFlash[k].ts) delete next[k];
          }
          return next;
        });
      }, 1400);
    }
  }, [board]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (text.length < 2 || !me.user || !me.sessionId || roomPaused) return;

    const tempId = `optimistic-${crypto.randomUUID()}`;
    const sentAt = Date.now();

    // Add optimistic message immediately and clear draft
    setMsgs(prev => [
      ...prev,
      { id: tempId, user: me.user, color: me.color, text: text.slice(0, 280), optimistic: true, ts: sentAt },
    ]);
    setDraft('');

    // POST in background — no await
    fetch('/api/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 280),
        sessionId: me.sessionId,
        name: me.user,
        color: me.color,
        roomCode: code,
      }),
    })
      .then(res => {
        if (res.status === 423) {
          setMsgs(prev => prev.filter(m => m.id !== tempId));
          setRoomPaused(true);
          return;
        }
        if (res.status === 429 || res.status === 403) {
          setMsgs(prev => prev.filter(m => m.id !== tempId));
          setInputError(true);
          setTimeout(() => setInputError(false), 800);
        }
        // 200: Ably subscription will replace the optimistic message
      })
      .catch(() => {
        setMsgs(prev => prev.filter(m => m.id !== tempId));
      });
  }, [draft, me, code, roomPaused]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  const tooShort = draft.trim().length > 0 && draft.trim().length < 2;
  const canSend = draft.trim().length >= 2 && !roomPaused;
  const charsLeft = 280 - draft.length;
  const inputBorderColor = (tooShort || inputError) ? '#FF3B3B55' : '#252525';

  const copyButton = (
    <button
      onClick={() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        });
      }}
      style={{
        marginLeft: 'auto',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontSize: 14,
        lineHeight: 1,
        color: copied ? '#00FF87' : '#555',
        transition: 'color 0.15s',
      }}
    >
      {copied ? '✓' : '🔗'}
    </button>
  );

  const inputBar = (
    <div
      style={{
        padding: '8px 18px 22px',
        borderTop: '1px solid #191919',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        background: '#0e0e0e',
      }}
    >
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, 280))}
          onKeyDown={onKey}
          placeholder={roomPaused ? 'room is paused' : 'say something…'}
          disabled={roomPaused}
          autoComplete="off"
          spellCheck={false}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#141414',
            border: `1px solid ${inputBorderColor}`,
            outline: 'none',
            borderRadius: 6,
            color: roomPaused ? '#333' : '#fff',
            fontFamily: 'monospace',
            fontSize: 16,
            padding: '10px 50px 10px 13px',
            transition: 'border-color 0.15s',
            cursor: roomPaused ? 'not-allowed' : 'text',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 10,
            color: charsLeft < 40 ? (charsLeft < 10 ? '#FF3B3B' : '#FF8C00') : '#333',
            pointerEvents: 'none',
            transition: 'color 0.2s',
          }}
        >
          {draft.length > 0 ? charsLeft : ''}
        </span>
      </div>
      <button
        onClick={send}
        disabled={!canSend}
        style={{
          background: canSend ? (me.color || '#ffffff') : '#1a1a1a',
          color: canSend ? '#000000' : '#3a3a3a',
          border: 'none',
          borderRadius: 6,
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 700,
          padding: '10px 0',
          width: 80,
          cursor: canSend ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s, color 0.15s',
          flexShrink: 0,
        }}
      >
        Murmur
      </button>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input::placeholder { color: #444; }

        /* ── Mobile layout ── */
        @media (max-width: 767px) {
          .desktop-leaderboard { display: none !important; }
          .mobile-leaderboard-overlay { display: block !important; }
        }
        /* ── Desktop layout ── */
        @media (min-width: 768px) {
          .desktop-leaderboard { display: flex !important; }
          .mobile-leaderboard-overlay { display: none !important; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          height: '100vh',
          width: '100vw',
          background: '#0e0e0e',
          fontFamily: 'monospace',
          color: '#fff',
          overflow: 'hidden',
        }}
      >
        {/* ── Chat column ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
            position: 'relative',
          }}
        >
          {/* Top bar: room code left, copy right */}
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: 18,
              right: 18,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
            }}
          >
            <span style={{ fontSize: 11, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              {code}
            </span>
            {memberCount !== null && (
              <span style={{ fontSize: 10, color: '#666', letterSpacing: '0.06em', marginLeft: 8 }}>
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </span>
            )}
            {copyButton}
          </div>


          {/* Pause overlay */}
          {roomPaused && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                background: 'rgba(14,14,14,0.93)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                pointerEvents: 'all',
              }}
            >
              <span style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#3a3a3a' }}>
                this room is temporarily paused
              </span>
            </div>
          )}

          {/* Message stream */}
          <div
            className="chat-padding"
            style={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '52px 22px 10px',
              gap: 4,
            }}
          >
            {msgs.slice(-80).map(m => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  fontSize: 14,
                  lineHeight: 1.55,
                  flexShrink: 0,
                  animation: 'fadeUp 0.18s ease-out',
                }}
              >
                <span style={{ color: m.color, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {m.user}
                </span>
                <span style={{ color: '#d4d4d4', wordBreak: 'break-word' }}>{m.text}</span>
              </div>
            ))}
          </div>

          {/* Mobile leaderboard overlay — hidden on desktop via CSS */}
          <div
            className="mobile-leaderboard-overlay"
            style={{
              display: 'none',
              position: 'absolute',
              top: 40,
              right: 8,
              zIndex: 10,
              pointerEvents: 'none',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid #222',
              borderRadius: 6,
              padding: '6px 8px',
              minWidth: 110,
            }}
          >
            {board.slice(0, 3).map(entry => {
              const f = flash[entry.sessionId];
              const isUp = f?.dir === 'up';
              const isDown = f?.dir === 'down';
              const name = entry.name.length > 8 ? entry.name.slice(0, 8) + '…' : entry.name;
              return (
                <div
                  key={entry.sessionId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '2px 0',
                    borderRadius: 3,
                    transition: 'background-color 0.35s ease',
                    backgroundColor: isUp ? 'rgba(0,255,135,0.09)' : isDown ? 'rgba(255,59,59,0.09)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: 10, color: '#555', flexShrink: 0, width: 10, textAlign: 'right' }}>{entry.rank}</span>
                  <span style={{ fontSize: 10, color: entry.color, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ fontSize: 10, color: '#888', flexShrink: 0 }}>{entry.count}</span>
                </div>
              );
            })}
          </div>

          {inputBar}
        </div>

        {/* ── Desktop leaderboard panel — hidden on mobile via CSS ── */}
        <div
          className="desktop-leaderboard"
          style={{
            width: 236,
            background: '#0a0a0a',
            borderLeft: '1px solid #1a1a1a',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px 12px',
              fontSize: 10,
              color: '#555',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              borderBottom: '1px solid #1a1a1a',
              userSelect: 'none',
            }}
          >
            Leaderboard
          </div>

          {/* Animated rows */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <div
              style={{
                position: 'relative',
                height: board.length * ROW_H,
                transition: 'height 0.45s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              {board.map(entry => {
                const f = flash[entry.sessionId];
                const isUp = f?.dir === 'up';
                const isDown = f?.dir === 'down';

                return (
                  <div
                    key={entry.sessionId}
                    style={{
                      position: 'absolute',
                      top: (entry.rank - 1) * ROW_H,
                      left: 0,
                      right: 0,
                      height: ROW_H,
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 15px',
                      gap: 8,
                      borderBottom: '1px solid #141414',
                      transition: 'top 0.45s cubic-bezier(0.4,0,0.2,1), background-color 0.35s ease',
                      backgroundColor: isUp
                        ? 'rgba(0,255,135,0.09)'
                        : isDown
                        ? 'rgba(255,59,59,0.09)'
                        : 'transparent',
                    }}
                  >
                    {/* Rank number */}
                    <span style={{ width: 20, textAlign: 'right', fontSize: 11, color: '#666', flexShrink: 0 }}>
                      {entry.rank}
                    </span>

                    {/* Direction arrow */}
                    <span
                      style={{
                        width: 10,
                        fontSize: 9,
                        textAlign: 'center',
                        flexShrink: 0,
                        color: isUp ? '#00FF87' : isDown ? '#FF3B3B' : 'transparent',
                        transition: 'color 0.25s',
                      }}
                    >
                      {isDown ? '▼' : '▲'}
                    </span>

                    {/* Username */}
                    <span
                      style={{
                        flex: 1,
                        color: entry.color,
                        fontSize: 12,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.name}
                    </span>

                    {/* Message count */}
                    <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>
                      {entry.count}
                    </span>
                  </div>
                );
              })}
            </div>

            {board.length === 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 24,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: 11,
                  color: '#2a2a2a',
                }}
              >
                no messages yet
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
