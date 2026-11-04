// Kick off the demo reset once per server start. Render restarts the dyno on every deploy and on
// its own ephemeral-disk schedule, so each boot should start judges from a clean sandbox state
// without waiting for the first page load to notice it is stale (lib/demo-reset.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ensureFreshDemo } = await import('./lib/demo-reset');
  await ensureFreshDemo();
}
