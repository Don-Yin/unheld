import { loadHolds } from '@/lib/load-holds';

// Fresh holds and evidence, for the assistant's read tool and the page's refresh after an action.
export async function GET() {
  return Response.json(await loadHolds());
}
