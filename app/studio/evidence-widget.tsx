'use client';

// One payment, its source-labelled evidence, and only the action its next step needs.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, LoaderCircle, Mail, Truck } from 'lucide-react';
import type { AgDefaultWidgetDefinition, AgWidgetData, AgWidgetDataFormat } from 'ag-studio';
import type { AgRegistry, AgWidgetDefinition } from 'ag-studio-react';
import { formatDate, gbp, type Evidence, type Hold } from '@/lib/holds';
import { Avatar } from './avatar';
import type { GanttDefinition } from './gantt-widget';
import { HOLD_ICON, SOURCE_ICON } from './icons';
import { holdsStore, runAction } from './store';
import type { SummaryDefinition } from './summary-widget';

type EvidenceState = AgWidgetData<Record<string, never>, AgWidgetDataFormat<unknown>> & { type: 'evidence' };
type EvidenceDefinition = AgWidgetDefinition<'evidence', EvidenceState>;
export interface UnheldRegistry extends AgRegistry {
  widgets: readonly (AgDefaultWidgetDefinition | EvidenceDefinition | SummaryDefinition | GanttDefinition)[];
}

const primaryAction = 'flex min-h-11 items-center justify-center gap-2 rounded-md bg-pp-blue px-4 py-2 text-left font-medium text-white transition-colors duration-150 hover:bg-pp-blue-dark disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-navy';
const icon = 'size-4 shrink-0';

function PaymentEvidence({ hold, rows }: { hold: Hold; rows: Evidence[] }) {
  const { actions } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const state = actions[hold.id];
  const result = state?.result;
  const [details, setDetails] = useState(false);
  const timeline = useRef<HTMLOListElement>(null);
  // Below a draft the opened evidence starts out of view; bring it in.
  useEffect(() => {
    if (details && hold.draft) timeline.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [details, hold.draft]);
  const track = hold.nextStep === 'add tracking';
  const needsDraft = hold.nextStep === 'confirm with buyer' && !hold.draft;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-1 text-sm">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar creator={hold.creator} size="size-12" />
          <div className="min-w-0">
            <h3 className="break-words font-semibold text-pp-navy">{hold.creator} · {hold.item}</h3>
            <p className="flex items-center gap-2 tabular-nums text-pp-muted">
              <HOLD_ICON className={icon} strokeWidth={1.5} aria-hidden />
              {gbp.format(hold.amount)} held
            </p>
          </div>
        </div>
        <span className="text-pp-muted">next: {hold.nextStep}</span>
      </header>
      {/* Only the evidence/preview area scrolls; the selected payment and its action stay reachable. */}
      <section data-testid="payment-content" aria-label="payment evidence" className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {hold.draft && (
          <div data-testid="draft-preview" className="space-y-1 rounded-md border border-pp-border bg-pp-canvas p-2">
            <p role="status" className="font-medium text-pp-navy">draft saved in gmail, not sent</p>
            <p className="break-words text-xs text-pp-muted">to {hold.draft.to} · {hold.draft.subject}</p>
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{hold.draft.body}</p>
          </div>
        )}
        {(!hold.draft || details) && <ol ref={timeline} data-testid="evidence-timeline" className="space-y-3 sm:grid sm:grid-cols-[3.5rem_max-content_minmax(0,1fr)] sm:items-baseline sm:gap-x-3 sm:gap-y-2 sm:space-y-0">
          {rows.map((row) => {
            const SourceIcon = SOURCE_ICON[row.source];
            return (
              <li key={row.id} className="flex items-start gap-2 sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-baseline">
                <time className="w-14 shrink-0 tabular-nums text-pp-muted sm:w-auto">{formatDate(row.at)}</time>
                <div className="flex min-w-0 flex-col gap-1 sm:contents">
                  <span data-source={row.source} className="source-badge">
                    <SourceIcon className={icon} strokeWidth={1.5} aria-hidden />{row.source}
                  </span>
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{row.text}</span>
                </div>
              </li>
            );
          })}
        </ol>}
        {details && (
          <div id={`payment-details-${hold.id}`} className="space-y-2 text-xs text-pp-muted">
            <p className="break-all">order {hold.orderId} · capture {hold.captureId}</p>
            <p>holds are simulated; dates are estimates.</p>
          </div>
        )}
      </section>
      {result?.ok && state?.action === 'track' && <p role="status" className="shrink-0 text-pp-success">tracking added</p>}
      {result?.error && <p role="alert" className="shrink-0 text-pp-danger">{result.error}</p>}
      {result?.refreshError && <p role="alert" className="shrink-0 text-pp-warning">{result.refreshError}</p>}
      <footer className="mt-auto flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {(track || needsDraft) && (
          // While busy only the icon becomes a spinner, so the button keeps its size.
          <button onClick={() => runAction(hold.id, track ? 'track' : 'draft')} disabled={state?.busy || result?.uncertain} aria-busy={state?.busy} className={primaryAction}>
            {state?.busy ? <LoaderCircle className={`${icon} motion-safe:animate-spin`} strokeWidth={1.5} aria-hidden />
              : track ? <Truck className={icon} strokeWidth={1.5} aria-hidden /> : <Mail className={icon} strokeWidth={1.5} aria-hidden />}
            {track ? `add tracking ${hold.trackingFound}` : 'create draft reply'}
          </button>
        )}
        {hold.nextStep === 'mark complete' && (
          <a href={`https://www.sandbox.paypal.com/activity/payment/${encodeURIComponent(hold.captureId)}`} target="_blank" rel="noreferrer" className={primaryAction}>
            <ExternalLink className={icon} strokeWidth={1.5} aria-hidden />open paypal sandbox
          </a>
        )}
        {hold.draft && (
          <a href={hold.draft.url} target="_blank" rel="noreferrer" className={primaryAction}>
            <ExternalLink className={icon} strokeWidth={1.5} aria-hidden />review in gmail
          </a>
        )}
        <button onClick={() => setDetails(!details)} aria-expanded={details} aria-controls={`payment-details-${hold.id}`} className="flex min-h-11 items-center gap-2 text-pp-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-pp-blue">
          {details ? <ChevronUp className={icon} strokeWidth={1.5} aria-hidden /> : <ChevronDown className={icon} strokeWidth={1.5} aria-hidden />}
          {details ? 'hide details' : 'details'}
        </button>
      </footer>
    </div>
  );
}

function EvidenceWidget() {
  const { data, selected } = useSyncExternalStore(holdsStore.subscribe, holdsStore.view, holdsStore.view);
  const hold = data?.holds.find((h) => h.id === selected);
  if (!hold) return <p className="grid h-full place-items-center p-6 text-center text-sm text-pp-muted">{data?.holds.length ? 'select a payment' : 'no held payments'}</p>;
  // The server orders same-day sources. Keep its order, and reset only local disclosure/scroll state.
  return <PaymentEvidence key={hold.id} hold={hold} rows={(data?.evidence ?? []).filter((row) => row.holdId === hold.id)} />;
}

export const evidenceWidget: EvidenceDefinition = {
  id: 'evidence', label: 'evidence', icon: { url: '/favicon.ico' }, dataMapping: {},
  form: (form) => form.createDefaults({ dataMappingItems: [] }), comp: EvidenceWidget,
  defaultSize: { width: 420, height: 480 }, minSize: { width: 280, height: 240 }, toolbar: [],
  ai: { description: 'Evidence and next action for the selected held payment. Draft replies are never sent.' },
};
