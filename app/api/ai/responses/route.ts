import { admit, sanitize } from '@/lib/ai/guard';
import { aiConfig } from '@/lib/ai/provider';

// Proxy for AG Studio's OpenAI adapter (app/studio/openai-adapter.ts). The adapter runs in the browser
// and POSTs to `${endpoint}/responses`; with its endpoint set to /api/ai it lands here. This checks the
// request (lib/ai/guard.ts), adds the server's key for the configured provider (lib/ai/provider.ts),
// forwards it to that provider's Responses API and streams the SSE reply straight back, so the adapter
// works unchanged and the key never leaves the server.

const error = (status: number, message: string) => Response.json({ error: { message } }, { status });

export async function POST(request: Request) {
  const config = aiConfig();
  if (!config) return error(503, 'The AI assistant is not configured: set AI_PROVIDER and AI_API_KEY.');

  const text = await request.text();
  const refused = admit(text.length);
  if (refused) return error(429, refused);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return error(400, 'Request body must be JSON.');
  }

  // Only the models offered in the picker (AI_MODELS) may be called.
  const model = typeof body.model === 'string' && body.model ? body.model : config.models[0];
  if (!config.models.includes(model)) return error(400, `Model "${model}" is not enabled.`);

  const upstream = await fetch(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
    body: JSON.stringify(sanitize(body, model)),
    // Stopping the chat in Studio aborts the browser request, which cancels this one too.
    signal: request.signal,
  });

  // Errors come back as JSON and the adapter reads `error.message` from them; success is an SSE stream.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' },
  });
}
