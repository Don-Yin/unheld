'use client';

// The whole interface: one AG Studio page (held-payments grid + evidence widget) and Studio's own
// assistant. No sidebar, no chat panel of our own.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AgStudioAiModule } from 'ag-studio';
import { AgStudio, AgStudioProvider, createWidgets } from 'ag-studio-react';
import type { AgPanelConfig } from 'ag-studio';
import { RotateCcw } from 'lucide-react';
import { buildAi } from './studio/ai';
import { buildStudioData, initialReport } from './studio/data';
import { evidenceWidget, gridOverride, ICON_GAP, type UnheldRegistry } from './studio/evidence-widget';
import { BRAND_ICON, SOURCE_ICON_NODES } from './studio/icons';
import { holdsStore, reloadHolds, type HoldsData } from './studio/store';
import { summaryWidget } from './studio/summary-widget';
import { agStudioPayPalTheme } from './studio/theme';

// Quiet reset for judges testing one after another: a new sandbox state (fresh PayPal orders,
// the Gmail drafts unheld itself created deleted - app/api/reset, lib/demo-reset.ts), behind the
// same access-code gate as the rest of the page. Icon only, no label, so it reads as housekeeping
// rather than a feature to try.
function ResetButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const click = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'reset failed');
      await reloadHolds();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={click}
      disabled={busy}
      aria-label="reset demo"
      title={error ?? 'reset demo'}
      // size-11 (44px): the icon itself stays size-4, but the hit area meets the 44px touch-target
      // minimum (frontend-design-convention) - size-8 (32px) was too small (paypal-challenge peer review).
      className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-md text-pp-muted transition-colors duration-150 hover:bg-pp-surface hover:text-pp-navy disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-pp-blue"
    >
      <RotateCcw className={`size-4 shrink-0 ${busy ? 'motion-safe:animate-spin' : ''}`} strokeWidth={1.5} aria-hidden />
    </button>
  );
}

// Studio's own copy, lowercased per frontend-design-convention (ui-critique.md #7); every other
// AgStudioLocaleText key keeps its English default.
const localeText = { panelTitleAi: 'ai assistant', aiNewChat: 'new chat', aiMessageInputPlaceholder: 'ask about your holds' };

type Props = { initial: HoldsData; licenseKey?: string; aiModels?: string[] };

// View mode with only the assistant beside the page.
// SAFETY: the types allow only 'filters' in view mode, but ag-studio 3.0's PanelService.updatePanels
// reads panels[mode] as given and gates 'ai' only on the `ai` prop; run.mjs checks the panel answers.
const panels = { view: { left: ['ai'], right: [] } } as unknown as AgPanelConfig;

export function Workbench({ initial, licenseKey, aiModels }: Props) {
  useEffect(() => {
    if (!holdsStore.get()) holdsStore.set(initial);
  }, [initial]);
  // The AI panel's markdown is rendered by ag-studio's own harness, outside this component tree, so
  // its per-fact `source` code tags (ai.ts's INSTRUCTIONS) are turned into the evidence timeline's
  // own badge by decorating the DOM after each render instead of a React component: same classes
  // (evidence-widget.tsx's BADGE/ICON_GAP, so font, padding and border are the exact same values,
  // not a separately maintained copy), same icon shapes (icons.ts's SOURCE_ICON_NODES mirrors
  // SOURCE_ICON). A first attempt added only the icon and left the tag as a monospace code chip
  // (ui-critique.md #9 was marked done on the icon alone; round 2 found the font/padding/border
  // still didn't match). Built with createElementNS, not innerHTML, since this runs on live markdown.
  //
  // The box model and colours come from one `.ag-studio-rich-text code.unheld-badge` CSS rule
  // (globals.css), which out-specifies the renderer's own unlayered `.ag-studio-rich-text code`
  // rule by selector alone (two classes vs. one), so no inline `!important` or runtime style probe
  // is needed here (round 3 review's finding: those were a workaround, not a fix). `data-badge-source`
  // picks that rule's colour variant, from the same `Source` keys as evidence-widget.tsx's BADGE.
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
        // Exactly evidence-widget.tsx's badge shape (`<span className="flex w-fit items-center
        // ... rounded border px-1.5 text-xs ...">`), overriding the markdown renderer's own
        // monospace `<code>` look via the `unheld-badge` CSS rule, not sitting beside it.
        el.className = `unheld-badge not-prose inline-flex w-fit items-center ${ICON_GAP} align-middle`;
        (el as HTMLElement).dataset.badgeSource = text;
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
  const widgets = useMemo(() => createWidgets<UnheldRegistry>({
        additionalTypes: [evidenceWidget, summaryWidget],
        // ag-studio 3.0's ExtractOverride does not distribute over a registry with a custom widget,
        // so any override types as `never`; the runtime accepts it (the boilerplate pattern).
        overrides: [gridOverride as never],
      }), []);

  return (
    <div className="flex h-dvh flex-col">
      {/* Same 20px inset as theme.ts's studioCanvasPadding, so the header's left edge lines up
          with the grid/evidence cards' left edge (ui-critique.md #3). */}
      <header className="flex items-center gap-3 px-5 pt-5">
        <BRAND_ICON className="size-5 shrink-0 text-pp-blue" strokeWidth={1.5} aria-hidden />
        <h1 className="text-lg font-semibold text-pp-navy">unheld</h1>
        <span className="text-sm text-pp-muted">sandbox · holds simulated</span>
        <ResetButton />
      </header>
      <main className="min-h-0 flex-1">
        <AgStudioProvider licenseKey={licenseKey} modules={ai ? [AgStudioAiModule] : undefined}>
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
