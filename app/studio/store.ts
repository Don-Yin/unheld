// The UI and Studio tools share the latest read, selection and in-flight write state.
import { flushSync } from 'react-dom';
import type { BuyerDraft, Evidence, Hold } from '@/lib/holds';

export type HoldsData = { holds: Hold[]; evidence: Evidence[]; asOf: string };
export type ActionResult = {
  ok?: boolean; error?: string; uncertain?: boolean; refreshError?: string;
  draft?: BuyerDraft; draftId?: string; to?: string; orderId?: string;
};
type ActionState = { action: 'track' | 'draft'; busy: boolean; result?: ActionResult };
export type View = { data?: HoldsData; selected?: string; actions: Record<string, ActionState> };

let view: View = { actions: {} };
const listeners = new Set<() => void>();
const publish = (next: View) => { view = next; listeners.forEach((l) => l()); };
const actionState = (id: string, state: ActionState) => publish({ ...view, actions: { ...view.actions, [id]: state } });

export const holdsStore = {
  get: () => view.data,
  view: () => view,
  set: (data: HoldsData) => publish({ ...view, data, selected: data.holds.some((h) => h.id === view.selected) ? view.selected : data.holds[0]?.id }),
  select: (selected: string) => publish({ ...view, selected }),
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
};

class ApiError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}

/** One API boundary, including an expired access code. No automatic write retry. */
export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 401) {
    window.location.assign('/enter');
    throw new ApiError('enter the access code again');
  }
  const body = await res.json();
  if (!res.ok) throw new ApiError(body.error ?? 'unheld could not complete the request', body.uncertain);
  return body as T;
}

export async function reloadHolds() {
  const data = await requestJson<HoldsData>('/api/holds', { cache: 'no-store' });
  holdsStore.set(data);
  // A fresh read clears a failed/uncertain action, while a still-running write stays protected.
  publish({ ...view, actions: Object.fromEntries(Object.entries(view.actions).filter(([, state]) => state.busy)) });
}

/** Keep the same selection transition for the calendar and phone list. */
export function selectSmoothly(id: string) {
  const select = () => flushSync(() => holdsStore.select(id));
  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(select);
  else select();
}

/** Save first, then refresh. A saved write must never be reported as failed because its read failed. */
export async function runAction(holdId: string, action: 'track' | 'draft', input: Record<string, string> = {}): Promise<ActionResult> {
  if (view.actions[holdId]?.busy) return { ok: false, error: 'this payment action is already running' };
  actionState(holdId, { action, busy: true });
  let result: ActionResult;
  try {
    result = await requestJson<ActionResult>(`/api/holds/${holdId}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
  } catch (e) {
    result = { ok: false, uncertain: e instanceof ApiError ? e.uncertain : true, error: e instanceof ApiError ? e.message : 'could not confirm the write; refresh payments before trying again' };
  }
  if (result.ok) {
    if (result.draft && view.data) holdsStore.set({ ...view.data, holds: view.data.holds.map((h) => h.id === holdId ? { ...h, draft: result.draft } : h) });
    try { await reloadHolds(); }
    catch { result = { ...result, refreshError: 'saved, but the latest payments could not be read; refresh payments to check' }; }
  }
  actionState(holdId, { action, busy: false, result });
  return result;
}
