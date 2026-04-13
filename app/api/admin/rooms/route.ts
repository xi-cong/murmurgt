import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

async function scanAll(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
    keys.push(...(batch as string[]));
    cursor = Number(nextCursor);
  } while (cursor !== 0);
  return keys;
}

function codeFromKey(key: string): string {
  return key.slice('room:'.length, -':members'.length);
}

export async function GET() {
  const memberKeys = await scanAll('room:*:members');

  if (memberKeys.length === 0) {
    return NextResponse.json([]);
  }

  const rooms = await Promise.all(
    memberKeys.map(async (key) => {
      const roomCode = codeFromKey(key);
      const [userCount, messageCount, flaggedCount, pausedVal] = await Promise.all([
        redis.scard(key),
        redis.llen(`room:${roomCode}:messages`),
        redis.get(`metrics:flagged:${roomCode}:${new Date().toISOString().slice(0, 10)}`),
        redis.get(`room:${roomCode}:paused`),
      ]);
      return {
        roomCode,
        userCount: userCount as number,
        messageCount: messageCount as number,
        flaggedCount: Number(flaggedCount ?? 0),
        paused: pausedVal !== null,
      };
    }),
  );

  return NextResponse.json(rooms);
}
