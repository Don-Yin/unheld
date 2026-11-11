// Favicon: serves public/brand-mark.svg (a static app/icon.svg breaks Turbopack's build).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const size = { width: 64, height: 64 };
export const contentType = 'image/svg+xml';

const MARK_PATH = join(process.cwd(), 'public', 'brand-mark.svg');

export default function Icon() {
  return new Response(readFileSync(MARK_PATH), { headers: { 'Content-Type': contentType } });
}
