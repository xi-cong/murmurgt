import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req: NextRequest) {
  const { roomCode, sessionId } = await req.json() as {
    roomCode: string;
    sessionId: string;
  };

  const key = `room:${roomCode}:members`;
  await redis.srem(key, sessionId);

  const count = await redis.scard(key);
  if (count === 0) {
    await redis.del(key, `leaderboard:${roomCode}`);
    return NextResponse.json({ wiped: true });
  }

  return NextResponse.json({ wiped: false });
}
