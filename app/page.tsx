'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const PALETTE = [
  '#FF3B3B', '#FF6B00', '#FF8C00', '#FFB300', '#FFE600',
  '#C8FF00', '#00FF87', '#00FFB3', '#00D4FF', '#00A8FF',
  '#4D79FF', '#7B61FF', '#9B59FF', '#C44DFF', '#FF2D9B',
  '#FF0055', '#FF4D6B', '#FF6B9B', '#FF3366', '#FF6600',
  '#00FF47', '#00FFCC', '#00E5FF', '#2979FF', '#651FFF',
  '#D500F9', '#FF1744', '#FF9100', '#FFEA00', '#76FF03',
];

const LOCATIONS = [
  'library', 'crossland', 'pg3', 'clough', 'skiles',
  'student center', 'tech tower', 'culc', 'price gilbert',
  'instructional center', 'north ave', 'east campus',
  'west village', 'crc', 'stamps',
];

const RESERVED = new Set([
  'admin', 'api', 'room', 'login', 'auth',
  'moderate', 'status', 'leaderboard', 'testroom',
]);

interface Star {
  id: number;
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  fontSize: number;
}

interface RoomStat {
  roomCode: string;
  userCount: number;
}

function FloatingStars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    starsRef.current = LOCATIONS.map((label, i) => ({
      id: i,
      label,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      opacity: 0.15 + Math.random() * 0.10,
      fontSize: 10 + Math.floor(Math.random() * 5),
    }));

    let t = 0;

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.008;

      for (const s of starsRef.current) {
        s.x += s.vx;
        s.y += s.vy;

        if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx); }
        if (s.y < 0) { s.y = 0; s.vy = Math.abs(s.vy); }
        if (s.x > canvas.width) { s.x = canvas.width; s.vx = -Math.abs(s.vx); }
        if (s.y > canvas.height) { s.y = canvas.height; s.vy = -Math.abs(s.vy); }

        const pulse = 0.5 + 0.5 * Math.sin(t + s.id * 1.3);
        const alpha = s.opacity * (0.6 + 0.4 * pulse);

        ctx.font = `${s.fontSize}px monospace`;
        ctx.fillStyle = s.color;
        ctx.globalAlpha = alpha;
        ctx.fillText(s.label, s.x, s.y);
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState<RoomStat[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/admin/rooms')
      .then(r => r.json())
      .then((data: RoomStat[]) => setRooms(data.filter(r => !RESERVED.has(r.roomCode))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const join = useCallback((raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return;
    if (RESERVED.has(trimmed)) {
      setError('that code is reserved');
      return;
    }
    setError('');
    router.push(`/room/${trimmed}`);
  }, [router]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') join(code);
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      background: '#0e0e0e',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <FloatingStars />

      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
        width: '100%',
        maxWidth: 480,
        padding: '0 24px',
        boxSizing: 'border-box',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1 }}>
            murmurgt
          </div>
          <div style={{ fontSize: 13, color: '#444', marginTop: 10, letterSpacing: '0.12em' }}>
            anonymous. ephemeral. here.
          </div>
        </div>

        {/* Input area */}
        <div style={{ width: '100%' }}>
          <div ref={wrapperRef} style={{ position: 'relative' }}>

            {/* Input row */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={code}
                onChange={e => { setCode(e.target.value); setError(''); }}
                onKeyDown={onKey}
                onFocus={() => setShowDropdown(true)}
                placeholder="pg3, crossland, library-floor2..."
                autoComplete="off"
                spellCheck={false}
                style={{
                  flex: 1,
                  background: '#141414',
                  border: '1px solid #444',
                  borderRadius: 8,
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontSize: 14,
                  padding: '11px 16px',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
              />
              <button
                onClick={() => join(code)}
                style={{
                  background: '#fff',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fontWeight: 700,
                  padding: '11px 22px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                JOIN
              </button>
            </div>

            {/* Dropdown */}
            {showDropdown && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 54,
                background: '#111',
                border: '1px solid #222',
                borderRadius: 8,
                overflow: 'hidden',
                zIndex: 10,
              }}>
                {rooms.length === 0 ? (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: '#444', letterSpacing: '0.06em' }}>
                    no active rooms right now
                  </div>
                ) : (
                  rooms.map(r => (
                    <div
                      key={r.roomCode}
                      onClick={() => { setShowDropdown(false); join(r.roomCode); }}
                      style={{
                        padding: '10px 16px',
                        fontSize: 13,
                        color: '#ccc',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid #1a1a1a',
                        background: 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontWeight: 700, letterSpacing: '0.08em' }}>{r.roomCode}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Helper / error */}
          <div style={{
            marginTop: 10,
            fontSize: 11,
            color: error ? '#FF3B3B' : '#333',
            letterSpacing: '0.06em',
            paddingLeft: 2,
            minHeight: 16,
          }}>
            {error || 'enter a code to join or create a room'}
          </div>
        </div>

      </div>

      <style>{`
        input::placeholder { color: #333; }
        input:focus { border-color: #333 !important; }
      `}</style>
    </div>
  );
}
