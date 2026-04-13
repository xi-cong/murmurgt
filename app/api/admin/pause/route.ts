import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req: NextRequest) {
  const { paused, roomCode } = await req.json() as { paused: boolean; roomCode?: string };

  if (roomCode) {
    if (paused) {
      await redis.set(`room:${roomCode}:paused`, '1');
    } else {
      await redis.del(`room:${roomCode}:paused`);
    }
  } else {
    if (paused) {
      await redis.set('global:paused', '1');
    } else {
      await redis.del('global:paused');
    }
  }

  return NextResponse.json({ ok: true });
}
