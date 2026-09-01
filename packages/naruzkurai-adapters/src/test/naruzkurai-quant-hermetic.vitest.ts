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
