// Initialize sandbox orders once per server start. Later judges start fresh when they enter the
// access code; ordinary page/API reads never create or reset orders (lib/demo-reset.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ensureFreshDemo } = await import('./lib/demo-reset');
  await ensureFreshDemo();
}
