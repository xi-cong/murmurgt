import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /admin/* — but let /admin/login through to avoid redirect loop
  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login')) {
    return NextResponse.next();
  }

  // Also let the auth API through (used by the login page)
  if (pathname.startsWith('/api/admin/auth')) {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  const cookie = req.cookies.get('admin_auth')?.value;

  if (!password || cookie !== password) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
