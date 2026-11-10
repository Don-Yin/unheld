// Every icon unheld shows: one line set, 14-16px, stroke 1.5, text colour. The brand mark is
// multi-colour artwork, so it stays an <img>; the hold icon is inline so it takes currentColor
// (public/on-hold.svg holds the same shape).

import { CalendarClock, FlaskConical, Mail, User, Wallet, type LucideIcon } from 'lucide-react';
import type { Source } from '@/lib/holds';

// strokeWidth is accepted for call-site parity with lucide and ignored.
type MarkProps = { className?: string; strokeWidth?: number; 'aria-hidden'?: boolean };
function mark(src: string) {
  return function Mark({ className, 'aria-hidden': ariaHidden = true }: MarkProps) {
    return <img src={src} alt="" className={className} aria-hidden={ariaHidden} />;
  };
}

// Evidence source -> icon, in the timeline and the assistant's answers.
export const SOURCE_ICON: Record<Source, LucideIcon> = {
  paypal: Wallet,
  gmail: Mail,
  you: User,
  estimate: CalendarClock,
  simulated: FlaskConical,
};

// "On hold": a pound sign inside a ring of clock ticks.
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
      {/* Lucide's Loader spokes, shortened so they read as a clock face. */}
      <path d="M12 2v2" />
      <path d="m17.7 6.3 1.4-1.4" />
      <path d="M20 12h2" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M12 20v2" />
      <path d="m6.3 17.7-1.4 1.4" />
      <path d="M4 12H2" />
      <path d="m6.3 6.3-1.4-1.4" />
      {/* Lucide's pound sign, scaled into the ring at the same stroke weight. */}
      <g transform="translate(2.3 0.9) scale(0.8333)">
        <path d="M17 18a2 2 0 01-2 2H5a3 3 0 003-3V8a4 4 0 018 0" vectorEffect="non-scaling-stroke" />
        <path d="M6 12h7" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
export const HOLD_ICON = HoldIcon;

// Brand mark: header and favicon.
export const BRAND_ICON = mark('/brand-mark.svg');

// SOURCE_ICON as SVG nodes, for the assistant's markdown, which renders outside React.
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
