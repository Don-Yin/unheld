import { resetDemo } from '@/lib/demo-reset';

const fail = (status: number, message: string) => Response.json({ error: message }, { status });

// The quiet 'reset demo' button (workbench.tsx's header): fresh sandbox orders for every hold and
// the Gmail drafts unheld itself created, deleted (lib/demo-reset.ts). Sits behind the
// access-code gate like every other /api/* route (proxy.ts matches every path except /api/enter),
// and is rate-limited in demo-reset.ts so repeated clicks cannot spam the sandbox.
export async function POST() {
  try {
    await resetDemo();
    return Response.json({ ok: true });
  } catch (e) {
    return fail(429, (e as Error).message);
  }
}
