import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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

export async function GET() {
  const date = todayKey();

  const memberKeys = await scanAll('room:*:members');

  const [userCounts, msgsToday, flaggedToday] = await Promise.all([
    memberKeys.length > 0
      ? Promise.all(memberKeys.map(k => redis.scard(k)))
      : Promise.resolve([]),
    redis.get(`metrics:msgs:${date}`),
    redis.get(`metrics:flagged:${date}`),
  ]);

  const totalRooms = memberKeys.length;
  const totalUsers = (userCounts as number[]).reduce((sum, n) => sum + n, 0);

  return NextResponse.json({
    totalRooms,
    totalUsers,
    messagesToday: Number(msgsToday ?? 0),
    flaggedToday: Number(flaggedToday ?? 0),
  });
}
