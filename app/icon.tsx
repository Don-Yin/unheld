// Next's file-based icon convention: serves Don's original brand mark as the app's favicon, read
// from disk at request time. A static app/icon.svg symlinked to that same file breaks Turbopack's
// page-data collection ("Cannot find module for page: /icon.svg"), so this dynamic route reads
// the bytes instead \u2014 from public/brand-mark.svg, the one path every consumer (this route, the
// <img> usages, and the assembled public repo, where it is a real file) reads the same mark from.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const size = { width: 64, height: 64 };
export const contentType = 'image/svg+xml';

const MARK_PATH = join(process.cwd(), 'public', 'brand-mark.svg');

export default function Icon() {
  return new Response(readFileSync(MARK_PATH), { headers: { 'Content-Type': contentType } });
}
