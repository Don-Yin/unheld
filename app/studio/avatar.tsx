// Round creator avatars (docs/ui-redesign/c-calendar-gantt.png): one home for both the gantt's
// pinned creator column and the evidence/event-list card's header, which show the same avatar for
// the same creator (gantt-widget.tsx, evidence-widget.tsx). Cropped from
// docs/video/unheld-demo/assets/gen-maya-cut.png and gen-tom-priya.png into public/avatars/ (see
// that folder's crop note) \u2014 the only three creators data/holds.json ever seeds, so a plain
// name lookup is simpler than threading an avatar field through every layer for one fixture file.
import { User } from 'lucide-react';

const AVATAR_SRC: Record<string, string> = {
  'Maya Chen': '/avatars/maya.png',
  'Tom Okafor': '/avatars/tom.png',
  'Priya Nair': '/avatars/priya.png',
};

export const avatarSrc = (creator: string) => AVATAR_SRC[creator];

/** data-testid="creator-avatar": run.mjs's ganttAvatarsPresent check counts these, not the styling. */
export function Avatar({ creator, size = 'size-10' }: { creator: string; size?: string }) {
  const src = avatarSrc(creator);
  return (
    <span data-testid="creator-avatar" className={`${size} shrink-0 overflow-hidden rounded-full bg-pp-highlight`}>
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-pp-muted">
          <User className="size-4" strokeWidth={1.5} aria-hidden />
        </span>
      )}
    </span>
  );
}
