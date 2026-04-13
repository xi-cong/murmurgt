import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code param required' }, { status: 400 });
  }

  // ZRANGE with REV and WITHSCORES: highest score first
  const raw = await redis.zrange(`leaderboard:${code}`, 0, -1, {
    rev: true,
    withScores: true,
  }) as (string | number)[];

  // Result is interleaved: [member, score, member, score, ...]
  const entries: { sessionId: string; name: string; color: string; count: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i] as string;
    const score = Number(raw[i + 1]);
    const parts = member.split(':');
    // Format: "{sessionId}:{name}:{color}" — color may contain #, name has no colons
    const sessionId = parts[0];
    const color = parts[parts.length - 1];
    const name = parts.slice(1, parts.length - 1).join(':');
    entries.push({ sessionId, name, color, count: score });
  }

  return NextResponse.json(entries);
}
