// Edge middleware — first line of defence for page routes.
// (Every API route and server layout re-checks the session independently.)
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET });

  if (pathname.startsWith('/admin')) {
    if (token?.role !== 'ADMIN') {
      const url = new URL('/login', req.url);
      url.searchParams.set('callbackUrl', pathname + search);
      return NextResponse.redirect(url);
    }
  } else if (pathname.startsWith('/doctor') && !pathname.startsWith('/doctor/login')) {
    if (token?.role !== 'DOCTOR') {
      const url = new URL('/doctor/login', req.url);
      url.searchParams.set('callbackUrl', pathname + search);
      return NextResponse.redirect(url);
    }
  }
  const res = NextResponse.next();
  // Booking/reschedule tokens are secrets: never leak them via Referer.
  if (pathname.startsWith('/book/') || pathname.startsWith('/reschedule/')) {
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return res;
}

export const config = { matcher: ['/admin/:path*', '/doctor/:path*', '/book/:path*', '/reschedule/:path*'] };
