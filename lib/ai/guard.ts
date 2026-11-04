// Server-side limits on /api/ai. They sit behind the access-code gate (proxy.ts) and under the
// provider's own spend cap (for OpenRouter, the key's daily credit limit), so even a leaked access
// code cannot turn the deployment into a general-purpose model proxy.

const MAX_BODY_CHARS = 600_000; // the assistant sends the whole conversation plus Studio's tool schemas
const MAX_OUTPUT_TOKENS = 8_000; // per turn, reasoning included

let day = '';
let used = 0;

/** Counts one assistant turn against AI_DAILY_LIMIT (unset or 0: no count). Returns an error message when refused. */
export function admit(bodyChars: number): string | undefined {
  if (bodyChars > MAX_BODY_CHARS) return 'request too large';
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 0);
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) [day, used] = [today, 0];
  // In memory: a restart resets the count early, which the provider's spend cap still bounds.
  if (limit > 0 && ++used > limit) return 'the assistant has reached today\'s limit; it resets at midnight UTC';
}

/** The request as sent upstream: an allowed model, capped output, and only our own function tools. */
export function sanitize(body: Record<string, unknown>, model: string) {
  const { plugins, store, previous_response_id, ...rest } = body; // provider extras and server-side state
  void [plugins, store, previous_response_id];
  const tools = Array.isArray(rest.tools) ? rest.tools.filter((t) => (t as { type?: string }).type === 'function') : undefined;
  return { ...rest, ...(tools && { tools }), model, max_output_tokens: MAX_OUTPUT_TOKENS };
}
