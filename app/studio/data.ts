// AG Studio data sources: one row per held payment, one row per piece of evidence, joined on hold id.

import type { AgDataSourcesDefinition, AgReportState } from 'ag-studio';
import type { UnheldRegistry } from './evidence-widget';
import type { HoldsData } from './store';

const gbp = { format: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }) };
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
          // Shown as the "paid by" column (gridOverride's ReleaseCell adds the muted relative hint).
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

// One page: a quiet one-line summary, the held-payments grid sized to its rows (gridOptions has no
// domLayout: 'autoHeight' escape hatch - see evidence-widget.tsx's gridOverride comment - so the
// card's height is this fixed track span instead), and the evidence for the selected row beside it;
// stacked on narrow screens, where Studio's 24-track canvas cannot fit them side by side. At narrow
// widths the grid also drops to its three signature columns (creator, amount, paid by) so nothing is
// clipped or needs horizontal scroll. columnAutoSize sizes every column (wide or narrow) to its
// own content instead of AG Grid's default equal distribution, so "next step" is never truncated
// and "paid by" is never clipped at 1440px (ui-critique.md #1, round 2).
export const initialReport = (narrow: boolean): AgReportState<UnheldRegistry> => ({
  pages: [
    {
      id: 'holds',
      widgets: {
        summary: { type: 'summary', dataMapping: {} },
        grid: {
          type: 'grid',
          dataMapping: {
            cols: narrow
              ? [{ id: 'holds.creator' }, { id: 'holds.amount' }, { id: 'holds.release' }]
              : [
                  { id: 'holds.creator' },
                  { id: 'holds.amount' },
                  { id: 'holds.hold' },
                  { id: 'holds.nextStep' },
                  { id: 'holds.release' },
                ],
          },
          format: { title: { enabled: true, text: 'held payments' }, style: { columnAutoSize: true } },
        },
        evidence: { type: 'evidence', dataMapping: {} },
      },
      widgetLayout: narrow
        ? {
            summary: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 3 },
            grid: { xTrack: 0, yTrack: 3, xSpan: 24, ySpan: 13 },
            evidence: { xTrack: 0, yTrack: 16, xSpan: 24, ySpan: 26 },
          }
        : {
            // Back to 14/10 (round 5): round 2's 16/8 rebalance fixed 1440px clipping by taking width
            // from the evidence card, but the paypal-challenge peer's 1280 review (round 5) found that
            // squeeze too far — an 8-track evidence column is ~270px at 1280, wrapping its badges to
            // 2-3 words and clipping the timeline text mid-sentence. The grid no longer needs the extra
            // width: "paid by" stacks its "in N days" hint under the date (ReleaseCell, round 4) instead
            // of beside it, and "next step" stays ≤18 characters, so 14 tracks fit both without a
            // horizontal scroll at 1440 or 1280 — verified by run.mjs's 1440/1280 checks, not just read.
            summary: { xTrack: 0, yTrack: 0, xSpan: 14, ySpan: 3 },
            grid: { xTrack: 0, yTrack: 3, xSpan: 14, ySpan: 13 },
            // ySpan 36, not 24 (round 6, trimmed to 36 this round): the grid/summary column only
            // uses 16 tracks, so the canvas was already taller than the evidence card — at 1280x720
            // the card ended around y≈490 with ~230px of blank page below it, and Maya's 5-entry
            // timeline scrolled inside that short card, cutting her last line mid-sentence
            // (paypal-challenge peer, round 6). The extra tracks use that already-reserved space
            // instead of widening the card past the grid/summary column, so all 5 entries plus the
            // action row fit with no scroll at 1280 or 1440 (run.mjs's gridFits1280 asserts
            // scrollHeight <= clientHeight for Maya's selection); overflow-y-auto on the <ol> stays
            // as the safety net for any longer timeline. 37 (round 7) put the action row at y≈698,
            // only 22px above the 720px viewport edge; 36 (this round, with content-start packing
            // the <ol> instead of stretching its rows) gives the card one fewer track of height so
            // the footer sits with real clearance above the edge.
            evidence: { xTrack: 14, yTrack: 0, xSpan: 10, ySpan: 36 },
          },
    },
  ],
  selectedPageId: 'holds',
  panels: { filters: { collapsed: true }, data: { collapsed: true }, ai: { collapsed: narrow } },
});
