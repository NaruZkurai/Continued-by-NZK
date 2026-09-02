import { parseAssistantUnrolled } from "@continuedev/config-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NaruZkuraiApi } from "../apis/naruzkurai.js";

// ---------------------------------------------------------------------------
// Pre-loaded quant reuse — model detection without a reload (HERMETIC).
//
// The user's real config.yaml sets `quant: UD-Q2_K_XL`. The provider must:
//   1. parse `quant` from the yaml, and
//   2. when the server reports that exact `model:quant` (via /v1/models with
//      `{id, quant, loaded}`) as `loaded: true`, POST /chat/completions and
//      STREAM content directly — it must NOT emit a `[loading model ...]`
//      note or force a reload.
//
// The outbound network is mocked by stubbing @continuedev/fetch's
// `fetchwithRequestOptions`, which is what `naruFetch` (and the SDK client)
// actually call. No real network happens; the yaml is the user's real config
// parsed through the real config-yaml package.
// ---------------------------------------------------------------------------

const REAL_CONFIG_YAML = `
name: VPM Shop Config
version: 1.0.0
schema: v1
models:
  - name: (Ornith)
    provider: naruzkurai
    model: peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF
    quant: UD-Q2_K_XL
    ApiHttpOrHttps: "http"
    apiURL: llm.echoshouse.ca/v1
    apiKey: sk-unsloth-c8b0723ad0e31df430a2ff2853acb84cs
    contextLength: 128000
    capabilities: [tool_use]
    requestOptions:
      headers:
        User-Agent: Continue/2.0.0
        X-Custom-Header: nzk-co
        X-Organization-Id: org-nzk
    defaultCompletionOptions:
      maxTokens: 16000
    roles: [chat, edit, apply]
`;

const fetchwMock = vi.fn();

vi.mock("@continuedev/fetch", async () => {
  const actual = await vi.importActual<typeof import("@continuedev/fetch")>(
    "@continuedev/fetch",
  );
  return {
    ...actual,
    fetchwithRequestOptions: (...args: unknown[]) => fetchwMock(...args),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonlStreamResponse(chunks: unknown[]): Response {
  const body = chunks
    .map((c) => `data: ${JSON.stringify(c)}\n\n`)
    .join("")
    .concat("data: [DONE]\n\n");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeChunk(id: number, content?: string, usage?: unknown) {
  return {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: 1,
    model: "peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF:UD-Q2_K_XL",
    choices: [
      {
        index: 0,
        delta: content !== undefined ? { role: "assistant", content } : {},
        finish_reason: content === undefined ? "stop" : null,
      },
    ],
    usage: usage ?? undefined,
  };
}

function makeConfig() {
  const assistant = parseAssistantUnrolled(REAL_CONFIG_YAML);
  const m = assistant.models![0] as unknown as Record<string, unknown>;
  return {
    provider: "naruzkurai",
    model: m.model,
    quant: m.quant,
    apiURL: m.apiURL,
    apiBase: m.apiBase,
    ApiHttpOrHttps: m.ApiHttpOrHttps,
    apiKey: m.apiKey,
    requestOptions: m.requestOptions,
  } as never;
}

type FetchCall = { url: string; init?: any };
function route(calls: FetchCall[]) {
  fetchwMock.mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push({ url, init });
    if (url.includes("/models")) {
      return jsonResponse({
        data: [
          {
            id: "peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF",
            quant: "UD-Q2_K_XL",
            loaded: true,
          },
        ],
      });
    }
    if (url.includes("/load") && !url.includes("load-progress")) {
      calls.push({ url: "LOAD_CALLED" });
      return jsonResponse({ ok: true });
    }
    if (url.includes("/chat/completions")) {
      return jsonlStreamResponse([
        makeChunk(1, "hell"),
        makeChunk(2, "o"),
        makeChunk(3, undefined, { total_tokens: 3 }),
      ]);
    }
    return jsonResponse({ error: `unhandled ${url}` }, 404);
  });
}

describe("NaruZkurai pre-loaded quant reuse (hermetic)", () => {
  beforeEach(() => {
    fetchwMock.mockReset();
    vi.clearAllMocks();
    (NaruZkuraiApi as unknown as { modelsCache?: { clear: () => void } }).modelsCache?.clear?.();
    (NaruZkuraiApi as unknown as { modelsCacheExpiry?: { clear: () => void } }).modelsCacheExpiry?.clear?.();
    (NaruZkuraiApi as unknown as { autoModelCache?: { clear: () => void } }).autoModelCache?.clear?.();
    (NaruZkuraiApi as unknown as { autoModelExpiry?: { clear: () => void } }).autoModelExpiry?.clear?.();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("streams content WITHOUT a loading note or /load when model:quant is already loaded", async () => {
    const calls: FetchCall[] = [];
    route(calls);

    const api = new NaruZkuraiApi(makeConfig());
    const chunks: string[] = [];
    let sawLoadingNote = false;

    for await (const chunk of api.chatCompletionStream(
      {
        model: "peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      },
      new AbortController().signal,
    )) {
      const delta = chunk.choices?.[0]?.delta as
        | { content?: string; reasoning_content?: string }
        | undefined;
      if (delta?.reasoning_content?.includes("loading model")) {
        sawLoadingNote = true;
      }
      chunks.push(delta?.content ?? "");
    }

    expect(chunks.join("")).toContain("hello");
    expect(sawLoadingNote).toBe(false);
    expect(calls.some((c) => c.url.includes("/chat/completions"))).toBe(true);
    expect(calls.some((c) => c.url === "LOAD_CALLED")).toBe(false);
  });

  it("posts the model:quant form to /chat/completions", async () => {
    const calls: FetchCall[] = [];
    route(calls);

    const api = new NaruZkuraiApi(makeConfig());
    for await (const _ of api.chatCompletionStream(
      {
        model: "peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      },
      new AbortController().signal,
    )) {
      /* drain */
    }

    const chatCall = calls.find((c) => c.url.includes("/chat/completions"));
    expect(chatCall).toBeTruthy();
    const body = JSON.parse(chatCall!.init?.body ?? "{}");
    // The request model must carry the quant, so the server reuses the loaded
    // weights instead of loading a fresh quant.
    expect(body.model).toBe(
      "peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF:UD-Q2_K_XL",
    );
  });
});

// ---------------------------------------------------------------------------
// Auto model + auto quant — the resolved model must carry a REAL detected
// quant, never a literal `auto` stub.
//
// A stale `user.auto:naruzkurai-auto-model.json` entry can hold
// `model:auto` (from an earlier buggy run). The provider must strip it and
// detect the loaded quant from /v1/models — otherwise the server sees
// `model:auto`, treats it as "auto", and force-reloads.
// ---------------------------------------------------------------------------

const AUTO_QUANT_YAML = `
name: VPM Shop Config
version: 1.0.0
schema: v1
models:
  - name: (chat)
    provider: naruzkurai
    model: auto
    quant: auto
    ApiHttpOrHttps: "http"
    apiURL: llm.echoshouse.ca/v1
    apiKey: sk-unsloth-c8b0723ad0e31df430a2ff2853acb84cs
    contextLength: 128000
    capabilities: [tool_use]
    requestOptions:
      headers:
        User-Agent: Continue/2.0.0
        X-Custom-Header: nzk-co
        X-Organization-Id: org-nzk
    defaultCompletionOptions:
      maxTokens: 16000
    roles: [chat, edit, apply]
`;

const NODE_FS = await import("node:fs");
const NODE_OS = await import("node:os");
const NODE_PATH = await import("node:path");

function makeAutoQuantConfig() {
  const assistant = parseAssistantUnrolled(AUTO_QUANT_YAML);
  const m = assistant.models![0] as unknown as Record<string, unknown>;
  return {
    provider: "naruzkurai",
    model: m.model,
    quant: m.quant,
    apiURL: m.apiURL,
    apiBase: m.apiBase,
    ApiHttpOrHttps: m.ApiHttpOrHttps,
    apiKey: m.apiKey,
    requestOptions: m.requestOptions,
  } as never;
}

describe("NaruZkurai auto model + auto quant (hermetic)", () => {
  const modelFile = NODE_PATH.join(
    NODE_OS.homedir(),
    ".continue",
    "naruzkurai-auto-model.json",
  );
  const sessionKey = "http://llm.echoshouse.ca/v1/";

  beforeEach(() => {
    fetchwMock.mockReset();
    vi.clearAllMocks();
    (NaruZkuraiApi as unknown as { modelsCache?: { clear: () => void } }).modelsCache?.clear?.();
    (NaruZkuraiApi as unknown as { modelsCacheExpiry?: { clear: () => void } }).modelsCacheExpiry?.clear?.();
    (NaruZkuraiApi as unknown as { autoModelCache?: { clear: () => void } }).autoModelCache?.clear?.();
    (NaruZkuraiApi as unknown as { autoModelExpiry?: { clear: () => void } }).autoModelExpiry?.clear?.();
    // Seed a stale `model:auto` so the bug reproduces: the buggy code reused it
    // verbatim and sent `...:auto` to the server.
    try {
      NODE_FS.mkdirSync(NODE_PATH.dirname(modelFile), { recursive: true });
      NODE_FS.writeFileSync(
        modelFile,
        JSON.stringify({ [sessionKey]: { model: "unsloth/Qwen3.5-0.8B-MTP-GGUF:auto", ts: Date.now() } }),
        "utf8",
      );
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("strips a stale `:auto` and posts the real detected quant", async () => {
    const calls: FetchCall[] = [];
    fetchwMock.mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      calls.push({ url, init });
      if (url.includes("/models")) {
        return jsonResponse({
          data: [
            {
              id: "unsloth/Qwen3.5-0.8B-MTP-GGUF",
              quant: "Q4_K_M",
              loaded: true,
            },
          ],
        });
      }
      if (url.includes("/chat/completions")) {
        return jsonlStreamResponse([
          makeChunk(1, "hell"),
          makeChunk(2, "o"),
          makeChunk(3, undefined, { total_tokens: 3 }),
        ]);
      }
      return jsonResponse({ error: `unhandled ${url}` }, 404);
    });

    const api = new NaruZkuraiApi(makeAutoQuantConfig());

    // Drain the stream; the /models + stored-model resolution must produce a
    // real quant, not the stale `:auto` stub.
    const collected: string[] = [];
    for await (const chunk of api.chatCompletionStream(
      { model: "auto", messages: [{ role: "user", content: "hi" }], stream: true },
      new AbortController().signal,
    )) {
      const delta = chunk.choices?.[0]?.delta as
        | { content?: string; reasoning_content?: string }
        | undefined;
      collected.push(delta?.content ?? "");
    }

    expect(collected.join("")).toContain("hello");

    const chatCall = calls.find((c) => c.url.includes("/chat/completions"));
    expect(chatCall).toBeTruthy();
    const body = JSON.parse(chatCall!.init?.body ?? "{}");
    // Must carry the REAL loaded quant — never `:auto`.
    expect(body.model).toBe("unsloth/Qwen3.5-0.8B-MTP-GGUF:Q4_K_M");
    // No explicit /load POST to force a reload.
    expect(calls.some((c) => c.url === "LOAD_CALLED")).toBe(false);
  });
});

