import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json([]);

  const raw = await redis.lrange(`room:${code}:messages`, 0, -1);

  if (!raw || raw.length === 0) return NextResponse.json([]);

  const messages = raw
    .map((m: unknown) => {
      if (typeof m === 'object') return m;
      if (typeof m === 'string') { try { return JSON.parse(m); } catch { return null; } }
      return null;
    })
    .filter(Boolean)
    .reverse();

  return NextResponse.json(messages);
}
