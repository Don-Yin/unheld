import { loadHolds } from '@/lib/load-holds';

// Fresh holds and evidence, for the assistant's read tool and the page's refresh after an action.
export async function GET() {
  try {
    return Response.json(await loadHolds(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('hold refresh failed:', e);
    return Response.json({ error: 'could not reach paypal or gmail; try again' }, { status: 502 });
  }
}
