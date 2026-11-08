// Adapted from AG Studio 3.0's Direct LLM Runner example:
// https://www.ag-grid.com/studio/archive/3.0.0/react/ai-adapter/
// Studio's built-in agents need the full schema/history/tool protocol. Auth, provider choice and
// budget limits belong only to /api/ai/responses; this browser adapter has no key configuration.
import type {
  AgAiConversationItem, AgAiEvent, AgAiMessageAnnotation, AgAiMessageStatus, AgAiOutputContent, AgAiOutputItem,
  AgLlmAdapter, AgLlmRequest, AgLlmResponse, AgLlmResponseHandler,
} from 'ag-studio';

type JsonSchema = Record<string, unknown>;
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
type Options = { endpoint: string; model: string };
type ProviderKey<K> = K extends 'fileId' ? 'file_id' : K extends 'containerId' ? 'container_id' : K extends 'startIndex' ? 'start_index' : K extends 'endIndex' ? 'end_index' : K;
type ProviderAnnotation<T = AgAiMessageAnnotation> = T extends AgAiMessageAnnotation ? { [K in keyof T as ProviderKey<K>]: T[K] } : never;
type ProviderContent = { type: 'output_text'; text: string; annotations?: ProviderAnnotation[] } | { type: 'refusal'; refusal: string };
type ProviderItem = { id?: string } & (
  | { type: 'message'; status?: AgAiMessageStatus; content: ProviderContent[] }
  | { type: 'function_call'; call_id: string; name: string; arguments?: string; status?: AgAiMessageStatus }
  | { type: 'reasoning'; summary: { text: string }[]; content?: { text: string }[] }
);
type ProviderResponse = {
  id: string; created_at: number; model?: string; status: AgLlmResponse['status']; output: ProviderItem[];
  incomplete_details?: AgLlmResponse['incompleteDetails']; error?: AgLlmResponse['error'];
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number; output_tokens_details?: { reasoning_tokens?: number }; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } };
};
type ProviderEvent =
  | { type: 'response.output_item.added' | 'response.output_item.done'; item: ProviderItem }
  | { type: 'response.output_text.delta' | 'response.refusal.delta' | 'response.reasoning_text.delta' | 'response.reasoning_summary_text.delta' | 'response.function_call_arguments.delta'; item_id: string; delta: string }
  | { type: 'response.completed'; response: ProviderResponse }
  | { type: 'response.failed' | 'response.incomplete'; response?: ProviderResponse }
  | { type: 'error'; code?: string; message: string }
  | { type: 'other' }; 

// Shape's JSON Schema 2020-12 -> OpenAI strict subset. Optional object properties become
// required+nullable; array items keep their real nullability. Reject unsupported schemas explicitly.
const BANNED_KEYWORDS = [
  'allOf', 'not', 'oneOf', 'if', 'then', 'else', 'prefixItems', 'patternProperties',
  'propertyNames', 'unevaluatedProperties', 'unevaluatedItems', 'dependentSchemas',
  'dependentRequired', 'contains',
];
const isSchema = (value: unknown): value is JsonSchema => typeof value === 'object' && value !== null && !Array.isArray(value);
const isUndefinedSentinel = (value: unknown) => isSchema(value) && Object.keys(value).length === 1 && isSchema(value.not) && Object.keys(value.not).length === 0;

function makeNullable(schema: JsonSchema): JsonSchema {
  if (typeof schema.type === 'string') return schema.type === 'null' ? schema : { ...schema, type: [schema.type, 'null'] };
  if (Array.isArray(schema.type)) return schema.type.includes('null') ? schema : { ...schema, type: [...schema.type, 'null'] };
  if (Array.isArray(schema.anyOf)) return schema.anyOf.some((b) => isSchema(b) && b.type === 'null') ? schema : { ...schema, anyOf: [...schema.anyOf, { type: 'null' }] };
  return { anyOf: [schema, { type: 'null' }] };
}

function transformSchema(input: JsonSchema): JsonSchema {
  let schema = { ...input };
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.filter((b) => !isUndefinedSentinel(b));
    if (!branches.length) throw new Error('schema reduces to undefined-only');
    if (branches.length !== schema.anyOf.length) {
      delete schema.anyOf;
      schema = branches.length === 1 && isSchema(branches[0]) ? { ...branches[0], ...schema } : { ...schema, anyOf: branches };
    }
  }
  if ('$ref' in schema) return schema.$defs !== undefined ? { $ref: schema.$ref, $defs: schema.$defs } : { $ref: schema.$ref };
  for (const keyword of BANNED_KEYWORDS) {
    if (keyword in schema) throw new Error(`'${keyword}' is not supported by OpenAI strict mode`);
  }
  if ('const' in schema) {
    const value = schema.const;
    delete schema.const;
    const type = value === null ? 'null' : typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value;
    return transformSchema({ ...schema, enum: [value], ...(schema.type == null && ['null', 'string', 'boolean', 'integer', 'number'].includes(type) && { type }) });
  }
  if (Array.isArray(schema.anyOf)) schema.anyOf = schema.anyOf.map((b) => isSchema(b) ? transformSchema(b) : b);
  if (isSchema(schema.$defs)) schema.$defs = Object.fromEntries(Object.entries(schema.$defs).map(([key, value]) => [key, isSchema(value) ? transformSchema(value) : value]));
  if (schema.type === 'object' || isSchema(schema.properties)) {
    if ('additionalProperties' in schema && schema.additionalProperties !== false) throw new Error('open-ended additionalProperties cannot be expressed in OpenAI strict mode');
    const required = new Set(Array.isArray(schema.required) ? schema.required as string[] : []);
    const properties = Object.fromEntries(Object.entries(isSchema(schema.properties) ? schema.properties : {}).map(([key, value]) => {
      const property = isSchema(value) ? transformSchema(value) : value;
      return [key, !required.has(key) && isSchema(property) ? makeNullable(property) : property];
    }));
    schema = { ...schema, properties, required: Object.keys(properties), additionalProperties: false };
  }
  if (isSchema(schema.items)) schema.items = transformSchema(schema.items);
  return schema;
}

function toOpenAiSchema(schema: JsonSchema): JsonSchema {
  if (Array.isArray(schema.anyOf) && schema.type !== 'object' && !isSchema(schema.properties)) throw new Error('root anyOf must be wrapped in an object');
  return transformSchema(schema);
}

// Annotations have the same fields in both directions. Keep the spelling map in one place.
const annotationKeys: Record<string, string> = {
  fileId: 'file_id', containerId: 'container_id', startIndex: 'start_index', endIndex: 'end_index',
};
const decodedKeys = Object.fromEntries(Object.entries(annotationKeys).map(([key, value]) => [value, key]));
function annotations(items: readonly AgAiMessageAnnotation[], encode: true): ProviderAnnotation[];
function annotations(items?: readonly ProviderAnnotation[], encode?: false): AgAiMessageAnnotation[];
function annotations(items: readonly (ProviderAnnotation | AgAiMessageAnnotation)[] = [], encode = false) {
  const keys = encode ? annotationKeys : decodedKeys;
  return items.map((item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [keys[key] ?? key, value]))) as (ProviderAnnotation | AgAiMessageAnnotation)[];
}

function encodeConversationItems(items: AgAiConversationItem[]): unknown[] {
  return items.map((item) => {
    if (item.kind === 'input' && item.type === 'message') return {
      type: 'message', role: item.role, status: item.status,
      content: item.content.map((content) => {
        switch (content.type) {
          case 'text': return { type: 'input_text', text: content.text };
          case 'image': return { type: 'input_image', detail: content.detail, file_id: content.fileId ?? null, image_url: content.imageUrl ?? null };
          case 'file': return { type: 'input_file', file_id: content.fileId ?? null, file_data: content.fileData, file_url: content.fileUrl, filename: content.filename };
        }
      }),
    };
    if (item.type === 'function_call_output') return { type: item.type, call_id: item.callId, output: item.output, status: item.status };
    // History is reconstructed context, not a resumed provider response. Do not replay message or
    // function item IDs: only call_id pairs the call with its output. Reasoning retains its own ID.
    if (item.kind === 'output' && item.type === 'message') return {
      type: 'message', role: 'assistant', status: item.status,
      content: item.content.map((content) => content.type === 'text'
        ? { type: 'output_text', text: content.text, annotations: annotations(content.annotations, true) }
        : { type: 'refusal', refusal: content.refusal }),
    };
    if (item.kind === 'output' && item.type === 'function_call') return {
      type: item.type, call_id: item.callId, name: item.name, arguments: item.arguments, status: item.status,
    };
    if (item.kind === 'output' && item.type === 'reasoning') return {
      id: item.id, type: item.type,
      summary: item.summary.map((s) => ({ type: 'summary_text', text: s.text })),
      content: item.content?.map((c) => ({ type: 'reasoning_text', text: c.text })),
    };
    throw new Error(`unknown conversation item: ${(item as { type: string }).type}`);
  });
}

// Undo required+nullable for object properties, never delete a null array bound. Leave invalid
// argument JSON intact so Studio's own tool validator can report it rather than silently fixing it.
function stripNulls(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, stripNulls(v)]));
  return value;
}
function toolArguments(text: string): string {
  try { return JSON.stringify(stripNulls(JSON.parse(text))); }
  catch { return text; }
}

function decodeOutputContent(input: ProviderContent): AgAiOutputContent {
  return input.type === 'output_text' ? { type: 'text', text: input.text, annotations: annotations(input.annotations) } : input as AgAiOutputContent;
}
function decodeOutputItem(input: ProviderItem): AgAiOutputItem {
  switch (input.type) {
    case 'message': return {
      id: input.id ?? '', kind: 'output', type: 'message', role: 'assistant', status: input.status ?? 'completed', content: input.content.map(decodeOutputContent),
    };
    case 'function_call': return {
      id: input.id ?? '', kind: 'output', type: 'function_call', callId: input.call_id, name: input.name,
      arguments: toolArguments(input.arguments ?? ''), status: input.status,
    };
    case 'reasoning': return {
      id: input.id ?? '', kind: 'output', type: 'reasoning',
      summary: input.summary.map((s) => ({ type: 'summary', text: s.text })),
      content: input.content?.map((c) => ({ type: 'text', text: c.text })),
    };
    default: throw new Error('unknown model output item');
  }
}
function decodeResponse(input: ProviderResponse): AgLlmResponse {
  return {
    id: input.id, createdAt: input.created_at, model: input.model, status: input.status,
    incompleteDetails: input.incomplete_details ? { reason: input.incomplete_details.reason } : undefined,
    output: input.output.map(decodeOutputItem), error: input.error ? { code: input.error.code, message: input.error.message } : undefined,
    usage: input.usage ? {
      inputTokens: input.usage.input_tokens, outputTokens: input.usage.output_tokens, totalTokens: input.usage.total_tokens,
      reasoningTokens: input.usage.output_tokens_details?.reasoning_tokens,
      cachedInputTokens: input.usage.input_tokens_details?.cached_tokens, cacheWriteTokens: input.usage.input_tokens_details?.cache_write_tokens,
    } : undefined,
  };
}

type Outcome = { response?: AgLlmResponse; error?: Error };
class ResponseStreamTranslator {
  private readonly items = new Map<string, ProviderItem>();

  private boundary(item: ProviderItem, start: boolean): AgAiEvent[] {
    const id = item.id ?? '';
    const known = start ? item : this.items.get(id);
    if (!known) return [];
    if (start) this.items.set(id, item);
    else this.items.delete(id);
    switch (known.type) {
      case 'message': return start ? [{ type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant' }] : [{ type: 'TEXT_MESSAGE_END', messageId: id }];
      case 'reasoning': return start ? [{ type: 'REASONING_MESSAGE_START', messageId: id, role: 'reasoning' }] : [{ type: 'REASONING_MESSAGE_END', messageId: id }];
      case 'function_call': return start ? [{ type: 'TOOL_CALL_START', toolCallId: known.call_id, toolCallName: known.name }] : [{ type: 'TOOL_CALL_END', toolCallId: known.call_id }];
      default: return [];
    }
  }

  translate(input: ProviderEvent, outcome: Outcome): AgAiEvent[] {
    switch (input.type) {
      case 'response.output_item.added': return this.boundary(input.item, true);
      case 'response.output_item.done': return this.boundary(input.item, false);
      case 'response.output_text.delta':
      case 'response.refusal.delta': return [{ type: 'TEXT_MESSAGE_CONTENT', messageId: input.item_id, delta: input.delta }];
      case 'response.reasoning_text.delta':
      case 'response.reasoning_summary_text.delta': return [{ type: 'REASONING_MESSAGE_CONTENT', messageId: input.item_id, delta: input.delta }];
      case 'response.function_call_arguments.delta': {
        const item = this.items.get(input.item_id);
        return item?.type === 'function_call' ? [{ type: 'TOOL_CALL_ARGS', toolCallId: item.call_id, delta: input.delta }] : [];
      }
      case 'response.completed': outcome.response = decodeResponse(input.response); return [];
      case 'response.failed':
      case 'response.incomplete': outcome.error ??= new Error(input.response?.error?.message ?? `response ${input.type}`); return [];
      case 'error': outcome.error ??= new Error(`${input.code ?? 'api_error'}: ${input.message}`); return [];
      default: return []; // usage, progress and keepalive events carry no Studio content.
    }
  }
}

function parseEvent(payload: string): ProviderEvent {
  const event: unknown = JSON.parse(payload);
  if (!isSchema(event) || typeof event.type !== 'string') throw new Error('invalid model stream event');
  if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
    if (!isSchema(event.item) || typeof event.item.id !== 'string' || typeof event.item.type !== 'string') throw new Error('invalid model stream item');
  } else if (['response.output_text.delta', 'response.refusal.delta', 'response.reasoning_text.delta', 'response.reasoning_summary_text.delta', 'response.function_call_arguments.delta'].includes(event.type)) {
    if (typeof event.item_id !== 'string' || typeof event.delta !== 'string') throw new Error('invalid model content delta');
  } else if (event.type === 'response.completed') {
    if (!isSchema(event.response) || !Array.isArray(event.response.output)) throw new Error('invalid final model response');
  } else if (!['response.failed', 'response.incomplete', 'error'].includes(event.type)) return { type: 'other' };
  return event as ProviderEvent;
}

async function* streamOpenAi(endpoint: string, body: Record<string, unknown>, outcome: Outcome, signal?: AbortSignal): AsyncGenerator<AgAiEvent> {
  const response = await fetch(`${endpoint}/responses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const text = await response.text();
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const error: unknown = JSON.parse(text);
      if (isSchema(error) && isSchema(error.error) && typeof error.error.message === 'string') message = error.error.message;
    } catch { /* A non-JSON HTTP error still has its status. */ }
    throw new Error(message);
  }
  if (!response.body) throw new Error('model returned no response stream');
  const translator = new ResponseStreamTranslator();
  const emit = (frame: string): AgAiEvent[] => {
    const payload = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    return !payload || payload === '[DONE]' ? [] : translator.translate(parseEvent(payload), outcome);
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ended = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) yield* emit(frame);
      if (done) { ended = true; if (buffer.trim()) yield* emit(buffer); break; }
    }
  } finally {
    try { if (!ended) await reader.cancel(); }
    finally { reader.releaseLock(); }
  }
}

function runRequest(config: Options, request: AgLlmRequest, signal?: AbortSignal): AgLlmResponseHandler {
  const { tools = [], toolChoice, responseFormat, input, model, ...rest } = request;
  const body = {
    ...rest, input: encodeConversationItems(input), model: model?.id ?? config.model, stream: true,
    tools: tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: toOpenAiSchema(tool.parameters as JsonSchema), strict: true })),
    tool_choice: typeof toolChoice === 'object' ? { type: 'function', name: toolChoice.name } : toolChoice,
    text: { format: responseFormat.type === 'text' ? { type: 'text' } : {
      type: 'json_schema', name: responseFormat.name, description: responseFormat.description, schema: toOpenAiSchema(responseFormat.schema as JsonSchema), strict: true,
    } },
    reasoning: { effort: model?.effort ?? 'medium' }, parallel_tool_calls: true,
  };
  const outcome: Outcome = {};
  let resolve!: (response: AgLlmResponse) => void;
  let reject!: (error: Error) => void;
  const complete = new Promise<AgLlmResponse>((ok, fail) => { resolve = ok; reject = fail; });
  // Studio may abandon a cancelled stream without awaiting complete. Observe the rejection here;
  // a caller that does await it still receives the failure once, through the normal protocol.
  void complete.catch(() => {});
  async function* stream(): AsyncGenerator<AgAiEvent> {
    try { yield* streamOpenAi(config.endpoint, body, outcome, signal); }
    catch (error) { outcome.error ??= error instanceof Error ? error : new Error(String(error)); }
    finally {
      if (outcome.error) reject(outcome.error);
      else if (outcome.response) resolve(outcome.response);
      else reject(new Error('stream ended without a final response'));
    }
  }
  const iterator = stream();
  return { stream: { [Symbol.asyncIterator]: () => iterator }, complete };
}

export function openaiAdapter(options: Options): AgLlmAdapter {
  return { executeTurn: (request, turn) => runRequest(options, request, turn?.signal) };
}
