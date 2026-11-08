'use client';

// The calendar gantt (docs/ui-redesign/c-calendar-gantt.png, Don's chosen version C): one row per
// held payment, a round avatar + creator/item/paid-by pinned on the left, and a bar spanning the
// days it has been (or will be) on hold - a diamond where the hold started, a flag where PayPal's
// release estimate falls. A physical hold still waiting on a tracking number (next step "add
// tracking") also shows a shorter dashed pill above its bar: the faster release date if tracking
// were added today (lib/load-holds.ts's withTrackingRelease).
//
// A raw AG Grid (ag-grid-react), not ag-studio's own grid widget: AgGridWidgetOptions (that
// widget's own options type) exposes no gridOptions passthrough at all - no colSpan, no custom
// header component, no getRowHeight - which a gantt needs for its bars and per-day columns.
// Registered as a plain custom widget (comp, dataMapping: {}), exactly like evidence-widget.tsx's
// own widget: it reads holdsStore directly instead of going through ag-studio's data catalog.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type ColSpanParams } from 'ag-grid-community';
import { AgGridReact, type CustomCellRendererProps, type CustomHeaderProps } from 'ag-grid-react';
import type { AgWidgetData, AgWidgetDataFormat } from 'ag-studio';
import type { AgWidgetDefinition } from 'ag-studio-react';
import { Diamond, Flag } from 'lucide-react';
import { day, daysUntil, formatDate, gbp, type Hold } from '@/lib/holds';
import { Avatar } from './avatar';
import { holdsStore, selectSmoothly } from './store';
import { agGridPayPalTheme } from './theme';

ModuleRegistry.registerModules([AllCommunityModule]);

type GanttState = AgWidgetData<Record<string, never>, AgWidgetDataFormat<unknown>> & { type: 'gantt' };
export type GanttDefinition = AgWidgetDefinition<'gantt', GanttState>;

type Row = Hold & {
  selected: boolean;
  startDay: string; // the day column this row's bar starts in (colSpan's anchor)
  span: number; // whole days from startDay to release, inclusive
  releaseLabel: string;
  relativeLabel: string;
  trackingSpan?: number;
  trackingLabel?: string; // "with tracking: 7 Nov"
};

const DAY = 86_400_000;
const dayColId = (iso: string) => `d:${iso}`;

/** Every calendar day from startIso to endIso inclusive, both already whole-day strings. */
function dateRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(startIso); t <= Date.parse(endIso); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Pinned left column: avatar, creator (the row-selection button - only the name, so
 * run.mjs's relativeDays check can still read the creator from `button.textContent` the same way
 * it did before this redesign), item, and the paid-by date with its muted relative hint (the exact
 * shape evidence-widget.tsx's old ReleaseCell used, just relocated: the gantt has no separate
 * "paid by" column once the bar itself shows the release visually).
 */
function CreatorCell({ data: row }: CustomCellRendererProps<Row>) {
  if (!row) return null;
  return (
    <div className="flex h-full w-full items-center gap-3">
      <Avatar creator={row.creator} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <button
          onClick={() => selectSmoothly(row.id)}
          aria-pressed={row.selected}
          title={row.creator}
          className={`truncate text-left font-semibold transition-colors duration-150 ${row.selected ? 'text-pp-blue' : 'text-pp-navy hover:text-pp-blue'}`}
        >
          {row.creator}
        </button>
        {/* Amount only, not "{row.item} \u00b7 {amount}" (00-ui-gantt round N, paypal-challenge
            peer): the item title is already in the detail header below (EvidenceWidget's `<h3>`),
            and at this column's width the combined string truncated to e.g. "Twitch emote set \u00b7
            \u00a36\u2026", hiding the amount entirely - the one fact this line alone needs to add. */}
        <span className="truncate text-xs text-pp-muted">{gbp.format(row.amount)}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right leading-none tabular-nums">
        <span className="text-xs font-semibold text-pp-blue">{row.releaseLabel}</span>
        <span className="text-[11px] text-pp-muted">{row.relativeLabel}</span>
      </div>
    </div>
  );
}

/**
 * One day column's cell. Only the row's own start-day column ever renders content (its colSpan
 * covers the rest of the bar, see colDefs below): a diamond where the hold started, the next-step
 * label, a flag at the release date. `data-testid`s so run.mjs can check the feature is present
 * without depending on exact styling (00-ui-gantt).
 *
 * The label (gantt-bar-label) measures its own overflow (scrollWidth vs. clientWidth) instead of
 * just truncating: Tom's "wait for delivery" bar is only 1 day wide, so the label never fits inside
 * it at any column width run.mjs checks, and `truncate`'s ellipsis alone read as "wait for de\u2026"
 * (00-ui-gantt round N, paypal-challenge peer). When it overflows, the inside label goes invisible
 * (kept in the layout, not removed, so the ResizeObserver below keeps measuring it if the column
 * later widens) and the same text reappears outside the bar, after the flag, in the day columns the
 * colSpan already leaves empty for this row - gantt-bar-cell's own overflow: visible (globals.css)
 * is what lets that second span actually render past its cell's nominal edge instead of clipping.
 */
function BarCell({ data: row, iso }: CustomCellRendererProps<Row> & { iso: string }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [row?.nextStep]);
  if (!row || row.startDay !== iso) return null;
  return (
    <div className="relative flex h-full flex-col justify-center gap-1 py-1.5">
      {row.trackingLabel && row.trackingSpan && (
        <span
          data-testid="gantt-tracking-bar"
          style={{ width: `${(row.trackingSpan / row.span) * 100}%`, minWidth: 'fit-content' }}
          className="flex h-5 items-center whitespace-nowrap rounded-full border border-dashed border-pp-blue bg-pp-surface px-2 text-[11px] font-medium text-pp-blue"
        >
          {row.trackingLabel}
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <span data-testid="gantt-bar" className="flex h-7 w-full shrink-0 items-center gap-1.5 rounded-full bg-pp-highlight px-2 text-xs font-medium text-pp-navy">
          <Diamond className="size-3.5 shrink-0 fill-pp-blue text-pp-blue" strokeWidth={1.5} aria-hidden />
          <span ref={labelRef} data-testid="gantt-bar-label" className={`truncate ${overflow ? 'invisible' : ''}`}>
            {row.nextStep}
          </span>
          <Flag className="ml-auto size-3.5 shrink-0 fill-pp-success text-pp-success" strokeWidth={1.5} aria-hidden />
        </span>
        {overflow && (
          <span data-testid="gantt-bar-label-outside" className="shrink-0 whitespace-nowrap text-xs font-medium text-pp-navy">
            {row.nextStep}
          </span>
        )}
      </div>
    </div>
  );
}

/** Day header: day number, short month, and a "today" pill under the current date's column.
    The pill is text-[7px]/px-1 (not the 9px/px-1.5 a normal badge would use) and the colDef below
    gives these headers their own `gantt-day-header` class (globals.css overrides AG Grid's own
    8px header-cell padding to 2px) - without both, "today" measured wider than the day columns'
    ag-header-cell (which clips its own overflow), so it rendered clipped to "toda" at every width
    run.mjs checks (00-ui-gantt round N, paypal-challenge peer). */
function DayHeader({ iso, isToday }: CustomHeaderProps<Row> & { iso: string; isToday: boolean }) {
  const d = new Date(iso);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-0.5 py-1 text-center leading-none">
      <span className={`text-xs font-semibold ${isToday ? 'text-pp-blue' : 'text-pp-ink'}`}>{d.getUTCDate()}</span>
      <span className="text-[10px] text-pp-muted">{d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>
      {isToday && <span className="mt-0.5 whitespace-nowrap rounded-full bg-pp-blue px-1 text-[7px] font-semibold tracking-tighter text-white">today</span>}
    </div>
  );
}

/** Phone width: "days-left only" (00-ui-gantt) - the full calendar has no room to read at 390px,
    so each row collapses to its avatar, name and the same relative hint the wide bar's paid-by
    column shows, in one line. */
function DaysLeftList({ rows }: { rows: Row[] }) {
  return (
    <ul className="flex h-full flex-col divide-y divide-pp-gridline overflow-y-auto">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            onClick={() => selectSmoothly(row.id)}
            aria-pressed={row.selected}
            className={`flex h-14 w-full items-center gap-3 px-1 text-left transition-colors duration-150 ${row.selected ? 'text-pp-blue' : 'hover:text-pp-blue'}`}
          >
            <Avatar creator={row.creator} size="size-8" />
            <span className={`min-w-0 flex-1 truncate font-semibold ${row.selected ? '' : 'text-pp-navy'}`}>{row.creator}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-pp-muted">{row.relativeLabel}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Same narrow breakpoint workbench.tsx uses for ag-studio's own layout, so the gantt switches to
    the days-left list at the same width the page as a whole switches to its stacked layout. */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}

const CREATOR_COL_WIDTH = 260;
const MIN_DAY_COL_WIDTH = 24;

function GanttWidget() {
  const { data, selected } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const narrow = useNarrow();
  const hasHolds = Boolean(data?.holds.length);
  // AG Grid's `flex: 1` + sizeColumnsToFit() (tried first) never reliably narrowed the day columns
  // to the card's actual available width once the ai panel took its own 300px (run.mjs's
  // gridFits1280 kept showing cells past the grid's own right edge, even forcing the recompute on
  // both grid-ready and container resize). Measuring the wrapper directly and setting each day
  // column's width in px removes that race entirely: the sum of day-column widths can never exceed
  // what was just measured, because nothing but this effect decides it.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperWidth, setWrapperWidth] = useState(0);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWrapperWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [narrow, hasHolds]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    return data.holds.map((h) => {
      const startDay = day(h.heldSince);
      const endDay = day(h.release);
      const relDays = daysUntil(h.release, data.asOf);
      const trackingEndDay = h.withTrackingRelease ? day(h.withTrackingRelease) : undefined;
      return {
        ...h,
        selected: h.id === selected,
        startDay,
        span: daysUntil(endDay, startDay) + 1,
        releaseLabel: formatDate(h.release),
        relativeLabel: relDays <= 0 ? 'today' : relDays === 1 ? 'tomorrow' : `in ${relDays} days`,
        trackingSpan: trackingEndDay ? daysUntil(trackingEndDay, startDay) + 1 : undefined,
        trackingLabel: h.withTrackingRelease ? `with tracking: ${formatDate(h.withTrackingRelease)}` : undefined,
      };
    });
  }, [data, selected]);

  const todayIso = data ? day(data.asOf) : undefined;
  const columns = useMemo(() => {
    if (!rows.length) return [];
    const minDay = rows.map((r) => r.startDay).reduce((a, b) => (a < b ? a : b));
    const maxDay = rows.map((r) => day(r.release)).reduce((a, b) => (a > b ? a : b));
    return dateRange(minDay, maxDay);
  }, [rows]);

  // Floors at MIN_DAY_COL_WIDTH rather than shrinking further: a day this narrow still only needs to
  // show its number (DayHeader) or sit inside a multi-day bar (BarCell's own label fits the full
  // span's width, not one day's), so there is no narrower-still content to make room for.
  const dayColWidth = columns.length ? Math.max(MIN_DAY_COL_WIDTH, Math.floor((wrapperWidth - CREATOR_COL_WIDTH) / columns.length)) : MIN_DAY_COL_WIDTH;

  const colDefs: ColDef<Row>[] = useMemo(() => {
    const creatorCol: ColDef<Row> = {
      colId: 'creator',
      headerName: '',
      pinned: 'left',
      width: CREATOR_COL_WIDTH,
      resizable: false,
      sortable: false,
      cellRenderer: CreatorCell,
    };
    const dayCols: ColDef<Row>[] = columns.map((iso) => ({
      colId: dayColId(iso),
      headerComponent: DayHeader,
      headerComponentParams: { iso, isToday: iso === todayIso },
      width: dayColWidth,
      // AG Grid's own default minWidth is wider than this gantt's day columns ever need to be: with
      // none set, setColumnWidths below silently capped every width request at that default instead
      // of applying dayColWidth, which is exactly what left day columns past the grid's own right
      // edge at 1280px (round 9's gridFits1280 cellsOnScreen failure).
      minWidth: MIN_DAY_COL_WIDTH,
      resizable: false,
      sortable: false,
      // DayHeader's own comment: frees the column's full width for the custom header instead of
      // AG Grid's default 8px/side header padding.
      headerClass: 'gantt-day-header',
      // gantt-bar-cell: overflow: visible (globals.css), so BarCell's outside label can render past
      // this cell's own nominal width into the empty day columns the colSpan leaves beside it.
      cellClass: iso === todayIso ? 'bg-pp-highlight/60 gantt-bar-cell' : 'gantt-bar-cell',
      colSpan: (params: ColSpanParams<Row>) => (params.data?.startDay === iso ? params.data.span : 1),
      cellRenderer: BarCell,
      cellRendererParams: { iso },
    }));
    return [creatorCol, ...dayCols];
  }, [columns, todayIso, dayColWidth]);

  if (!data?.holds.length) return <p className="grid h-full place-items-center text-sm text-pp-muted">no held payments</p>;
  if (narrow) return <DaysLeftList rows={rows} />;

  return (
    // No h-full (00-ui-gantt round N, paypal-challenge peer): domLayout="autoHeight" below sizes the
    // grid itself to its header plus rows, not to whatever height data.ts's track grid hands this
    // widget - h-full would just force that same fixed height straight back onto the wrapper and
    // reopen the empty strip autoHeight exists to close. data.ts's gantt ySpan is tuned to this
    // natural height for Tom's taller (76px) pre-tracking row, the tallest state the grid renders;
    // the shorter post-tracking state (52px, see workbench-tracked.png) leaves a little more of that
    // strip rather than ever clipping a row.
    <div ref={wrapperRef} className="w-full overflow-hidden">
      {wrapperWidth > 0 && (
        <AgGridReact<Row>
          theme={agGridPayPalTheme}
          rowData={rows}
          columnDefs={colDefs}
          getRowId={(p) => p.data.id}
          getRowHeight={(p) => (p.data?.trackingLabel ? 76 : 52)}
          headerHeight={44}
          domLayout="autoHeight"
          suppressCellFocus
          suppressMovableColumns
        />
      )}
    </div>
  );
}

export const ganttWidget: GanttDefinition = {
  id: 'gantt',
  label: 'Gantt',
  icon: { url: '/favicon.ico' },
  dataMapping: {},
  form: (form) => form.createDefaults({ dataMappingItems: [] }),
  comp: GanttWidget,
  defaultSize: { width: 900, height: 420 },
  minSize: { width: 360, height: 240 },
  toolbar: [],
  ai: { description: 'Calendar gantt of held payments: each bar runs from when a payment was held to its estimated release date.' },
};
