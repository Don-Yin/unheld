import { connection } from 'next/server';
import { aiConfig } from '@/lib/ai/provider';
import { loadHolds } from '@/lib/load-holds';
import { Workbench } from './workbench';

export default async function Home() {
  // Live sandbox and Gmail data: render per request, not at build time.
  await connection();
  const initial = await loadHolds();
  return <Workbench initial={initial} licenseKey={process.env.AG_STUDIO} aiModels={aiConfig()?.models} />;
}
