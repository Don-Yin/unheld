import { resetDemo } from '@/lib/demo-reset';

const fail = (status: number, message: string) => Response.json({ error: message }, { status });

// The 'reset demo' button: fresh sandbox orders, app-created drafts deleted. Rate-limited.
export async function POST() {
  try {
    await resetDemo();
    return Response.json({ ok: true });
  } catch (e) {
    return fail(429, (e as Error).message);
  }
}
