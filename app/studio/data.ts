// AG Studio data sources: one row per held payment, one row per piece of evidence, joined on hold id.

import type { AgDataSourcesDefinition, AgReportState } from 'ag-studio';
import { gbp as gbpFormat } from '@/lib/holds';
import type { UnheldRegistry } from './evidence-widget';
import type { HoldsData } from './store';

const gbp = { format: gbpFormat };
// Grid dates: "31 Oct". ag-studio takes only a static Intl format, so no year logic here.
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
          // No "held since" column: the evidence timeline shows it.
          { id: 'hold', name: 'hold', format: 'textFormat' },
          { id: 'nextStep', name: 'next step', format: 'textFormat' },
          // Shown in the gantt's pinned column and by the bar's flag.
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

// Summary, gantt and evidence stacked at the full 24 tracks. Below 768px the gantt becomes a
// days-left list itself, so `narrow` only changes track spans.
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
            // 14 tracks (252px) fit the grid's tallest state: 44px header, 52px rows, one 76px row.
            gantt: { xTrack: 0, yTrack: 3, xSpan: 24, ySpan: 14 },
            evidence: { xTrack: 0, yTrack: 17, xSpan: 24, ySpan: 18 },
          },
    },
  ],
  selectedPageId: 'holds',
  panels: { filters: { collapsed: true }, data: { collapsed: true }, ai: { collapsed: narrow } },
});
