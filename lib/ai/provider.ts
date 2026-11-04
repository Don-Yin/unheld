// Which model service the assistant talks to. Server-only: the key has no NEXT_PUBLIC_ prefix and is
// never passed to a client component, so it never reaches the browser.
// AI_PROVIDER picks one of three fixed endpoints, so a deployment cannot send the key anywhere else.

const ENDPOINTS = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  local: 'http://127.0.0.1:18317/v1', // a local OpenAI-compatible proxy, for development only
} as const;

const DEFAULT_MODEL: Record<Provider, string> = {
  openrouter: 'google/gemini-2.5-flash',
  openai: 'gpt-5.4-mini',
  local: 'gpt-5.6-terra',
};

export type Provider = keyof typeof ENDPOINTS;
export type AiConfig = { provider: Provider; baseUrl: string; key: string; models: string[] };

let logged = false;

/** The assistant's provider, key and allowed models, or undefined when no key is set (assistant off). */
export function aiConfig(): AiConfig | undefined {
  const provider = (process.env.AI_PROVIDER ?? 'openai') as Provider;
  if (!(provider in ENDPOINTS)) throw new Error(`AI_PROVIDER must be one of: ${Object.keys(ENDPOINTS).join(', ')}`);
  // The boilerplate's OpenAI key names still work when the provider is openai.
  const key =
    process.env.AI_API_KEY ??
    (provider === 'openai' ? (process.env.AG_STUDIO_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY) : undefined);
  const models = (process.env.AI_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  if (!logged) {
    logged = true;
    console.log(key ? `[AI] assistant on: ${provider}, models ${models.join(', ') || DEFAULT_MODEL[provider]}` : '[AI] assistant off: no AI_API_KEY');
  }
  if (!key) return undefined;
  return { provider, baseUrl: ENDPOINTS[provider], key, models: models.length ? models : [DEFAULT_MODEL[provider]] };
}
