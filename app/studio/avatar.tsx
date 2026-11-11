// Round creator avatars for the gantt and the evidence header, looked up by the three demo names.
import { User } from 'lucide-react';

const AVATAR_SRC: Record<string, string> = {
  'Maya Chen': '/avatars/maya.png',
  'Tom Okafor': '/avatars/tom.png',
  'Priya Nair': '/avatars/priya.png',
};

export const avatarSrc = (creator: string) => AVATAR_SRC[creator];

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
