import { ACCESS_COOKIE } from '@/proxy';

/** Leave the same single-seller access-code session; never change sandbox or Gmail data. */
export async function POST() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/enter', 'Set-Cookie': `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` },
  });
}
