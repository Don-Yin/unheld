// Create fresh sandbox orders once per server start (lib/demo-reset.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ensureFreshDemo } = await import('./lib/demo-reset');
  await ensureFreshDemo();
}
