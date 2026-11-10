'use client';

// Calendar gantt: one row per held payment, a bar from the hold start (diamond) to the estimated
// release (flag). A physical hold still waiting on tracking also shows a dashed pill with the
// earlier release it would get if tracking were added today.
//
// A raw AG Grid rather than ag-studio's grid widget, which has no colSpan, custom header or
// getRowHeight. Registered as a plain custom widget that reads holdsStore directly.

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
  startDay: string; // the day column the bar starts in (colSpan anchor)
  span: number; // days from startDay to release, inclusive
  releaseLabel: string;
  relativeLabel: string;
  trackingSpan?: number;
  trackingLabel?: string;
};

const DAY = 86_400_000;
const CREATOR_COL_WIDTH = 260;
const MIN_DAY_COL_WIDTH = 24;
const dayColId = (iso: string) => `d:${iso}`;

function dateRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(startIso); t <= Date.parse(endIso); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Pinned column: avatar, creator (the selection button), amount, paid-by date. */
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
        {/* Amount only: the item title would truncate it away at this width. */}
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
 * Only the row's start-day cell renders (its colSpan covers the bar). When the next-step label
 * does not fit inside the bar, it is hidden there and shown after the flag instead; the hidden
 * copy stays in the layout so the ResizeObserver can tell when it fits again.
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

/** Day number, month and a "today" pill, sized to fit the narrowest day column. */
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

/** Phone width: one line per payment with the days left. */
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

/** Same 768px breakpoint as the workbench layout. */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}

function GanttWidget() {
  const { data, selected } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const narrow = useNarrow();
  const hasHolds = Boolean(data?.holds.length);
  // Day columns get explicit pixel widths from the measured wrapper: AG Grid's flex sizing
  // overflowed the card once the assistant panel took its width.
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
      const relDays = daysUntil(h.release, data.asOf);
      const trackingEndDay = h.withTrackingRelease ? day(h.withTrackingRelease) : undefined;
      return {
        ...h,
        selected: h.id === selected,
        startDay,
        span: daysUntil(day(h.release), startDay) + 1,
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
      minWidth: MIN_DAY_COL_WIDTH, // AG Grid's default minWidth would cap dayColWidth
      resizable: false,
      sortable: false,
      headerClass: 'gantt-day-header', // tighter header padding (globals.css)
      // gantt-bar-cell has overflow: visible so the outside label can extend past the cell.
      cellClass: iso === todayIso ? 'bg-pp-highlight/60 gantt-bar-cell' : 'gantt-bar-cell',
      colSpan: (params: ColSpanParams<Row>) => (params.data?.startDay === iso ? params.data.span : 1),
      cellRenderer: BarCell,
      cellRendererParams: { iso },
    }));
    return [creatorCol, ...dayCols];
  }, [columns, todayIso, dayColWidth]);

  if (!data?.holds.length) return <p className="grid h-full place-items-center text-sm text-pp-muted">no held payments</p>;
  if (narrow) return <DaysLeftList rows={rows} />;

  // No h-full: domLayout="autoHeight" sizes the grid to its rows.
  return (
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
