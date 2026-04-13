import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  const [globalVal, roomVal] = await Promise.all([
    redis.get('global:paused'),
    code ? redis.get(`room:${code}:paused`) : Promise.resolve(null),
  ]);

  const paused = globalVal !== null || roomVal !== null;
  return NextResponse.json({ paused });
}
