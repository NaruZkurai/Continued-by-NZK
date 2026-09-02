import type { RequestOptions } from "@continuedev/config-types";
import { fetchwithRequestOptions, patchedFetch, streamSse } from "@continuedev/fetch";
import NaruZkurAI from "naruzkurai/index";
import { ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParams, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming, Completion, CompletionCreateParamsNonStreaming, CompletionCreateParamsStreaming, Model, } from "naruzkurai/resources/index";
import type { Response, ResponseStreamEvent, } from "naruzkurai/resources/responses/responses.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
/*|S|----------------------NZK----------------------|S|*/
import { z } from "zod";
import { NaruZkurAIConfigSchema } from "../types.js";
import { customFetch } from "../util.js";
import { BaseLlmApi, CreateRerankResponse, FimCreateParamsStreaming, RerankCreateParams, } from "./base.js";
import { createResponsesStreamState, fromResponsesChunk, isResponsesModel, responseToChatCompletion, toResponsesParams, } from "./naruzkuraiResponses.js";
/*|E|----------------------NZK----------------------|E|*/

export class NaruZkurAIApi implements BaseLlmApi {naruzkurai: NaruZkurAI;
apiBase: string = "https:/*api.naruzkurai.com/v1/";

constructor(protected config: z.infer<typeof NaruZkurAIConfigSchema>) {this.apiBase = config.apiBase ?? this.apiBase;

/* Always create the original NaruZkurAI client for fallback*/
this.naruzkurai = new NaruZkurAI({/* Necessary because `new NaruZkurAI()` will throw an error if there is no API Key*/
apiKey: config.apiKey ?? "",baseURL: this.apiBase,fetch: customFetch(config.requestOptions),timeout: config?.requestOptions?.timeout || undefined,});}
modifyChatBody<T extends ChatCompletionCreateParams>(body: T): T {/* Add stream_options to include usage in streaming responses*/
if (body.stream) {(body as any).stream_options = { include_usage: true };}

/* DeepSeek reasoner models use max_completion_tokens instead of max_tokens*/
if (body.max_tokens && (this.apiBase?.includes("api.deepseek.com") || body.model.includes("deepseek-reasoner")))
 {body.max_completion_tokens = body.max_tokens; body.max_tokens = undefined;}

/* o-series models - only apply for official NaruZkurAI API*/
const isOfficialNaruZkurAIAPI = this.apiBase === "https:/*api.naruzkurai.com/v1/";
if (isOfficialNaruZkurAIAPI) {if (body.model.startsWith("o") || body.model.includes("gpt-5")) {/* a) use max_completion_tokens instead of max_tokens*/
body.max_completion_tokens = body.max_tokens;
body.max_tokens = undefined;

/* b) use "developer" message role rather than "system"*/
body.messages = body.messages.map((message) => {if (message.role === "system") {return { ...message, role: "developer" } as any;}
return message;});}
if (body.tools?.length && !body.model.startsWith("o3")) {body.parallel_tool_calls = false;}}
return body;}

protected shouldUseResponsesEndpoint(model: string): boolean {if (this.config.useResponsesApi === false) {return false;}
const isOfficialNaruZkurAIAPI = this.apiBase === "https:/*api.naruzkurai.com/v1/";
return isOfficialNaruZkurAIAPI && isResponsesModel(model);}

modifyCompletionBody<
T extends | CompletionCreateParamsNonStreaming | CompletionCreateParamsStreaming,>(body: T): T {return body;}

modifyEmbedBody<T extends NaruZkurAI.Embeddings.EmbeddingCreateParams>(body: T,): T {return body;}

modifyFimBody<T extends FimCreateParamsStreaming>(body: T): T {return body;}

modifyRerankBody<T extends RerankCreateParams>(body: T): T {return body;}

protected getHeaders(): Record<string, string> {return {"Content-Type": "application/json",Accept: "application/json","x-api-key": this.config.apiKey ?? "",Authorization: `Bearer ${this.config.apiKey}`,};}

async chatCompletionNonStream(body: ChatCompletionCreateParamsNonStreaming,signal: AbortSignal,): Promise<ChatCompletion> {if (this.shouldUseResponsesEndpoint(body.model)) {const response = await this.responsesNonStream(body, signal);
return responseToChatCompletion(response);}
const response = await this.naruzkurai.chat.completions.create(this.modifyChatBody(body),{signal,},);
return response;}

async *chatCompletionStream(body: ChatCompletionCreateParamsStreaming,signal: AbortSignal,): AsyncGenerator<ChatCompletionChunk, any, unknown>
 {if (this.shouldUseResponsesEndpoint(body.model))
  {for await (const chunk of this.responsesStream(body, signal)) {yield chunk;}
return;}
const response = await this.naruzkurai.chat.completions.create(this.modifyChatBody(body),{signal,},);
let lastChunkWithUsage: ChatCompletionChunk | undefined;
for await (const result of response) {/* Check if this chunk contains usage information*/
if (result.usage) {/* Store it to emit after all content chunks*/
lastChunkWithUsage = result;} else {yield result;}}
/* Emit the usage chunk at the end if we have one*/
if (lastChunkWithUsage) {yield lastChunkWithUsage;}}
async completionNonStream(body: CompletionCreateParamsNonStreaming,signal: AbortSignal,): Promise<Completion> {const response = await this.naruzkurai.completions.create(this.modifyCompletionBody(body),{ signal },);
return response;}
async *completionStream(body: CompletionCreateParamsStreaming,signal: AbortSignal,): AsyncGenerator<Completion, any, unknown> {const response = await this.naruzkurai.completions.create(this.modifyCompletionBody(body),{ signal },);
for await (const result of response) {yield result;}}
async *fimStream(body: FimCreateParamsStreaming,signal: AbortSignal,): AsyncGenerator<ChatCompletionChunk, any, unknown> {const endpoint = new URL("fim/completions", this.apiBase);
const modifiedBody = this.modifyFimBody(body);
const resp = await customFetch(this.config.requestOptions)(endpoint, {method: "POST",body: JSON.stringify({model: modifiedBody.model,prompt: modifiedBody.prompt,suffix: modifiedBody.suffix,max_tokens: modifiedBody.max_tokens,max_completion_tokens: (modifiedBody as any).max_completion_tokens,temperature: modifiedBody.temperature,top_p: modifiedBody.top_p,frequency_penalty: modifiedBody.frequency_penalty,presence_penalty: modifiedBody.presence_penalty,stop: modifiedBody.stop,stream: true,}),headers: this.getHeaders(),signal,});
for await (const chunk of streamSse(resp as any)) {if (chunk.choices && chunk.choices.length > 0) {yield chunk;}}}

async embed(body: NaruZkurAI.Embeddings.EmbeddingCreateParams,): Promise<NaruZkurAI.Embeddings.CreateEmbeddingResponse> {const response = await this.naruzkurai.embeddings.create(this.modifyEmbedBody(body),);
return response;}

async rerank(body: RerankCreateParams): Promise<CreateRerankResponse> {const endpoint = new URL("rerank", this.apiBase);
const modifiedBody = this.modifyRerankBody(body);
const response = await customFetch(this.config.requestOptions)(endpoint, {method: "POST",body: JSON.stringify(modifiedBody),headers: this.getHeaders(),});
const data = await response.json();
return data as any;}

async list(): Promise<Model[]> {return (await this.naruzkurai.models.list()).data;}

async responsesNonStream(body: ChatCompletionCreateParamsNonStreaming,signal: AbortSignal,): Promise<Response> {const params = toResponsesParams({...(body as ChatCompletionCreateParams),stream: false,});
return (await this.naruzkurai.responses.create(params, {signal,})) as Response;}

async *responsesStream(body: ChatCompletionCreateParamsStreaming,signal: AbortSignal,): AsyncGenerator<ChatCompletionChunk> {const params = toResponsesParams({...(body as ChatCompletionCreateParams),stream: true,});

const state = createResponsesStreamState({model: body.model,});

const stream = this.naruzkurai.responses.stream(params as any, {signal,});

for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {const chunk = fromResponsesChunk(state, event);if (chunk) {yield chunk;}}
}}
/*|E|----------------------OAI----------------------|E|*/






/*|S|----------------------NZK----------------------|S|*/
/**
 * NaruZkurai - a provider built as a replacement to an OpenAI provider.
 *
 * The only differences from upstream `NaruZkurAIApi` are the config and behavior fixes
 * needed for a custom NaruZkurAI-compatible inference server:
 *
 * 1. NEVER strip/delete `Authorization`, `x-api-key`, or any custom headers.
 *   (Upstream `customFetch()` deletes default auth headers when it thinks a
 *   custom one is present; that breaks this server, so we use a passthrough
 *   fetch that forwards every header untouched.)
 *
 * 2. Forward `requestOptions.headers` to the SDK on every request via
 *   `defaultHeaders`, so a custom `User-Agent` and any other custom headers
 *   (X-Custom-Header, X-Organization-Id, ...) actually reach the server.
 *
 * 3. `model: auto` — when the configured model is exactly `auto`, the model
 *   is resolved automatically before every request: the provider pings
 *   `GET <apiBase>/models`, picks a generation model (the last-used one
 *   from a session file if it is still up, otherwise a sensible default),
 *   subs in that id for the request, and persists the last-used model to a
 *   file so the selection survives for the rest of the session.
 */

const AUTO = "auto";

/** A server-reported model entry, possibly with a separate quant + loaded flag. */
type ServerModel = { id: string; quant?: string; loaded?: boolean };

/**
 * Max times to re-issue a chat request when the server rejects the model's
 * tool-call arguments as malformed JSON (see isToolCallParseError). The model
 * (often a low-quant / speculative draft) occasionally emits a tool call whose
 * arguments string is truncated or malformed; llama-server validates it
 * server-side and answers HTTP 500 instead of streaming it. Nothing has been
 * yielded before that failure, so re-running the request is safe and a fresh
 * generation usually produces a well-formed tool call.
 */
const TOOL_CALL_PARSE_MAX_RETRIES = 3;

/**
 * True when `err` is the server rejecting a malformed/truncated tool call:
 *   - Unsloth Studio wraps llama-server JSON parse failures as
 *     `Failed to parse tool call arguments as JSON: ...parse_error...`
 *   - The underlying message often carries a `json.exception.parse_error.101`
 *     (unexpected end of input / expected "[", "{", or a literal).
 * We match broadly (error text + status 5xx) so any server flavor that rejects
 * a bad tool call is caught without false-matching an unrelated failure.
 */
function isToolCallParseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/parse tool call arguments|parse_error|unexpected end of input/i.test(msg)) {
    return false;
  }
  const status =
    (err as { status?: unknown })?.status ??
    (err as { statusCode?: unknown })?.statusCode;
  return status === undefined ||
    (typeof status === "number" && status >= 500 && status < 600);
}

/**
 * Agent-invisible "request notification" sink.
 *
 * The automode / load notices (e.g. "resolved auto -> model") must reach the
 * UI without ever entering the model's own context. The CLI registers a sink
 * before a turn, the adapter emits human text into it, and the CLI renders it
 * as a footer bubble that is never stored in chat history (so the agent never
 * sees it). Kept module-level so `BaseLlmApi`'s fixed
 * `chatCompletionStream(body, signal)` signature stays unchanged.
 */
let noticeSink: ((text: string) => void) | undefined;

/** Register (or clear, with `undefined`) the agent-invisible notice sink. */
export function setNoticeSink(sink: ((text: string) => void) | undefined): void {
  noticeSink = sink;
}

/** Clear the agent-invisible notice sink. */
export function clearNoticeSink(): void {
  noticeSink = undefined;
}

/** Push human text to the registered notice sink (no-op when unset). */
function emitNotice(text: string): void {
  try {
    noticeSink?.(text);
  } catch {
    /* A broken UI sink must never break the request.*/
  }
}

/** File used to remember the last auto-selected model per server for the session. */
export const AUTO_MODEL_FILE = join(homedir(), ".continue", "naruzkurai-auto-model.json");

/** Models that look like autocomplete/embedding-only helpers are never preferred. */
const NON_GENERATION = /autocomplete|embed|draft|completion|rerank|\.js\b|js-coder|fim/i;

/**
 * A copy of upstream `customFetch()` (from util.ts) that OMITS the
 * `letRequestOptionsOverrideAuthHeaders` stripping step. Every header is
 * forwarded to the underlying fetch unchanged.
 */
function naruFetch( requestOptions: RequestOptions | undefined,): typeof patchedFetch
 { if (process.env.FEATURE_FLAG_DISABLE_CUSTOM_FETCH) {return patchedFetch;}
 return (req: URL | string | Request, init?: any) =>
  { if (typeof req === "string" || req instanceof URL)
    { return fetchwithRequestOptions(req, init, requestOptions);
    } else { return fetchwithRequestOptions(req.url, init, requestOptions);}
  };
 }

export class NaruZkuraiApi implements BaseLlmApi {
 /** Underlying NaruZkurAI-compatible SDK client pointed at the resolved base. */
 naruzkurai!: NaruZkurAI;
 /**
  * Base URL this provider talks to. Initialized to an empty string and only
  * ever set from the user's config (`apiURL`/`apiBase`). There is NO fallback
  * to the NaruZkurAI default `https:/*api.naruzkurai.com/v1/` — if the config omits a
  * base URL this stays empty and the SDK errors loudly instead of silently
  * routing to api.naruzkurai.com.
  */
 apiBase: string = "";

 /** How long a resolved auto-model stays valid before we ping `/models` again. */
 private static readonly AUTO_TTL_MS = 30_000;
 /** Resolved auto-model per `apiBase` (the "last used for the session"). */
 private static autoModelCache = new Map<string, string>();
 /** Expiry timestamp for each cached auto-model. */
 private static autoModelExpiry = new Map<string, number>();

 /**
  * Short-TTL cache of the last `GET /v1/models` response per server, so we do
  * not hammer `/models` on every chat request just to check the loaded flag or
  * to resolve the loaded quant of a desired model.
  */
 private static modelsCache = new Map<string, ServerModel[]>();
 /** Expiry timestamp for each cached model list. */
 private static modelsCacheExpiry = new Map<string, number>();

 /** Candidate base URLs in preference order (e.g. https first, then http). */
 private baseCandidates: string[] = [];
 /** Index into baseCandidates currently in use. */
 private resolvedBaseIndex = 0;

 /**
  * Separator between model id and quant in the loaded `model:quant` form
  * used by the server (e.g. `peculiar-ragdoll/Dirk-...-GGUF:UD-Q2_K_XL`).
  */
 private static readonly QUANT_SEP = ":";
 /** Optional configured quant (from `quant:` in config.yaml). */
 private readonly quant: string = "";

 /** Append the configured quant to a bare model id, producing `model:quant`. */
 private withQuant(model: string): string {
  if (!this.quant || NaruZkuraiApi.isAuto(this.quant)) {
   /* `auto` quant is never forwarded literally — it is detected from
      /v1/models instead (see resolveLoadedQuant). Send the bare model so the
      server lazy-loads rather than treating `model:auto` as a reload. */
   return model;
  }
  if (!model || NaruZkuraiApi.isAuto(model) || model.includes(this.quant)) {
   return model;
  }
  return `${model}${NaruZkuraiApi.QUANT_SEP}${this.quant}`;
 }

 /**
  * Merge provider-defined extra body fields (e.g. raw `chat_template_kwargs`
  * such as `{ reasoning_effort: "high" }`) into the outbound chat body.
  * These come from the model's `requestOptions.extraBodyProperties` in
  * config.yaml, so provider-specific model knobs reach the server.
  */
 private injectExtraBodyProperties<T extends Record<string, any>>(
  body: T,
 ): T {
  const extra = this.config.requestOptions?.extraBodyProperties;
  if (extra && typeof extra === "object") {
   for (const [key, value] of Object.entries(extra)) {
    if ((body as any)[key] === undefined) {
     (body as any)[key] = value;
    }
   }
  }
  return body;
 }

 /** True when the configured quant is `auto` (or unset) -> probe loaded quant. */
 private quantIsAuto(): boolean {
  return !this.quant || NaruZkuraiApi.isAuto(this.quant);
 }

 constructor(protected config: z.infer<typeof NaruZkurAIConfigSchema>) {
  this.quant = config.quant ?? "";
  /* Prefer apiURL, fall back to apiBase. No default fallback is supplied:*/
  /* an empty `apiBase` is left as-is so a misconfigured provider fails loud*/
  /* and clear instead of silently inheriting api.naruzkurai.com.*/
  this.apiBase = config.apiURL ?? config.apiBase ?? "";

  /* naruzkurai-only: ApiHttpOrHttps controls the outbound scheme.*/
  /*  false (default)   -> keep the configured scheme, no fallback*/
  /*  "http" / "https"  -> use that scheme; on error fall back to the*/
  /*              other one (https -> http, http -> https)*/
  /* If the configured base has no scheme, prepend the preferred one.*/
  const raw = config.ApiHttpOrHttps;
  const preferred =typeof raw === "string" ? raw.trim().toLowerCase() : raw;
  const baseCandidate = (scheme: string): string => {
   return /^[a-z][a-z0-9+.-]*:\/\//i.test(this.apiBase)
    ? this.apiBase.replace(/^[a-z][a-z0-9+.-]*:\/\//i, `${scheme}://`)
    : `${scheme}://${this.apiBase}`;
  };
  if (preferred === "http") {
   this.baseCandidates = [baseCandidate("http"), baseCandidate("https")];
  } else if (preferred === "https") {
   this.baseCandidates = [baseCandidate("https"), baseCandidate("http")];
  } else {
   this.baseCandidates = [/^[a-z][a-z0-9+.-]*:\/\//i.test(this.apiBase)
    ? this.apiBase : `http://${this.apiBase}`];
  }
  this.rebuildNaruZkurAI(this.baseCandidates[0]);
 }

 /** (Re)build the underlying NaruZkurAI client pointed at the given base. */
 private rebuildNaruZkurAI(baseInput: string): void {
  /* Normalize the base to end with a trailing slash. Without it the SDK's*/
  /* relative URL resolution (`new URL("chat/completions", base)`) drops the*/
  /* last path segment, so `http://host/v1` would wrongly POST to*/
  /* `/chat/completions` instead of the `/v1/chat/completions` API.*/
  const base = baseInput.endsWith("/") ? baseInput : `${baseInput}/`;
  this.apiBase = base;
  this.naruzkurai = new NaruZkurAI({
   /* Necessary because `new NaruZkurAI()` will throw an error if there is no API Key*/
   apiKey: this.config.apiKey ?? "",
   baseURL: base,
   /* Patch 1: passthrough fetch that never strips auth/custom headers*/
   fetch: naruFetch(this.config.requestOptions),
   timeout: this.config?.requestOptions?.timeout || undefined,
   /* Patch 2 (cont.): forward custom request headers on every SDK request*/
   defaultHeaders: this.config?.requestOptions?.headers,
  });
 }

 /**
  * Try the next base candidate (e.g. fall from https to http). Returns true
  * if a fallback was applied. Used when the current scheme fails.
  */
 private tryNextBase(keepAutoModel: boolean): boolean {
  if (this.resolvedBaseIndex >= this.baseCandidates.length - 1) {
   return false;
  }
  this.resolvedBaseIndex += 1;
  this.rebuildNaruZkurAI(this.baseCandidates[this.resolvedBaseIndex]);
  if (!keepAutoModel) {
   NaruZkuraiApi.autoModelCache.delete(this.apiBase);
   NaruZkuraiApi.autoModelExpiry.delete(this.apiBase);
  }
  return true;
 }

 /** Cache key: one resolved model per server, so different apiBases don't clash. */
 private get sessionKey(): string {
  return this.apiBase;
 }

 private static isAuto(model: string): boolean {
  return model.trim().toLowerCase() === AUTO;
 }

 /** Read the last auto-selected model for this server from the session file. */
 private readStoredModel(): string | undefined {
  try {
   const data = JSON.parse(readFileSync(AUTO_MODEL_FILE, "utf8"));
   const value = data?.[this.sessionKey];
   if (typeof value === "string") {
    return value; /* legacy format: plain model string*/
   }
   if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).model === "string"
   ) {
    return (value as any).model;
   }
   return undefined;
  } catch {
   return undefined;
  }
 }

 /** Persist the auto-selected model for this server to the session file. */
 private writeStoredModel(model: string): void {
  try {
   mkdirSync(dirname(AUTO_MODEL_FILE), { recursive: true });
   let data: Record<string, unknown> = {};
   try {
    data = JSON.parse(readFileSync(AUTO_MODEL_FILE, "utf8"));
   } catch {
    data = {};
   }
   data[this.sessionKey] = { model, ts: Date.now() };
   writeFileSync(AUTO_MODEL_FILE, JSON.stringify(data, null, 2));
  } catch {
   /* Never let a persistence failure block a request.*/
  }
 }

 /**
  * Strip a stale `:quant` suffix (e.g. a leftover `:auto`) from a model id,
  * returning the server's bare id. A literal `auto` in a quant slot makes the
  * server treat the whole model as `auto` and force a reload, so we must never
  * let it through or persist it. No-op when the id has no suffix.
  */
 private static stripQuantSuffix(modelId: string): string {
  const sep = NaruZkuraiApi.QUANT_SEP;
  if (!modelId || !modelId.includes(sep)) {
   return modelId;
  }
  /* Only strip a single trailing `id:quant` stub. Bare, quant-less ids and
     ids that already use the `id:quant` form keep their full value. */
  const at = modelId.lastIndexOf(sep);
  if (at <= 0 || at === modelId.length - 1) {
   return modelId;
  }
  return modelId.slice(0, at);
 }

 /** Pick a model id, preferring the last-used one if it's still up. */
private pickModel( models: ServerModel[],): string
{ const label = (m: ServerModel) =>
    m.loaded && m.quant && !NaruZkuraiApi.isAuto(m.quant) && !m.id.includes(m.quant)
    ? `${m.id}${NaruZkuraiApi.QUANT_SEP}${m.quant}` : m.id;
  const labels = models.map(label);

  const isGen = (m: ServerModel) => !NON_GENERATION.test(m.id);
  const gen = models.filter(isGen);

  /* The currently-LOADED generation model is the source of truth for a
     fresh session. The server may be running a model different from the one
     a previous process persisted, so the loaded model always wins over any
     stored model.*/
  const loaded = gen.find((m) => m.loaded);
  if (loaded) return label(loaded);
  const unloadedGen = gen.find((m) => !m.loaded);

  const stored = this.readStoredModel();
  if (stored) {
   /* Never reuse a stored stub that ends in `:auto` — resolve it fresh.*/
   const storedBare = NaruZkuraiApi.stripQuantSuffix(stored);
   if (labels.includes(stored)) { return stored; }
   if (
    stored.toLowerCase().endsWith(`${NaruZkuraiApi.QUANT_SEP}${AUTO}`) &&
    labels.includes(storedBare)
   ) {
    return storedBare;
   }
  }

  if (unloadedGen) return label(unloadedGen);
  if (gen.length) return label(gen[0]);
  return models[0] ? label(models[0]) : "";
}

 /**
  * Resolve the loaded quant for a *specific* desired model id (not `auto`).
  *
  * If the server reports a model that matches the requested id and it is
  * already `loaded: true` with a separate `quant`, return the `id-quant`
  * form so the request reuses the in-memory weights instead of making the
  * server load a fresh (possibly different) quant. Returns the input model
  * unchanged when there is no loaded quant match or `/models` is unreachable.
  */
 private async resolveLoadedQuant(modelId: string): Promise<string> {
  const sep = NaruZkuraiApi.QUANT_SEP;
  if (!modelId || NaruZkuraiApi.isAuto(modelId)) {
   return modelId;
  }
  /* Strip any stale `:quant` suffix (e.g. a leftover `:auto`) so we look the
     server model up by its bare id. Auto quant must be *detected* from
     /v1/models, never forwarded as a literal `auto` stub — the server treats
     `model:auto` as "auto" and forces a reload. */
  const bareId = NaruZkuraiApi.stripQuantSuffix(modelId);
  try {
   const models = await this.fetchModelsCached();
   const match = models.find(
    (m) =>
     typeof m.quant === "string" &&
     m.quant.length > 0 &&
     m.id === bareId,
   );
   if (match && typeof match.quant === "string" && match.quant.length > 0) {
    const resolved = `${match.id}${sep}${match.quant}`;
    if (resolved !== modelId) {
     console.log(
      `[NaruZkurai] desired model \`${modelId}\` is pre-loaded -> using loaded quant \`${resolved}\``,
     );
    }
    return resolved;
   }
  } catch {
   /* /models unreachable: fall through to the safe default below.*/
  }
  /* No real loaded quant matched. Never send a literal `auto` suffix. If the
     input already carried any `:suffix` (including a stale `:auto`), return
     the bare id so the server lazy-loads instead of treating it as auto;
     otherwise keep the input unchanged. */
  return modelId.includes(sep) ? bareId : modelId;
 }

 /** Fetch `/v1/models` with a short-TTL cache, so chat requests don't re-ping. */
 private async fetchModelsCached(): Promise<ServerModel[]> {
  const now = Date.now();
  const expiry = NaruZkuraiApi.modelsCacheExpiry.get(this.sessionKey) ?? 0;
  const cached = NaruZkuraiApi.modelsCache.get(this.sessionKey);
  if (cached && now < expiry) {
   return cached;
  }
  const fresh = await this.fetchModels();
  NaruZkuraiApi.modelsCache.set(this.sessionKey, fresh);
  NaruZkuraiApi.modelsCacheExpiry.set(
   this.sessionKey,
   now + NaruZkuraiApi.AUTO_TTL_MS,
  );
  return fresh;
 }

 /** Ping `GET <apiBase>/models` and return the list of model ids. */
private async fetchModels(): Promise<ServerModel[]>
{ let lastErr: unknown;
  /* Walk the scheme candidates in preference order (e.g. https then http),*/
  /* so an unauthenticated/TLS-blocked origin falls back to the other scheme.*/
  const attempt = async ( base: string, ): Promise<ServerModel[] | undefined> => {
   const withSlash = base.endsWith("/") ? base : `${base}/`;
   const url = new URL("models", withSlash);
   const headers = this.getHeaders();
   let resp: globalThis.Response;
   /*1*/

   try
   { resp = await naruFetch(this.config.requestOptions)(url,
    { method: "GET", headers, });
   } catch (connectErr)
   { const detail = [
     `[NaruZkurai] GET /v1/models CONNECT FAILED`,
     ` url     : ${url.toString()}`,
     ` method    : GET`,
     ` headers   : ${JSON.stringify(headers)}`,
     ` requestOptions: ${JSON.stringify(this.config.requestOptions)}`,
     ` cause    : ${connectErr instanceof Error ? connectErr.message : String(connectErr)}`,
    ].join("\n");
    throw new Error(detail);
   }
   /*2*/
    if (!resp.ok)
    { let body = "";
      try     { body = (await resp.text()).slice(0, 2000);  }
      catch   { body = "(unreadable body)"; }
      const detail =
      [`[NaruZkurai] GET /v1/models FAILED -> HTTP ${resp.status} ${resp.statusText}`,
      ` url     : ${url.toString()}`,
      ` method    : GET`,
      ` headers   : ${JSON.stringify(headers)}`,
      ` requestOptions: ${JSON.stringify(this.config.requestOptions)}`,
      ` response status: ${resp.status}`,
      ` response body : ${body}`,
      ].join("\n");
      throw new Error(detail);
    }
    const data = await resp.json();
    const list = Array.isArray(data) ? data : data?.data ?? [];
    return list.map(
        (m: any) => typeof m === "string"
        ? { id: m } : { id: m?.id, quant: m?.quant, loaded: m?.loaded === true },
      ).filter((c: any) => typeof c?.id === "string" && !!c.id);
    };

  for (let i = this.resolvedBaseIndex; i < this.baseCandidates.length; i++) {
   try
    { const base = this.baseCandidates[i];
      this.resolvedBaseIndex = i;
      const ids = await attempt(base);
      if (ids) { return ids; }
    } catch (e) { lastErr = e;}
  }
  throw lastErr ?? new Error("no base candidates");
 }

 /**
  * Query `GET /v1/models` and report whether the given model id is currently
  * loaded by the server (`loaded: true`). Providers like Unsloth Studio load
  * models lazily and report `loaded: false` until the weights are in memory,
  * which can take minutes for large 27B models.
  */
 private async fetchModelLoaded(modelId: string): Promise<boolean> {
  const base = this.baseCandidates[this.resolvedBaseIndex] ?? this.apiBase;
  const withSlash = base.endsWith("/") ? base : `${base}/`;
  /* ?_t= busts any CDN/cache so a freshly-loaded model is seen promptly.*/
  const url = new URL(`models?_t=${Date.now()}`, withSlash);
  const headers = this.getHeaders();
  const resp = await naruFetch(this.config.requestOptions)(url,  { method: "GET",  headers, });
  if (!resp.ok) { return false; }
  const data = await resp.json();
  const list = Array.isArray(data) ? data : data?.data ?? [];
const match = list.find((m: any) =>
  { const id = typeof m === "string" ? m : m?.id;
    if (id === modelId) return true;
    if (m && typeof m === "object" && m.quant && m.loaded && !id?.includes(m.quant))
      { return `${id}${NaruZkuraiApi.QUANT_SEP}${m.quant}` === modelId; }
    return false;});
return match != null && typeof match === "object" && match?.loaded === true;
 }

 /**
  * Non-throwing wrapper around {@link fetchModelLoaded}; false on any error.
  */
 private async tryFetchModelLoaded(modelId: string): Promise<boolean> {
  try {
   return await this.fetchModelLoaded(modelId);
  } catch {
   return false;
  }
 }

 /**
  * Trigger a load of `modelId` on the server. Providers like Unsloth Studio
  * expose `POST /v1/load` — without this the model stays `loaded:false` and
  * the first chat request blocks for minutes inside a plain stream with no
  * feedback. Best-effort: a failure here just means the chat request will
  * trigger the lazy load itself.
  */
 private async requestModelLoad(modelId: string, signal: AbortSignal): Promise<void> {
  const base = this.baseCandidates[this.resolvedBaseIndex] ?? this.apiBase;
  const withSlash = base.endsWith("/") ? base : `${base}/`;
  const url = new URL("load", withSlash);
  try {
   await naruFetch(this.config.requestOptions)(url, {
    method: "POST",
    headers: { ...this.getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ model_path: modelId, force_reload: false }),
    signal: signal as any,
   });
  } catch (e) {
   /* Server may not expose /load, or the request was stopped; the chat*/
   /* request lazy-loads instead. A user stop propagates via the signal.*/
   if (signal?.aborted) {
    throw new Error("aborted while requesting model load");
   }
  }
 }

 /**
  * Poll `GET /v1/load-progress` on Unsloth Studio and feed fractional
  * progress (0..1) to `onProgress`. Returns once `phase` is `"ready"`.
 * Waits indefinitely (no timeout) — a slow long prefill is accepted. The
 * only way out is the caller aborting via `signal`.
 */
private async pollLoadProgress(
 onProgress: (fraction: number, text: string) => void,
 signal: AbortSignal,
): Promise<void> {
 const base = this.baseCandidates[this.resolvedBaseIndex] ?? this.apiBase;
 const withSlash = base.endsWith("/") ? base : `${base}/`;
 const url = new URL(`load-progress?_t=${Date.now()}`, withSlash);
 for (;;) {
  if (signal?.aborted) {
   throw new Error("aborted while waiting for model to load");
  }
  let phase: string | null = null;
  let fraction = 0;
  try {
   const resp = await naruFetch(this.config.requestOptions)(url, {
    method: "GET",
    headers: this.getHeaders(),
    signal: signal as any,
   });
   if (resp.ok) {
    const data = await resp.json();
    phase = data?.phase ?? null;
    fraction =
     typeof data?.fraction === "number"
      ? Math.max(0, Math.min(1, data.fraction))
      : 0;
   }
  } catch {
   /* transient: keep polling*/
  }
  onProgress(fraction, phase ?? "");
  if (phase === "ready") {
   return;
  }
  await new Promise((resolve) => {
   const t = setTimeout(resolve, NaruZkuraiApi.MODEL_LOAD_POLL_MS);
   signal?.addEventListener(
    "abort",
    () => {
     clearTimeout(t);
     resolve(undefined);
    },
    { once: true },
   );
  });
 }
 }

 /**
  * How fast we poll the server for load progress while waiting.
  */
 private static readonly MODEL_LOAD_POLL_MS = 2_000;

 /**
  * Ensure the model is loaded: trigger `/v1/load` if it isn't, then poll
  * `/v1/load-progress` (or fall back to `/v1/models` `loaded` flag) until
  * ready. Waits indefinitely — a slow long prefill is accepted. The only
  * way out is the caller aborting via `signal`. Calls `onProgress` with
  * human text for the UI.
  */
 private async waitForModelLoaded(
  modelId: string,
  signal: AbortSignal,
  onProgress: (text: string) => void,
 ): Promise<void> {
  if (signal?.aborted) {
   throw new Error("aborted while waiting for model to load");
  }
  /* Kick off the load explicitly (no-op if already loaded or unsupported).*/
  await this.requestModelLoad(modelId, signal);

  /* Prefer /v1/load-progress if the server exposes it.*/
  let usedProgress = false;
  const base = this.baseCandidates[this.resolvedBaseIndex] ?? this.apiBase;
  const withSlash = base.endsWith("/") ? base : `${base}/`;
  try {
   const probe = await naruFetch(this.config.requestOptions)(
    new URL("load-progress", withSlash),
    { method: "GET", headers: this.getHeaders() },
   );
   usedProgress = probe.ok;
  } catch {
   usedProgress = false;
  }

  const started = Date.now();
  let lastFraction = -1;

  if (usedProgress) {
   await this.pollLoadProgress((fraction, phase) => {
    const pct = Math.round(fraction * 100);
    if (pct !== lastFraction) {
     lastFraction = pct;
     onProgress(
      `[loading model \`${modelId}\` ... ${pct}%${phase ? ` (${phase})` : ""}]`,
     );
    }
   }, signal);
   onProgress(
    `[model \`${modelId}\` loaded in ${Math.round((Date.now() - started) / 1000)}s]`,
   );
   return;
  }

  /* Fallback: poll /v1/models `loaded` flag indefinitely.*/
  for (;;) {
   if (signal?.aborted) {
    throw new Error("aborted while waiting for model to load");
   }
   if (await this.tryFetchModelLoaded(modelId)) {
    onProgress(
     `[model \`${modelId}\` loaded in ${Math.round((Date.now() - started) / 1000)}s]`,
    );
    return;
   }
   await new Promise((resolve) => {
    const t = setTimeout(resolve, NaruZkuraiApi.MODEL_LOAD_POLL_MS);
    signal?.addEventListener(
     "abort",
     () => {
      clearTimeout(t);
      resolve(undefined);
     },
     { once: true },
    );
   });
  }
 }

 /**
  * Resolve `auto` to a concrete model id.
  *
  * Order of preference:
  *  1. in-memory cache (30s) — fastest path
  *  2. persisted session model, if written within the last hour — reuse it
  *   WITHOUT re-pinging /models
  *  3. otherwise ping /models, pick a generation model, and persist it.
  *
  * The persisted model is refreshed at most once per hour (or on error, when
  * the catch below re-pings).
  */
 private async resolveAutoModel(): Promise<string> {
  const now = Date.now();

  /* Never hand back a stale `id:auto` stub — the server would treat `auto` as
     a quant and force a reload. The actual quant is detected later (auto
     quant path) or appended from config (explicit quant path), so the auto
     model must always be bare (`id` or a real `id:quant`), never `id:auto`. */
  const sanitize = (value: string): string =>
   value.toLowerCase().endsWith(`${NaruZkuraiApi.QUANT_SEP}${AUTO}`)
    ? NaruZkuraiApi.stripQuantSuffix(value)
    : value;

  /* 1. In-memory cache.*/
  const cached = NaruZkuraiApi.autoModelCache.get(this.sessionKey);
  const expiry = NaruZkuraiApi.autoModelExpiry.get(this.sessionKey) ?? 0;
  if (cached && now < expiry) {
   emitNotice(`[automode] auto -> \`${sanitize(cached)}\` (cached)`);
   return sanitize(cached);
  }

  /* 2. (Removed) The persisted model from a previous process is NOT trusted
        as "currently loaded" on a fresh session — the server may be running a
        different model now. A fresh session must re-ping /v1/models. The
        persisted file only remains as a fallback when /models fails.*/

  /* 3. No in-process cache (fresh session or TTL expired) -> ping /models and
        pick the currently-loaded model.*/
  try {
const models = await this.fetchModels();
const chosen = this.pickModel(models);
   if (chosen) {
    NaruZkuraiApi.autoModelCache.set(this.sessionKey, chosen);
    NaruZkuraiApi.autoModelExpiry.set(
     this.sessionKey,
     now + NaruZkuraiApi.AUTO_TTL_MS,
    );
    this.writeStoredModel(chosen);
    console.log(
     `[NaruZkurai] automode resolved \`auto\` -> \`${chosen}\` (hourly refresh; request will use it)`,
    );
    emitNotice(`[automode] auto -> \`${chosen}\` (fresh /v1/models ping)`);
    return chosen;
   }
  } catch (e) {
   console.error(
    `[NaruZkurai] GET /v1/models failed (reusing stored model):`, e,
   );
   /* Ping failed (server down / no models): fall through to stored value.*/
  }


  /* Fall back to whatever we last used for this session.*/
  return sanitize(this.readStoredModel() ?? "");
 }

 /** Swap `model: auto` (or missing) for the resolved model, before sending. */
 private async applyAutoModel<T extends { model?: string }>(
  body: T,
 ): Promise<T> {
  if (!NaruZkuraiApi.isAuto(body.model ?? "")) {
   return body;
  }
  const resolved = await this.resolveAutoModel();
  if (resolved) {
   body.model = resolved;
  }
  return body;
 }

 /** Headers sent on raw (non-SDK) requests (e.g. /models, fim, rerank). */
 protected getHeaders(): Record<string, string> {
  return {
   "Content-Type": "application/json",
   Accept: "application/json",
   "x-api-key": this.config.apiKey ?? "",
   Authorization: `Bearer ${this.config.apiKey}`,
  };
 }

 async chatCompletionNonStream(
  body: ChatCompletionCreateParamsNonStreaming,
  signal: AbortSignal,
 ): Promise<ChatCompletion> {
  const prepared = await this.applyAutoModel(body);
  try {
   /* Equivalent of upstream `NaruZkurAIApi.chatCompletionNonStream`: */
   /* NaruZkurAI-compatible SDK client does the POST to `this.apiBase`.*/
   /* Quant: only probe the server's loaded quant when quant is `auto`.*/
   prepared.model = this.quantIsAuto()
    ? await this.resolveLoadedQuant(prepared.model ?? "")
    : this.withQuant(prepared.model ?? "");
   /* Merge provider-defined extra body fields (e.g. `chat_template_kwargs`).*/
   this.injectExtraBodyProperties(prepared);
   return await this.naruzkurai.chat.completions.create(prepared, { signal });
  } catch (err) {
   const detail = [
    `[NaruZkurai] chatCompletionNonStream FAILED`,
    ` base  : ${this.apiBase}`,
    ` head  : ${JSON.stringify(this.getHeaders())}`,
    ` body  : ${JSON.stringify(prepared).slice(0, 4000)}`,
    ` error : ${err instanceof Error ? err.message : String(err)}`,
   ].join("\n");
   throw new Error(detail);
  }
 }

 /**
  * Single attempt of the core chat stream (see {@link chatCompletionStream}).
  *
  * Runs automode + quant resolution ONCE on a copy of `body`, then yields the
  * streamed chunks. Because a tool-call parse failure only ever surfaces
  * before the first chunk is emitted, extracting it into its own generator
  * lets {@link chatCompletionStream} re-run it safely on that specific error.
  */
 private async *_chatCompletionStreamOnce(
  body: ChatCompletionCreateParamsStreaming,
  signal: AbortSignal,
 ): AsyncGenerator<ChatCompletionChunk, any, unknown> {
  try {
   /* Equivalent of upstream `NaruZkurAIApi.chatCompletionStream`: request usage*/
   /* in the final chunk and reorder so a trailing usage chunk is emitted last.*/
   (body as any).stream_options = { include_usage: true };
   /*
    * Model / quant handling — conservative by design:
    *   - only resolve the model (ping /v1/models) when model is `auto`;
    *   - only probe the server's loaded quant when quant is `auto`;
    *   - for an explicit model no /models or /load-progress calls are made.
    * We never try to "set" a model (trigger a load, poll progress) unless the
    * request itself fails — a plain request lazy-loads on the server anyway,
    * and pre-emptively watching `loaded`/quant caused silent stalls.
    */
   if (this.quantIsAuto()) {
    body.model = await this.resolveLoadedQuant(body.model ?? "");
   } else {
    body.model = this.withQuant(body.model ?? "");
   }
   /* Merge provider-defined extra body fields (e.g. `chat_template_kwargs`).*/
   this.injectExtraBodyProperties(body);
   const response = await this.naruzkurai.chat.completions.create(body, {
    signal,
   });
   let lastChunkWithUsage: ChatCompletionChunk | undefined;
   for await (const result of response) {
    /* Check if this chunk contains usage information*/
    if (result.usage) {
     /* Store it to emit after all content chunks*/
     lastChunkWithUsage = result;
    } else {
     yield result;
    }
   }
   /* Emit the usage chunk at the end if we have one*/
   if (lastChunkWithUsage) {
    yield lastChunkWithUsage;
   }
  } catch (err) {
   const detail = [
    `[NaruZkurai] chatCompletionStream FAILED`,
    ` base  : ${this.apiBase}`,
    ` head  : ${JSON.stringify(this.getHeaders())}`,
    ` body  : ${JSON.stringify(body).slice(0, 4000)}`,
    ` error : ${err instanceof Error ? err.message : String(err)}`,
   ].join("\n");
   throw new Error(detail);
  }
 }

 /** The core chat stream with automode resolution (see body). */
 async *chatCompletionStream(
  body: ChatCompletionCreateParamsStreaming,
  signal: AbortSignal,
 ): AsyncGenerator<ChatCompletionChunk, any, unknown> {
  if (NaruZkuraiApi.isAuto(body.model ?? "")) {
   /* Resolve `auto` to the concrete model, but DO NOT inject a visible
      `[automode] resolved ...` thinking chunk into the stream — doing so put
      a noisy notice at the front of every turn that lingered in the chat
      history. Resolution still runs (caching + persistence + body.model),
      and the resolved-model notice is pushed to the agent-invisible notice
      sink (setNoticeSink), which the CLI renders as a footer bubble that the
      agent can never see. */
   const resolved = await this.resolveAutoModel();
   const chosen = resolved || "";
   if (chosen) {
    body.model = chosen;
    NaruZkuraiApi.autoModelCache.set(this.sessionKey, chosen);
    NaruZkuraiApi.autoModelExpiry.set(
     this.sessionKey,
     Date.now() + NaruZkuraiApi.AUTO_TTL_MS,
    );
    this.writeStoredModel(chosen);
   }
  }

  /*
   * Retry loop for the server rejecting a malformed/truncated tool call.
   *
   * llama-server (behind Unsloth Studio) validates each tool call server-side
   * and answers HTTP 500 "Failed to parse tool call arguments as JSON" when a
   * low-quant/speculative model emits a truncated arguments string. That error
   * only ever surfaces before the first chunk is yielded, so re-issuing the
   * request is safe and a fresh generation usually produces a valid tool call.
   * Any other error (or one that surfaces mid-stream) propagates immediately.
   */
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TOOL_CALL_PARSE_MAX_RETRIES; attempt++) {
   if (attempt > 0) {
    console.warn(
      `[NaruZkurai] tool-call args unparseable; retrying chat stream ` +
        `(attempt ${attempt}/${TOOL_CALL_PARSE_MAX_RETRIES})`,
    );
   }
   try {
    for await (const chunk of this._chatCompletionStreamOnce(
      { ...body },
      signal,
    )) {
     yield chunk;
    }
    return;
   } catch (err) {
    if (!isToolCallParseError(err)) {
     throw err;
    }
    lastErr = err;
    /* Failed before any chunk reached the caller — safe to retry, but only
       if the caller hasn't aborted while we were awaiting.*/
    if (signal?.aborted) {
     throw err;
    }
   }
  }
  throw lastErr instanceof Error
   ? new Error(
      `[NaruZkurai] model returned an unparseable tool call after ` +
        `${TOOL_CALL_PARSE_MAX_RETRIES + 1} attempts: ` +
        `${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
     )
   : lastErr;
 }

 async completionNonStream(
  body: CompletionCreateParamsNonStreaming,
  signal: AbortSignal,
 ): Promise<Completion> {
  /* Equivalent of upstream `NaruZkurAIApi.completionNonStream`.*/
  return this.naruzkurai.completions.create(await this.applyAutoModel(body), {
   signal,
  });
 }

 async *completionStream(
  body: CompletionCreateParamsStreaming,
  signal: AbortSignal,
 ): AsyncGenerator<Completion, any, unknown> {
  /* Equivalent of upstream `NaruZkurAIApi.completionStream`.*/
  const response = await this.naruzkurai.completions.create(
   await this.applyAutoModel(body),
   { signal },
  );
  for await (const result of response) {
   yield result;
  }
 }

 async *fimStream(
  body: FimCreateParamsStreaming,
  signal: AbortSignal,
 ): AsyncGenerator<ChatCompletionChunk, any, unknown> {
  const prepared = await this.applyAutoModel(body);
  /* Equivalent of upstream `NaruZkurAIApi.fimStream`: */
  /* POST to the `fim/completions` endpoint. Uses `naruFetch` (the passthrough fetch that*/
  /* never strips auth/custom headers) so custom headers keep reaching the server.*/
  const endpoint = new URL("fim/completions", this.apiBase);
  const resp = await naruFetch(this.config.requestOptions)(endpoint, {
   method: "POST",
   body: JSON.stringify({
    model: prepared.model,
    prompt: prepared.prompt,
    suffix: prepared.suffix,
    max_tokens: prepared.max_tokens,
    max_completion_tokens: (prepared as any).max_completion_tokens,
    temperature: prepared.temperature,
    top_p: prepared.top_p,
    frequency_penalty: prepared.frequency_penalty,
    presence_penalty: prepared.presence_penalty,
    stop: prepared.stop,
    stream: true,
   }),
   headers: this.getHeaders(),
   signal,
  });
  for await (const chunk of streamSse(resp as any)) {
   if (chunk.choices && chunk.choices.length > 0) {
    yield chunk;
   }
  }
 }
  /* Equivalent of upstream `OpenAi.embed`.*/

 async embed(body: NaruZkurAI.Embeddings.EmbeddingCreateParams): Promise<NaruZkurAI.Embeddings.CreateEmbeddingResponse>
 { return this.naruzkurai.embeddings.create(await this.applyAutoModel(body)); }

/*|S|----------------------NZK----------------------|S|*/
 /* rerank ~= `Openai.rerank`: POST to the `rerank` endpoint*/
 /* with `naruFetch` (passthrough) so custom headers reach the server.*/
 /* responce = post, json, headers */
/* naruzkurai.models.list ~= `Openai.list`.*/

 async rerank(body: RerankCreateParams): Promise<CreateRerankResponse>
 { const prepared = await this.applyAutoModel(body);
  const endpoint = new URL("rerank", this.apiBase);
  const response = await naruFetch(this.config.requestOptions)(endpoint, {method: "POST", body: JSON.stringify(prepared), headers: this.getHeaders(),});
  const data = await response.json(); return data as CreateRerankResponse; }
 async list(): Promise<Model[]> { return (await this.naruzkurai.models.list()).data; }
}

/*|E|----------------------NZK----------------------|E|*/

/*|E|----------------------NZK----------------------|E|*/
