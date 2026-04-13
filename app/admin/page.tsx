'use client';

import { useState, useEffect, useRef } from 'react';

interface GlobalStats {
  totalRooms: number;
  totalUsers: number;
  messagesToday: number;
  flaggedToday: number;
}

interface RoomStat {
  roomCode: string;
  userCount: number;
  messageCount: number;
  flaggedCount: number;
  paused: boolean;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function LineChart({ data }: { data: number[] }) {
  const W = 1000;
  const H = 80;
  const padX = 2;
  const padY = 6;
  const max = Math.max(...data, 1);
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const pts = data.map((v, i) => {
    const x = padX + (i / (data.length - 1)) * innerW;
    const y = padY + (1 - v / max) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = pts.join(' ');
  const areaPoints = [`${padX},${H - padY}`, ...pts, `${W - padX},${H - padY}`].join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 80, display: 'block', pointerEvents: 'none' }}
    >
      {[padY, H / 2, H - padY].map(y => (
        <line key={y} x1={padX} y1={y} x2={W - padX} y2={y} stroke="#222222" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      <polygon points={areaPoints} fill="rgba(123,97,255,0.07)" />
      <polyline points={polylinePoints} fill="none" stroke="#7B61FF" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<GlobalStats>({ totalRooms: 0, totalUsers: 0, messagesToday: 0, flaggedToday: 0 });
  const [rooms, setRooms] = useState<RoomStat[]>([]);
  const [systemPaused, setSystemPaused] = useState(false);
  const [chartData, setChartData] = useState<number[]>(Array(60).fill(0));
  const prevMsgsRef = useRef<number | null>(null);

  function fetchRooms() {
    fetch('/api/admin/rooms').then(r => r.json()).then(setRooms).catch(() => {});
  }

  useEffect(() => {
    fetch('/api/room/status').then(r => r.json()).then(d => setSystemPaused(d.paused)).catch(() => {});

    function fetchAll() {
      fetch('/api/admin/stats').then(r => r.json()).then((data: GlobalStats) => {
        setStats(data);
        setChartData(prev => {
          const delta = prevMsgsRef.current !== null ? Math.max(0, data.messagesToday - prevMsgsRef.current) : 0;
          prevMsgsRef.current = data.messagesToday;
          return [...prev.slice(1), delta];
        });
      }).catch(() => {});
      fetchRooms();
    }

    fetchAll();
    const id = setInterval(fetchAll, 5_000);
    return () => clearInterval(id);
  }, []);

  async function pauseAll(paused: boolean) {
    await fetch('/api/admin/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused }),
    });
    setSystemPaused(paused);
  }

  async function pauseRoom(roomCode: string, paused: boolean) {
    await fetch('/api/admin/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused, roomCode }),
    });
    fetchRooms();
  }

  function exportRoom(roomCode: string) {
    fetch(`/api/admin/export/${roomCode}`)
      .then(r => r.json())
      .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `room-${roomCode}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <>
      <style>{`
        .btn-pause:hover       { background: rgba(123,97,255,0.1) !important; }
        .btn-resume:hover      { background: rgba(0,255,135,0.1) !important; }
        .btn-row-pause:hover   { background: rgba(123,97,255,0.1) !important; }
        .btn-row-resume:hover  { background: rgba(0,255,135,0.1) !important; }
        .btn-export:hover      { border-color: #555 !important; color: #888 !important; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#080808', color: '#e0e0e0', fontFamily: 'monospace', padding: '0 0 40px' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #222222' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#e0e0e0' }}>
              Murmur Control
            </div>
            <div style={{ fontSize: 9, color: '#444444', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 3 }}>
              Admin Dashboard
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: systemPaused ? '#FF3B3B' : '#7B61FF',
                boxShadow: systemPaused ? '0 0 6px #FF3B3B' : '0 0 8px #7B61FF',
              }} />
              <span style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: systemPaused ? '#FF3B3B' : '#7B61FF' }}>
                {systemPaused ? 'System Paused' : 'System Live'}
              </span>
            </div>

            {/* Pause / Resume All */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-pause"
                onClick={() => pauseAll(true)}
                style={{ cursor: 'pointer', padding: '8px 18px', background: 'transparent', color: '#7B61FF', border: '1px solid #7B61FF', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', transition: 'background 0.15s' }}
              >
                PAUSE ALL
              </button>
              <button
                className="btn-resume"
                onClick={() => pauseAll(false)}
                style={{ cursor: 'pointer', padding: '8px 18px', background: 'transparent', color: '#00FF87', border: '1px solid #00FF87', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', transition: 'background 0.15s' }}
              >
                RESUME ALL
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: '24px' }}>

          {/* Stat cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Active Rooms', value: stats.totalRooms, color: '#e0e0e0' },
              { label: 'Active Users', value: stats.totalUsers, color: '#00D4FF' },
              { label: 'Messages Today', value: stats.messagesToday, color: '#7B61FF' },
              { label: 'Flagged Today', value: stats.flaggedToday, color: stats.flaggedToday > 0 ? '#FF3B3B' : '#e0e0e0' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: '#111111', border: '1px solid #222222', borderRadius: 6, padding: '16px 20px' }}>
                <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#444444', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{fmt(value)}</div>
              </div>
            ))}
          </div>

          {/* Rolling chart */}
          <div style={{ background: '#111111', border: '1px solid #222222', borderRadius: 6, padding: '14px 18px 10px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#444444' }}>
                Messages / 5 s — all rooms combined
              </span>
              <span style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#333333' }}>
                5 min rolling window
              </span>
            </div>
            <LineChart data={chartData} />
          </div>

          {/* Rooms table */}
          <div style={{ background: '#111111', border: '1px solid #222222', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 70px 160px 80px', padding: '10px 16px', borderBottom: '1px solid #222222', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#444444' }}>
              <span>Room</span>
              <span style={{ textAlign: 'right' }}>Users</span>
              <span style={{ textAlign: 'right' }}>Messages</span>
              <span style={{ textAlign: 'right' }}>Flagged</span>
              <span style={{ textAlign: 'center' }}>Status</span>
              <span style={{ textAlign: 'right' }}>Export</span>
            </div>

            {rooms.length === 0 && (
              <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 11, color: '#333333', letterSpacing: '0.1em' }}>
                no active rooms
              </div>
            )}

            {rooms.map(room => (
              <div key={room.roomCode} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 70px 160px 80px', padding: '11px 16px', borderBottom: '1px solid #1a1a1a', alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#e0e0e0' }}>
                  {room.roomCode}
                </span>
                <span style={{ textAlign: 'right', color: '#00D4FF' }}>{room.userCount}</span>
                <span style={{ textAlign: 'right', color: '#7B61FF' }}>{fmt(room.messageCount)}</span>
                <span style={{ textAlign: 'right', color: room.flaggedCount > 0 ? '#FF3B3B' : '#333333' }}>
                  {room.flaggedCount}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {room.paused ? (
                    <button
                      className="btn-row-resume"
                      onClick={() => pauseRoom(room.roomCode, false)}
                      style={{ cursor: 'pointer', padding: '4px 12px', background: 'transparent', color: '#00FF87', border: '1px solid #00FF87', borderRadius: 4, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', transition: 'background 0.15s' }}
                    >
                      RESUME
                    </button>
                  ) : (
                    <button
                      className="btn-row-pause"
                      onClick={() => pauseRoom(room.roomCode, true)}
                      style={{ cursor: 'pointer', padding: '4px 12px', background: 'transparent', color: '#7B61FF', border: '1px solid #7B61FF', borderRadius: 4, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', transition: 'background 0.15s' }}
                    >
                      PAUSE
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn-export"
                    onClick={() => exportRoom(room.roomCode)}
                    style={{ cursor: 'pointer', padding: '4px 10px', background: 'transparent', color: '#555555', border: '1px solid #333333', borderRadius: 4, fontFamily: 'monospace', fontSize: 11, transition: 'border-color 0.15s, color 0.15s' }}
                  >
                    Export
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
