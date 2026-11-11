'use client';

// The whole interface: one AG Studio page (summary, calendar gantt, evidence) and Studio's own
// assistant.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AgStudioAiModule } from 'ag-studio';
import { AgStudio, AgStudioProvider, createWidgets } from 'ag-studio-react';
import type { AgPanelConfig } from 'ag-studio';
import { LogOut, RefreshCw, RotateCcw } from 'lucide-react';
import { buildAi } from './studio/ai';
import { buildStudioData, initialReport } from './studio/data';
import { evidenceWidget, type UnheldRegistry } from './studio/evidence-widget';
import { ganttWidget } from './studio/gantt-widget';
import { BRAND_ICON, SOURCE_ICON_NODES } from './studio/icons';
import { holdsStore, reloadHolds, requestJson, type HoldsData } from './studio/store';
import { summaryWidget } from './studio/summary-widget';
import { agStudioPayPalTheme } from './studio/theme';

const headerButton = 'flex size-11 shrink-0 items-center justify-center rounded-md text-pp-muted transition-colors duration-150 hover:bg-pp-surface hover:text-pp-navy disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-pp-blue';

// Supported Studio locale keys; the assistant remains Studio's own panel.
const localeText = { panelTitleAi: 'ai assistant', aiNewChat: 'new chat', aiNewThreadButton: 'new', aiBackToBottomButton: 'back to bottom', aiMessageInputPlaceholder: 'ask about your holds' };

type Props = { initial: HoldsData; licenseKey?: string; aiModels?: string[] };

// View mode with only the assistant beside the page.
// SAFETY: the types allow only 'filters' in view mode, but ag-studio 3.0 accepts 'ai' at runtime.
const panels = { view: { left: ['ai'], right: [] } } as unknown as AgPanelConfig;

export function Workbench({ initial, licenseKey, aiModels }: Props) {
  const [busy, setBusy] = useState<'refresh' | 'reset'>();
  const [error, setError] = useState<string>();
  const [epoch, setEpoch] = useState(0); // bumped by reset so the assistant starts a new chat
  const refresh = async (reset = false) => {
    if (busy || (reset && !window.confirm('reset the demo? orders and drafts start fresh.')))
      return;
    setBusy(reset ? 'reset' : 'refresh');
    setError(undefined);
    try {
      if (reset) await requestJson('/api/reset', { method: 'POST' });
      await reloadHolds();
      if (reset) setEpoch((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not refresh payments');
    } finally {
      setBusy(undefined);
    }
  };
  useEffect(() => {
    if (!holdsStore.get()) holdsStore.set(initial);
  }, [initial]);
  // Studio owns the markdown renderer. Decorate only recognised source tags with the same
  // source-badge class as the evidence, using SVG nodes rather than untrusted innerHTML.
  useEffect(() => {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const sourceIcon = (nodes: (typeof SOURCE_ICON_NODES)[keyof typeof SOURCE_ICON_NODES]) => {
      const svg = document.createElementNS(SVG_NS, 'svg');
      for (const [attr, value] of Object.entries({
        viewBox: '0 0 24 24',
        width: '14',
        height: '14',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '1.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      }))
        svg.setAttribute(attr, value);
      svg.classList.add('shrink-0');
      for (const [tag, attrs] of nodes) {
        const el = document.createElementNS(SVG_NS, tag);
        for (const [attr, value] of Object.entries(attrs)) el.setAttribute(attr, value);
        svg.appendChild(el);
      }
      return svg;
    };
    const decorate = () => {
      document.querySelectorAll('.ag-studio-ai-panel code').forEach((el) => {
        const text = el.textContent?.trim();
        const nodes = text && SOURCE_ICON_NODES[text as keyof typeof SOURCE_ICON_NODES];
        if (!nodes || el.querySelector('svg')) return;
        el.prepend(sourceIcon(nodes));
        el.className = 'source-badge';
      });
    };
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    decorate();
    return () => observer.disconnect();
  }, []);
  const data = useSyncExternalStore(holdsStore.subscribe, () => holdsStore.get() ?? initial, () => initial);
  useEffect(() => {
    if (!holdsStore.view().selected) holdsStore.select(initial.holds[0]?.id);
  }, [initial]);
  const studioData = useMemo(() => buildStudioData(data), [data]);
  // Studio reads initialState once and renders only in the browser, so the width is known here.
  const initialState = useMemo(() => initialReport(typeof window !== 'undefined' && window.innerWidth < 768), []);
  const ai = useMemo(() => (aiModels?.length ? buildAi(aiModels) : undefined), [aiModels]);
  const widgets = useMemo(() => createWidgets<UnheldRegistry>({ additionalTypes: [evidenceWidget, summaryWidget, ganttWidget] }), []);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-pp-border px-3 sm:gap-3 sm:px-5">
        <div className="flex shrink-0 items-center gap-2">
          <BRAND_ICON className="size-5 text-pp-blue" strokeWidth={1.5} aria-hidden />
          <h1 className="text-lg font-semibold text-pp-navy">unheld</h1>
        </div>
        <span className="min-w-0 flex-1 text-xs text-pp-muted sm:text-sm">sandbox</span>
        <span role="status" className="hidden text-xs tabular-nums text-pp-muted lg:inline">
          {busy ? (busy === 'refresh' ? 'checking payments…' : 'resetting demo…') : (
            <time aria-label="last checked" dateTime={data.asOf}>
              checked {new Date(data.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
            </time>
          )}
        </span>
        <div className="flex items-center">
          <button onClick={() => refresh()} disabled={Boolean(busy)} aria-label="refresh payments" title="refresh payments" className={headerButton}>
            <RefreshCw className={`size-4 ${busy === 'refresh' ? 'motion-safe:animate-spin' : ''}`} strokeWidth={1.5} aria-hidden />
          </button>
          <button onClick={() => refresh(true)} disabled={Boolean(busy)} aria-label="reset demo" title="reset demo" className={headerButton}>
            <RotateCcw className={`size-4 ${busy === 'reset' ? 'motion-safe:animate-spin' : ''}`} strokeWidth={1.5} aria-hidden />
          </button>
          <form method="post" action="/api/exit">
            <button aria-label="sign out" title="sign out" className={headerButton}>
              <LogOut className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </form>
        </div>
      </header>
      {error && <p role="alert" className="shrink-0 border-b border-pp-border bg-pp-surface px-5 py-2 text-sm text-pp-danger">{error}</p>}
      <main className="min-h-0 flex-1">
        <AgStudioProvider key={epoch} licenseKey={licenseKey} modules={ai ? [AgStudioAiModule] : undefined}>
          <AgStudio<UnheldRegistry>
            style={{ height: '100%', width: '100%' }}
            theme={agStudioPayPalTheme}
            data={studioData}
            widgets={widgets}
            ai={ai}
            initialState={initialState}
            mode="view"
            panels={panels}
            localeText={localeText}
          />
        </AgStudioProvider>
      </main>
    </div>
  );
}
