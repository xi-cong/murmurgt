import { NextRequest, NextResponse } from 'next/server';
import { getAblyRest } from '@/lib/ably';

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room');
  if (!room) {
    return NextResponse.json({ error: 'room query param is required' }, { status: 400 });
  }

  const ably = getAblyRest();
  const tokenRequest = await ably.auth.createTokenRequest({
    capability: { [room]: ['subscribe', 'publish'] },
    ttl: 3600_000, // 1 hour
  });

  return NextResponse.json(tokenRequest);
}
