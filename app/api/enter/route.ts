import { ACCESS_COOKIE, accessToken } from '@/proxy';
import { resetOnSignIn } from '@/lib/demo-reset';

// Relative redirects: behind a proxy (Render) or on 127.0.0.1, request.url's host is not the one
// the browser used, and an absolute redirect would land on a host without the cookie.
export async function POST(request: Request) {
  const form = await request.formData();
  const code = process.env.ACCESS_CODE;
  const ok = !code || form.get('code') === code;
  const headers = new Headers({ Location: ok ? '/' : '/enter?wrong=1' });
  if (ok && code) {
    try { await resetOnSignIn(); }
    catch (error) {
      console.error('demo sign-in reset failed:', error instanceof Error ? error.message : String(error));
      return new Response(null, { status: 303, headers: { Location: '/enter?reset=1' } });
    }
    const secure = request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https:');
    headers.append(
      'Set-Cookie',
      `${ACCESS_COOKIE}=${await accessToken(code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? '; Secure' : ''}`,
    );
  }
  return new Response(null, { status: 303, headers });
}
