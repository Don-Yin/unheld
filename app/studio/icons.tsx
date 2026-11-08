// Single source of truth for every icon unheld shows, so the demo video can match them.
// One line set, 14-16px, stroke 1.5, text-role colour; see frontend-design-convention.
// Don picked two original icons (docs/video/unheld-demo/assets/unheld-mark.svg, .../on-hold.svg).
// public/brand-mark.svg is a symlink to unheld-mark.svg, never a copy: it's original multi-colour
// artwork (its own fixed fill/stroke colours), not a recolourable single-tone line icon, so it stays
// a plain <img> via `mark()` below. on-hold.svg (00-ui-gantt round N, paypal-challenge peer) is the
// opposite case: a lucide-style line icon (24px viewBox, stroke 1.5, currentColor, no fill) that must
// actually take the surrounding text's colour the way every other icon here does - an <img> can never
// resolve `currentColor` against the host page (it renders in its own opaque document), so HOLD_ICON
// is drawn inline as a real component instead. docs/video/unheld-demo/assets/on-hold.svg holds the
// identical markup as a standalone file for the video to render with its own fixed colour; edit both
// together so the app and the video keep drawing the same mark.

import { CalendarClock, FlaskConical, Mail, User, Wallet, type LucideIcon } from 'lucide-react';
import type { Source } from '@/lib/holds';

// A plain <img>, not a lucide component: this mark is original multi-colour artwork (its own
// fixed fill/stroke colours), not a recolourable single-tone line icon, so `strokeWidth` (every
// call site passes it, matching the lucide icons around it) is accepted and ignored.
type MarkProps = { className?: string; strokeWidth?: number; 'aria-hidden'?: boolean };
function mark(src: string) {
  return function Mark({ className, 'aria-hidden': ariaHidden = true }: MarkProps) {
    return <img src={src} alt="" className={className} aria-hidden={ariaHidden} />;
  };
}

// Evidence source -> icon, shown before the source badge's label in the timeline and in the
// assistant's answers (its inline `source` code tags render through the same names below).
export const SOURCE_ICON: Record<Source, LucideIcon> = {
  paypal: Wallet,
  gmail: Mail,
  you: User,
  estimate: CalendarClock,
  simulated: FlaskConical,
};

// The hold itself: every place a payment is shown as "on hold" (the gantt's bars, the evidence
// timeline's "hold placed" row) uses this one icon, not a source badge. A pound sign inside a ring
// of short ticks (a clock face standing for the wait, 00-ui-gantt round N replacing an hourglass that
// read as a generic "loading" spinner rather than the specific held-payment amount) - the same shape
// as docs/video/unheld-demo/assets/on-hold.svg, kept in sync by hand since an <img> can't pick up
// `currentColor` the way this inline version does (see the file header comment).
function HoldIcon({ className, strokeWidth = 1.5, 'aria-hidden': ariaHidden = true }: MarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      {/* Ring of 8 short ticks, lucide's own Loader spokes shortened (radius 8-10 instead of 6-10) so
          they read as a clock face rather than a loading spinner. */}
      <path d="M12 2v2" />
      <path d="m17.7 6.3 1.4-1.4" />
      <path d="M20 12h2" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M12 20v2" />
      <path d="m6.3 17.7-1.4 1.4" />
      <path d="M4 12H2" />
      <path d="m6.3 6.3-1.4-1.4" />
      {/* lucide's own pound-sterling glyph, scaled to ~0.83x and recentred inside the ring;
          non-scaling-stroke keeps its stroke the same visual weight as the ticks above despite the
          scale transform. */}
      <g transform="translate(2.3 0.9) scale(0.8333)">
        <path d="M17 18a2 2 0 01-2 2H5a3 3 0 003-3V8a4 4 0 018 0" vectorEffect="non-scaling-stroke" />
        <path d="M6 12h7" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
export const HOLD_ICON = HoldIcon;

// Brand mark: header and favicon (app/icon.tsx reads the same unheld-mark.svg at request time).
export const BRAND_ICON = mark('/brand-mark.svg');

// The assistant's reply markdown is rendered by ag-studio's own harness, outside React's tree, so
// its `source` code tags (ai.ts's INSTRUCTIONS) get an icon by DOM decoration instead of a
// component; these mirror SOURCE_ICON's shapes for that one case (built with createElementNS in
// workbench.tsx, never innerHTML, since this runs on live markdown).
export const SOURCE_ICON_NODES: Record<Source, readonly [tag: string, attrs: Record<string, string>][]> = {
  paypal: [
    ['path', { d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1' }],
    ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }],
  ],
  gmail: [
    ['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' }],
    ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }],
  ],
  you: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '12', cy: '7', r: '4' }],
  ],
  estimate: [
    ['path', { d: 'M16 14v2.2l1.6 1' }],
    ['path', { d: 'M16 2v3' }],
    ['path', { d: 'M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338' }],
    ['path', { d: 'M3 9h5.859' }],
    ['path', { d: 'M8 2v3' }],
    ['circle', { cx: '16', cy: '16', r: '6' }],
  ],
  simulated: [
    ['path', { d: 'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2' }],
    ['path', { d: 'M6.453 15h11.094' }],
    ['path', { d: 'M8.5 2h7' }],
  ],
};
