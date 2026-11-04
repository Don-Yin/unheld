'use client';

// The custom AG Studio widget: the evidence timeline for the payment selected in the grid (its
// creator cell is a select button, see gridOverride), with the one action that fits the next step.

import { useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, ChevronUp, Mail, Truck } from 'lucide-react';
import type { CustomCellRendererProps } from 'ag-grid-react';
import type { AgDefaultWidgetDefinition, AgWidgetData, AgWidgetDataFormat, AgWidgetField } from 'ag-studio';
import type { AgRegistry, AgWidgetDefinition } from 'ag-studio-react';
import { daysUntil, formatDate, type Hold, type Source } from '@/lib/holds';
import { HOLD_ICON, SOURCE_ICON } from './icons';
import { holdsStore, runAction, type ActionResult } from './store';
import type { SummaryDefinition } from './summary-widget';

// One icon box width and gap for every inline icon, so labels line up across rows and buttons.
const ICON = 'size-4 shrink-0';
// Exported: workbench.tsx's assistant-panel decoration reuses this exact gap so the assistant's
// source tags line up with the evidence badge they are styled to match (ui-critique.md #3, round 2).
export const ICON_GAP = 'gap-1.5';

// The widget's saved state; `type` makes it one member of the registry's widget-state union.
type EvidenceState = AgWidgetData<Record<string, never>, AgWidgetDataFormat<unknown>> & { type: 'evidence' };
type EvidenceDefinition = AgWidgetDefinition<'evidence', EvidenceState>;

export interface UnheldRegistry extends AgRegistry {
  widgets: readonly (AgDefaultWidgetDefinition | EvidenceDefinition | SummaryDefinition)[];
}

// Exported for the same reason as ICON_GAP: workbench.tsx's assistant-panel decoration borrows
// these exact classes so the assistant's `source` code tags render as this evidence badge, not a
// separately styled chip.
export const BADGE: Record<Source, string> = {
  simulated: 'border-pp-warning text-pp-warning',
  paypal: 'border-pp-blue text-pp-blue',
  gmail: 'border-pp-success text-pp-success',
  you: 'border-pp-navy bg-pp-navy text-white',
  estimate: 'border-pp-border text-pp-muted',
};

function useSelected() {
  const { data, selected } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const hold = data?.holds.find((h) => h.id === selected);
  // load-holds.ts already orders evidence chronologically, with story order (paypal, simulated,
  // gmail, you, estimate) breaking ties within the same day; re-sorting here by `at` alone would
  // undo that tie-break and put gmail ahead of paypal on same-day rows (peer review round 6).
  const rows = (data?.evidence ?? []).filter((e) => e.holdId === selected);
  return { hold, rows, hasHolds: Boolean(data?.holds.length) };
}

/** Crossfades the old evidence into the new one (View Transitions), so a switch never blanks the panel for a frame. */
function selectSmoothly(id: string) {
  const select = () => flushSync(() => holdsStore.select(id));
  if (document.startViewTransition) document.startViewTransition(select);
  else select();
}

/** Creator cell in the grid: selecting it shows that payment's evidence. */
function CreatorCell({ value, data }: CustomCellRendererProps<{ id: string }>) {
  const { selected, data: holds } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const id = data?.id ?? holds?.holds.find((h) => h.creator === value)?.id;
  return (
    <button
      onClick={() => id && selectSmoothly(id)}
      aria-pressed={selected === id}
      title={value}
      className={`h-full w-full truncate text-left transition-colors duration-150 hover:text-pp-blue ${selected === id ? 'font-semibold text-pp-blue' : ''}`}
    >
      {value}
    </button>
  );
}

/**
 * "Paid by" column: the release estimate with a muted relative hint ("in 6 days") — the grid's
 * one accent moment, per frontend-design-convention.
 */
function ReleaseCell({ data }: CustomCellRendererProps<Pick<Hold, 'creator'>>) {
  // `asOf` (the server's "now" when the holds were loaded) keeps this pure: no Date.now() call
  // during render, and the same reference the grid's own data is already relative to.
  //
  // Reads the raw hold from the store rather than trusting ag-grid's own `data.release`, since the
  // `release` field is declared `dateFormat` and the grid may hold only its display string, not a
  // parseable date. The row's cell keys are namespaced by table (`holds.creator`, not `creator`),
  // the same prefix `id.endsWith('creator')` below expects on CreatorCell's column id.
  const { data: holds } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const creator = (data as Record<string, unknown> | undefined)?.['holds.creator'] as string | undefined;
  const hold = holds?.holds.find((h) => h.creator === creator);
  if (!hold) return null;
  const days = daysUntil(hold.release, holds?.asOf ?? 0);
  const relative = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  // Stacked under the date, not beside it (round 3's second review): a date plus its "in N days"
  // hint side by side needs about twice the width of the date alone, and at 1280px the wide
  // layout's grid column has no slack for that — "next step" truncated to make room
  // (ui-critique.md #1, round 2's narrow-grid fix covered 1440px but not 1280). Stacking needs
  // only the wider of the two lines, which also means it no longer needs hiding below 480px
  // (round 2, item 4's fix): the hint now fits in every width the grid renders at.
  return (
    <span className="flex h-full flex-col justify-center gap-0.5 tabular-nums leading-none">
      <span className="font-semibold text-pp-blue">{formatDate(hold.release)}</span>
      <span className="text-[11px] text-pp-muted">{relative}</span>
    </span>
  );
}

/** Hold column in the grid: the hold itself always reads as "on hold", one icon everywhere it shows. */
function HoldCell({ value }: CustomCellRendererProps<unknown, string>) {
  const Icon = HOLD_ICON;
  return (
    <span className={`flex h-full items-center ${ICON_GAP}`}>
      <Icon className={`${ICON} text-pp-muted`} strokeWidth={1.5} aria-hidden />
      {value}
    </span>
  );
}

// "next step": AG Grid's autosize (columnAutoSize) sizes this column to its own content with zero
// slack (autoSizePadding is hardcoded to 0, with no exposed option to change it), and a DOM probe
// (round 4) showed the real rendered text comes out a sub-pixel fraction wider than the clone-based
// measurement the autosize itself uses — padding on this span can't fix that (it is part of what
// gets measured too, so it moves the target, not the margin: padding up to pr-32 still left
// 'confirm with buyer' clipped at 1440). globals.css turns off the ellipsis for this one column instead, since a
// column already sized to its content by design has nothing useful left to truncate. A small
// right margin here is just normal breathing room before the next column, not a slack hack.
function NextStepCell({ value }: CustomCellRendererProps<unknown, string>) {
  return <span className="pr-2">{value}</span>;
}

export const gridOverride = {
  id: 'grid' as const,
  options: {
    createCellRenderer: (field: AgWidgetField) => {
      const id = String(field.fieldId);
      if (id.endsWith('creator')) return CreatorCell;
      if (id.endsWith('hold')) return HoldCell;
      if (id.endsWith('nextStep')) return NextStepCell;
      // "paid by": AG Studio's grid widget options expose only localeText, getLocaleText,
      // cacheBlockSize, maxBlocksInCache and createCellRenderer (AgGridWidgetOptions) — no
      // gridOptions passthrough, so AG Grid's own domLayout: 'autoHeight' is not reachable from
      // here. The card's height instead comes from a fixed track span sized to its three rows
      // (data.ts's widgetLayout); see ui-critique.md #2.
      if (id.endsWith('release')) return ReleaseCell;
      return undefined;
    },
  },
};

function EvidenceWidget() {
  const { hold, rows, hasHolds } = useSelected();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult & { holdId?: string; tracked?: boolean }>();
  const [details, setDetails] = useState(false);

  if (!hold)
    return (
      <p className="grid h-full place-items-center p-6 text-center text-sm text-pp-muted">
        {hasHolds ? 'select a payment to see its evidence' : 'no held payments'}
      </p>
    );

  const track = hold.kind === 'physical' && hold.nextStep === 'add tracking';
  const act = async () => {
    setBusy(true);
    setResult({ ...(await runAction(hold.id, track ? 'track' : 'draft')), holdId: hold.id, tracked: track });
    setBusy(false);
  };
  const shown = result?.holdId === hold.id ? result : undefined;
  const ResultIcon = shown?.ok ? SOURCE_ICON[shown.tracked ? 'paypal' : 'gmail'] : undefined;

  return (
    // Keyed by payment: switching payments remounts the timeline, so it fades in row by row in date order.
    <div key={hold.id} className="flex h-full flex-col gap-3 overflow-hidden p-1 text-sm">
      <header className="motion-safe:animate-enter flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold text-pp-navy">
          {hold.creator} · {hold.item}
        </h3>
        <span className="text-pp-muted">next: {hold.nextStep}</span>
      </header>
      {/* flex-1 min-h-0 (round 5): at 1280x720 (run.mjs's grid check viewport) the card's fixed
          24-track height is shorter than the timeline's natural content height. Without flex-1 this
          `<ol>` took only its own content height, so the leftover space ran out inside the card's
          `h-full overflow-hidden` root and silently clipped the action row and the last evidence
          lines below it — no scrollbar, just a hard cut (paypal-challenge peer, round 5, 1280 review).
          flex-1 makes the ol the one element that gives up space, so the header and footer below
          always get their natural height and stay visible; its own overflow-y-auto then scrolls
          whatever timeline content does not fit, instead of the card truncating it. */}
      {/* A fixed 6rem badge column (round 1) left unused space after narrower badges ("gmail",
          "you") and squeezed the text column; even "simulated", the widest, only needs ~5.3rem
          (round 2, item 3). `grid-cols-subgrid` shares one badge-column track across every row,
          sized to the widest badge actually rendered, instead of a guessed rem value. Below `sm`
          there is no room for three columns at all, so each row stacks its badge above its text,
          under the date, via the wrapper's `sm:contents` (round 2, item 3's 390px note). */}
      {/* sm:content-start (paypal-challenge peer, this round): CSS grid's default align-content
          is stretch, so once the ySpan-36 card gave the <ol> more height than the 5-entry timeline
          needed, the implicit auto rows stretched to fill it — rows spread 40-60px apart instead
          of sitting at their natural height, so entries read as scattered rather than one group.
          content-start packs rows at their natural height from the top, leaving the leftover
          space below the last row (still inside the scrollable <ol>) instead of inside each row. */}
      <ol className="min-h-0 flex-1 content-start space-y-2 overflow-y-auto sm:grid sm:grid-cols-[3.5rem_max-content_minmax(0,1fr)] sm:items-baseline sm:gap-x-2 sm:gap-y-1 sm:space-y-0">
        {rows.map((r, i) => {
          const SourceIcon = SOURCE_ICON[r.source];
          return (
            <li
              key={r.id}
              style={{ animationDelay: `${40 * (i + 1)}ms` }}
              className="motion-safe:animate-enter flex items-start gap-x-2 sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-baseline"
            >
              <time className="w-14 shrink-0 tabular-nums text-pp-muted sm:w-auto">{formatDate(r.at)}</time>
              <div className="flex min-w-0 flex-col gap-1 sm:contents">
                <span className={`flex w-fit items-center ${ICON_GAP} rounded border px-1.5 text-xs ${BADGE[r.source]}`}>
                  <SourceIcon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  {r.source}
                </span>
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{r.text}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {shown && (
        <p role="status" className={`motion-safe:animate-enter flex items-center gap-1.5 ${shown.ok ? 'text-pp-success' : 'text-pp-danger'}`}>
          {shown.ok && ResultIcon && (
            <span className={`flex w-fit items-center ${ICON_GAP} rounded border px-1.5 text-xs ${BADGE[shown.tracked ? 'paypal' : 'gmail']}`}>
              <ResultIcon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              {shown.tracked ? 'paypal' : 'gmail'}
            </span>
          )}
          {shown.ok ? (shown.tracked ? 'tracking added to the paypal order' : 'draft saved in gmail, not sent') : shown.error}
        </p>
      )}
      {details && (
        <p className="motion-safe:animate-enter break-all text-xs text-pp-muted">
          order {hold.orderId} · capture {hold.captureId}
        </p>
      )}
      <footer className="mt-auto flex shrink-0 items-center gap-4 overflow-x-auto">
        {/* mt-auto (this round): with content-start packing the <ol> to its natural height, the
            footer would otherwise sit right under the last evidence line for a short timeline;
            mt-auto pushes it back down to the card's bottom edge regardless of how much the
            timeline above it packs down to, so the action row's position doesn't move timeline
            to timeline. shrink-0: paired with the ol's flex-1 above, so the action row keeps its natural height
            instead of being squeezed or clipped when the timeline above it is long (round 5).
            whitespace-nowrap: "add tracking RM482913576GB" (a real Royal Mail tracking number,
            round 5) wraps onto two lines once the button's flex row runs out of width, which the
            evidence-column widen alone doesn't guarantee at every size — the video's slice-zoom
            crop of this button then blurs and stretches a two-line label into a one-line box
            (paypal-challenge peer, round 5, 128.4s). overflow-x-auto on this row is the actual
            fallback (an earlier comment claimed this without the class being there); nowrap is
            what keeps the button itself to one line at every width run.mjs checks. */}
        <button
          onClick={act}
          disabled={busy}
          className={`flex h-11 items-center ${ICON_GAP} whitespace-nowrap rounded-md bg-pp-blue px-4 font-semibold text-white transition-[background-color,opacity] duration-150 hover:bg-pp-blue-dark disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-pp-navy focus-visible:ring-offset-2`}
        >
          {track ? <Truck className={ICON} strokeWidth={1.5} aria-hidden /> : <Mail className={ICON} strokeWidth={1.5} aria-hidden />}
          {busy ? 'working…' : track ? `add tracking ${hold.trackingFound}` : 'create draft reply'}
        </button>
        <button onClick={() => setDetails(!details)} className={`flex h-11 items-center ${ICON_GAP} text-pp-blue underline-offset-2 hover:underline`}>
          {details ? <ChevronUp className={ICON} strokeWidth={1.5} aria-hidden /> : <ChevronDown className={ICON} strokeWidth={1.5} aria-hidden />}
          {details ? 'hide details' : 'details'}
        </button>
      </footer>
    </div>
  );
}

export const evidenceWidget: EvidenceDefinition = {
  id: 'evidence',
  label: 'Evidence',
  icon: { url: '/favicon.ico' },
  dataMapping: {},
  form: (form) => form.createDefaults({ dataMappingItems: [] }),
  comp: EvidenceWidget,
  defaultSize: { width: 420, height: 480 },
  minSize: { width: 280, height: 240 },
  toolbar: [],
  ai: { description: 'Evidence timeline for the one held payment selected in the grid, with its next action.' },
};
