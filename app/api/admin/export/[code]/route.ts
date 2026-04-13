import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const messages = await redis.lrange(`room:${code}:messages`, 0, -1);

  const parsed = messages.map(m => {
    try { return JSON.parse(m as string); } catch { return m; }
  });

  return new NextResponse(JSON.stringify(parsed, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="room-${code}.json"`,
    },
  });
}
