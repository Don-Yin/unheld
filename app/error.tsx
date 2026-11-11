'use client';

import { RefreshCw } from 'lucide-react';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-sm flex-col gap-4">
        <h1 className="text-lg font-semibold text-pp-navy">could not load payments</h1>
        <button onClick={retry} className="flex min-h-11 w-fit items-center gap-2 rounded-md bg-pp-blue px-4 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-navy">
          <RefreshCw className="size-4" strokeWidth={1.5} aria-hidden />
          try again
        </button>
      </div>
    </main>
  );
}
