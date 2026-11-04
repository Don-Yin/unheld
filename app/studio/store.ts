// The one piece of state shared by the page, the evidence widget and the assistant's tools: the
// latest holds from /api/holds, and the two actions that write on the creator's behalf.

import type { Evidence, Hold } from '@/lib/holds';

export type HoldsData = { holds: Hold[]; evidence: Evidence[]; asOf: string };
export type ActionResult = { ok?: boolean; error?: string; [key: string]: unknown };

// The grid widget has no public row-click event, so its creator cell selects through here.
export type View = { data?: HoldsData; selected?: string };

let view: View = {};
const listeners = new Set<() => void>();
const publish = (next: View) => {
  view = next;
  listeners.forEach((l) => l());
};

export const holdsStore = {
  get: () => view.data,
  view: () => view,
  set: (data: HoldsData) => publish({ ...view, data }),
  select: (selected: string) => publish({ ...view, selected }),
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export async function reloadHolds() {
  const res = await fetch('/api/holds', { cache: 'no-store' });
  if (!res.ok) throw new Error(`reload failed: ${res.status}`);
  holdsStore.set(await res.json());
}

/** POST /api/holds/:id/:action, then reload so the grid and timeline show the result. */
export async function runAction(holdId: string, action: 'track' | 'draft', input: Record<string, string> = {}) {
  const res = await fetch(`/api/holds/${holdId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = (await res.json()) as ActionResult;
  if (res.ok) await reloadHolds();
  return result;
}
