import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req: NextRequest) {
  const { roomCode, sessionId } = await req.json() as {
    roomCode: string;
    sessionId: string;
  };

  const key = `room:${roomCode}:members`;
  await redis.sadd(key, sessionId);
  await redis.expire(key, 86400); // 24 hours

  const [count, pausedVal] = await Promise.all([
    redis.scard(key),
    redis.get(`room:${roomCode}:paused`),
  ]);
  console.log('JOIN: paused value from Redis', roomCode, pausedVal);
  return NextResponse.json({ count, paused: pausedVal === '1' });
}
