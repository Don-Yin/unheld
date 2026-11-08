'use client';

// The quiet one-line summary above the grid (ui-critique.md #2): "£225 held · 3 payments ·
// next: 6 Nov". Plain text, tabular-nums, no card of its own beyond the widget's shared frame.

import { useSyncExternalStore } from 'react';
import type { AgWidgetData, AgWidgetDataFormat } from 'ag-studio';
import type { AgWidgetDefinition } from 'ag-studio-react';
import { formatDate, gbp } from '@/lib/holds';
import { holdsStore } from './store';

type SummaryState = AgWidgetData<Record<string, never>, AgWidgetDataFormat<unknown>> & { type: 'summary' };
export type SummaryDefinition = AgWidgetDefinition<'summary', SummaryState>;

function SummaryWidget() {
  const { data } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const holds = data?.holds ?? [];
  if (!holds.length) return <p className="flex h-full items-center px-1 text-sm text-pp-muted">no held payments</p>;
  const total = holds.reduce((sum, h) => sum + h.amount, 0);
  const next = holds.toSorted((a, b) => a.release.localeCompare(b.release))[0];
  return (
    <p className="flex h-full items-center gap-1 px-1 text-sm tabular-nums text-pp-muted">
      <span className="font-semibold text-pp-navy">{gbp.format(total)}</span>
      held · {holds.length} payment{holds.length === 1 ? '' : 's'} · next: {formatDate(next.release)}
    </p>
  );
}

export const summaryWidget: SummaryDefinition = {
  id: 'summary',
  label: 'summary',
  icon: { url: '/favicon.ico' },
  dataMapping: {},
  form: (form) => form.createDefaults({ dataMappingItems: [] }),
  comp: SummaryWidget,
  defaultSize: { width: 420, height: 48 },
  minSize: { width: 240, height: 36 },
  toolbar: [],
  ai: { description: 'One-line summary of the held payments: total amount, count and the soonest paid-by date.' },
};
