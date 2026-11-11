// Access-code gate on every page and API route. Open when ACCESS_CODE is unset.

import { NextResponse, type NextRequest } from 'next/server';

export const ACCESS_COOKIE = 'unheld_access';

export async function accessToken(code: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`unheld:${code}`));
  return Buffer.from(digest).toString('hex');
}

export async function proxy(request: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();
  if (request.cookies.get(ACCESS_COOKIE)?.value === (await accessToken(code))) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) return Response.json({ error: 'access code required' }, { status: 401 });
  // Proxy responses need an absolute URL; nextUrl keeps the host the browser used.
  const enter = request.nextUrl.clone();
  enter.pathname = '/enter';
  enter.search = '';
  return NextResponse.redirect(enter);
}

export const config = {
  matcher: ['/((?!enter|api/enter|_next/static|_next/image|favicon.ico).*)'],
};
