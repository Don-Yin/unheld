// AG Studio data sources: one row per held payment, one row per piece of evidence, joined on hold id.

import type { AgDataSourcesDefinition, AgReportState } from 'ag-studio';
import { gbp as gbpFormat } from '@/lib/holds';
import type { UnheldRegistry } from './evidence-widget';
import type { HoldsData } from './store';

const gbp = { format: gbpFormat };
// Grid date columns: "31 Oct", no year. ag-studio's dateFormat field only accepts a static
// Intl.DateTimeFormat (it has no per-row `now` to compare against), so unlike lib/holds.ts's
// formatDate (used for free text: the estimate line, the assistant's answers) it cannot add the
// year when a date falls outside the current year; see ui-critique.md #6.
const shortDate = { format: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }) };

export function buildStudioData({ holds, evidence }: HoldsData): AgDataSourcesDefinition<UnheldRegistry> {
  return {
    description:
      "A creator's PayPal payments that are on hold. The holds are simulated (the PayPal sandbox never withholds money); " +
      'amounts, captures and trackers are real sandbox data, and evidence rows tagged gmail come from the real test mailbox.',
    sources: [
      {
        id: 'holds',
        description: 'One row per held payment. Release is an estimate from PayPal published release rules.',
        data: holds,
        fields: [
          { id: 'id', name: 'Hold ID', format: 'textFormat', hide: true },
          { id: 'creator', name: 'creator', format: 'textFormat' },
          { id: 'item', name: 'item', format: 'textFormat' },
          { id: 'kind', name: 'kind', format: 'textFormat' },
          { id: 'amount', name: 'amount', format: 'currencyFormat', formatOptions: gbp },
          // No "held since" column: the evidence timeline already shows that date, and at 1440px it
          // was the column that left "paid by" clipped to "pa" / the day number on the right edge
          // (ui-critique.md #1, round 2).
          { id: 'hold', name: 'hold', format: 'textFormat' },
          { id: 'nextStep', name: 'next step', format: 'textFormat' },
          // Not shown as a grid column of its own: gantt-widget.tsx's CreatorCell shows it (with a
          // muted relative hint) in the pinned column instead, and the bar's flag marks it visually.
          { id: 'release', name: 'paid by', format: 'dateFormat', formatOptions: shortDate },
          { id: 'orderId', name: 'PayPal Order', format: 'textFormat', hide: true },
        ],
      },
      {
        id: 'evidence',
        description: 'Timeline for each hold. Source is one of simulated, paypal, gmail, you (a manual step), estimate.',
        data: evidence,
        fields: [
          { id: 'id', name: 'Evidence ID', format: 'textFormat', hide: true },
          { id: 'holdId', name: 'Hold ID', format: 'textFormat', hide: true },
          { id: 'at', name: 'When', format: 'dateTimeFormat' },
          { id: 'source', name: 'Source', format: 'textFormat' },
          { id: 'text', name: 'Evidence', format: 'textFormat' },
        ],
      },
    ],
    relationships: [
      {
        id: 'evidence-hold',
        source: { tableId: 'evidence', fieldId: 'holdId' },
        target: { tableId: 'holds', fieldId: 'id' },
        type: 'many-to-one',
      },
    ],
  };
}

// Don's chosen version C (docs/ui-redesign/c-calendar-gantt.png): the held-payments table becomes a
// calendar gantt that needs real width, not the old table's 14/24-track column beside a 10/24-track
// evidence card. Both widgets now run the full 24 tracks, stacked: summary, gantt, then the evidence
// (event) list below it. The gantt widget itself (gantt-widget.tsx) is a plain custom widget with no
// dataMapping of its own - it reads holdsStore directly, same as evidence/summary - and switches to
// a 'days-left only' list below 768px, so `narrow` only changes track spans here, not which widget
// renders.
export const initialReport = (narrow: boolean): AgReportState<UnheldRegistry> => ({
  pages: [
    {
      id: 'holds',
      widgets: {
        summary: { type: 'summary', dataMapping: {} },
        gantt: { type: 'gantt', dataMapping: {} },
        evidence: { type: 'evidence', dataMapping: {} },
      },
      widgetLayout: narrow
        ? {
            summary: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 3 },
            gantt: { xTrack: 0, yTrack: 3, xSpan: 24, ySpan: 13 },
            evidence: { xTrack: 0, yTrack: 16, xSpan: 24, ySpan: 26 },
          }
        : {
            summary: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 3 },
            // 14 tracks (252px at the 18px studioCanvasRowHeight): gantt-widget.tsx's grid is
            // domLayout="autoHeight" (00-ui-gantt round N, paypal-challenge peer), sizing itself to
            // its real header (44px) plus rows (52px each, 76px for Tom's taller pre-tracking row) -
            // 224px at its tallest, plus studioWidgetPadding's 20px (theme.ts) leaves this only an 8px
            // strip below the last row instead of the 26px an unmeasured 15-track guess left. Sized to
            // the taller pre-tracking state (every screenshot but workbench-tracked.png) rather than
            // the shorter post-tracking one, so the grid is never taller than its own card and a row
            // never clips; checked against run.mjs's gridFits1280/gridFits1440 either way (no cell or
            // bar may sit past the card's own edge) rather than assumed from the day-column count alone.
            gantt: { xTrack: 0, yTrack: 3, xSpan: 24, ySpan: 14 },
            evidence: { xTrack: 0, yTrack: 17, xSpan: 24, ySpan: 18 },
          },
    },
  ],
  selectedPageId: 'holds',
  panels: { filters: { collapsed: true }, data: { collapsed: true }, ai: { collapsed: narrow } },
});
