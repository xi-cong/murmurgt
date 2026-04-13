import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { getAblyRest } from '@/lib/ably';

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  const { text, sessionId, name, color, roomCode } = await req.json() as {
    text: string;
    sessionId: string;
    name: string;
    color: string;
    roomCode: string;
  };

  if ((await redis.get('global:paused')) === '1') {
    return NextResponse.json({ error: 'room_paused' }, { status: 423 });
  }

  const ably = getAblyRest();
  const adminChannel = ably.channels.get('admin-metrics');

  // ── Rate limiting ────────────────────────────────────────────────────────

  // 1. Lockout: blocked for 15s after burst violation
  const locked = await redis.get(`ratelimit:lockout:${sessionId}`);
  if (locked) {
    adminChannel.publish('event', { type: 'rate_limited', roomCode, sessionId, ts: Date.now() });
    return NextResponse.json({ error: 'locked_out' }, { status: 429 });
  }

  // 2. Cooldown: 1.5s between messages (TTL 2s)
  const cooldownSet = await redis.set(`ratelimit:cooldown:${sessionId}`, 1, {
    nx: true,
    ex: 2,
  });
  if (!cooldownSet) {
    adminChannel.publish('event', { type: 'rate_limited', roomCode, sessionId, ts: Date.now() });
    return NextResponse.json({ error: 'cooldown' }, { status: 429 });
  }

  // 3. Burst cap: max 5 messages per 10s window
  const burstKey = `ratelimit:burst:${sessionId}`;
  const burstCount = await redis.incr(burstKey);
  if (burstCount === 1) {
    await redis.expire(burstKey, 10);
  }
  if (burstCount > 5) {
    await redis.set(`ratelimit:lockout:${sessionId}`, 1, { ex: 15 });
    adminChannel.publish('event', { type: 'rate_limited', roomCode, sessionId, ts: Date.now() });
    return NextResponse.json({ error: 'burst_exceeded' }, { status: 429 });
  }

  // ── OpenAI moderation ────────────────────────────────────────────────────

  const modRes = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ input: text, model: 'omni-moderation-latest' }),
  });

  const modData = await modRes.json() as {
    results: Array<{ flagged: boolean }>;
  };

  if (modData.results?.[0]?.flagged) {
    const date = todayKey();
    await Promise.all([
      redis.incr(`metrics:flagged:${date}`).then(() => redis.expire(`metrics:flagged:${date}`, 172_800)),
      redis.incr(`metrics:flagged:${roomCode}:${date}`).then(() =>
        redis.expire(`metrics:flagged:${roomCode}:${date}`, 172_800),
      ),
    ]);
    adminChannel.publish('event', { type: 'flagged', roomCode, sessionId, ts: Date.now() });
    return NextResponse.json({ error: 'flagged' }, { status: 403 });
  }

  // ── Publish, store, leaderboard, metrics ─────────────────────────────────

  const id = crypto.randomUUID();
  const ts = Date.now();
  const message = { id, sessionId, name, color, text, ts };
  const date = todayKey();
  const msgTsKey = `metrics:msg_ts:${roomCode}`;

  await Promise.all([
    // Publish to room Ably channel so all clients receive it
    ably.channels.get(roomCode).publish('message', { id, text, name, color, ts }),
    // Publish to admin metrics channel (fire-and-forget semantics, awaited in Promise.all)
    adminChannel.publish('event', { type: 'message', roomCode, sessionId, flagged: false, ts }),
    // Persist message to Redis list
    redis.lpush(`room:${roomCode}:messages`, JSON.stringify(message)),
    // Update leaderboard sorted set
    redis.zincrby(`leaderboard:${roomCode}`, 1, `${sessionId}:${name}:${color}`),
    // Daily message counter (TTL 48h so it survives past midnight)
    redis.incr(`metrics:msgs:${date}`).then(() => redis.expire(`metrics:msgs:${date}`, 172_800)),
    // Per-room message timestamps for msg/min calculation; clean up entries older than 70s
    redis.zadd(msgTsKey, { score: ts, member: id })
      .then(() => redis.zremrangebyscore(msgTsKey, 0, ts - 70_000))
      .then(() => redis.expire(msgTsKey, 86_400)),
  ]);

  return NextResponse.json(message);
}
