import { LogIn } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'enter' };

export default async function Enter({ searchParams }: { searchParams: Promise<{ wrong?: string }> }) {
  const { wrong } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form method="post" action="/api/enter" className="flex w-full max-w-xs flex-col gap-3">
        <h1 className="text-lg font-semibold text-pp-navy">unheld</h1>
        <label htmlFor="code" className="text-sm text-pp-muted">
          access code (in the devpost submission)
        </label>
        <input
          id="code"
          name="code"
          type="password"
          autoFocus
          required
          aria-invalid={Boolean(wrong)}
          className="h-11 rounded-md border border-pp-border bg-pp-surface px-3 outline-none focus-visible:ring-2 focus-visible:ring-pp-blue"
        />
        {wrong && <p className="text-sm text-pp-danger">that code is not right</p>}
        <button className="flex h-11 items-center justify-center gap-1.5 rounded-md bg-pp-blue font-semibold text-white focus-visible:ring-2 focus-visible:ring-pp-navy focus-visible:ring-offset-2">
          <LogIn className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          open
        </button>
      </form>
    </main>
  );
}
