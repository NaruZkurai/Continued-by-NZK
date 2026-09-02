import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NaruZkuraiApi } from "../apis/naruzkurai.js";

// ---------------------------------------------------------------------------
// Tool-call argument parse retry (HERMETIC).
//
// A low-quant / speculative model occasionally emits a tool call whose
// `arguments` JSON is truncated or malformed (e.g. ends mid-string). llama-
// server (behind Unsloth Studio) validates the tool call server-side and
// answers HTTP 500:
//
//   Failed to parse tool call arguments as JSON: [json.exception.parse_error.101]
//   ... unexpected end of input; expected '[', '{', or a literal
//
// Because that error surfaces before the first chunk is ever yielded, the
// provider is allowed to re-issue the request (a fresh generation usually
// produces a well-formed tool call). These tests pin that retry behaviour:
//   1. a 500-style parse error is retried and the request eventually streams OK,
//   2. a non-parse error (e.g. an unrelated 400) is NOT retried,
//   3. a persistent parse error past the max retries surfaces a clear error.
//
// The outbound network is mocked by stubbing @continuedev/fetch's
// `fetchwithRequestOptions`, which is what `naruFetch` (and the SDK client)
// actually call. No real network happens.
// ---------------------------------------------------------------------------

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

function toolCallParseErrorResponse(): Response {
  return jsonResponse(
    {
      error: {
        code: 500,
        message:
          "Failed to parse tool call arguments as JSON: " +
          "[json.exception.parse_error.101] parse error at line 1, " +
          "column 13: syntax error while parsing value - unexpected end " +
          "of input; expected '[', '{', or a literal",
        type: "server_error",
      },
    },
    500,
  );
}

function unrelatedErrorResponse(): Response {
  return jsonResponse({ error: { message: "model not found" } }, 404);
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

function makeContentChunk(id: number, content: string) {
  return {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: 1,
    model: "some/model",
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content },
        finish_reason: null,
      },
    ],
  };
}

function makeStopChunk(id: number, usage?: unknown) {
  return {
    id: `chatcmpl-${id}`,
    object: "chat.completion.chunk",
    created: 1,
    model: "some/model",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: usage ?? { total_tokens: 5 },
  };
}

function makeConfig() {
  return {
    provider: "naruzkurai",
    model: "some/model",
    quant: "",
    apiURL: "llm.echoshouse.ca/v1",
    apiBase: undefined,
    ApiHttpOrHttps: "http",
    apiKey: "sk-test",
    requestOptions: undefined,
  } as never;
}

async function runStream(
  api: NaruZkuraiApi,
  responses: (() => Response)[],
  excess?: () => Response,
) {
  const counter = { n: 0 };
  fetchwMock.mockReset();
  fetchwMock.mockImplementation(async (input: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.includes("/models")) {
      return jsonResponse({ data: [{ id: "some/model", loaded: true }] });
    }
    if (url.includes("/chat/completions")) {
      counter.n += 1;
      // Note: the NaruZkurAI SDK internally retries 5xx a few times, so the
      // total number of /chat/completions hits will exceed our supplied list.
      const response = responses[counter.n - 1];
      if (!response) {
        if (excess) {
          return excess();
        }
        return jsonResponse({ error: "unexpected extra call" }, 404);
      }
      return response();
    }
    return jsonResponse({ error: `unhandled ${url}` }, 404);
  });

  const out: string[] = [];
  for await (const chunk of api.chatCompletionStream(
    {
      model: "some/model",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    },
    new AbortController().signal,
  )) {
    const delta = (chunk.choices?.[0]?.delta ?? {}) as { content?: string };
    if (typeof delta.content === "string") {
      out.push(delta.content);
    }
  }
  return { text: out.join(""), chatCalls: counter.n };
}

describe("NaruZkurai tool-call argument parse retry (hermetic)", () => {
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

  it("retries a tool-call parse error and streams OK on a later attempt", async () => {
    const api = new NaruZkuraiApi(makeConfig());
    // First call 500s with the parse error; second call succeeds.
    const result = await runStream(api, [toolCallParseErrorResponse, () =>
      jsonlStreamResponse([
        makeContentChunk(2, "hello"),
        makeStopChunk(3),
      ]),
    ]);

    expect(result.chatCalls).toBe(2);
    expect(result.text).toBe("hello");
  });

  it("does NOT retry an unrelated (non-parse) error", async () => {
    const api = new NaruZkuraiApi(makeConfig());
    await expect(
      (async () => {
        await runStream(api, [unrelatedErrorResponse]);
      })(),
    ).rejects.toThrow();
    const counter = (fetchwMock.mock.calls.filter((c: any) =>
      String(c[0]?.url ?? c[0]).includes("/chat/completions"),
    )).length;
    expect(counter).toBe(1);
  });

  it("surfaces a clear error when the parse error persists past max retries", async () => {
    const api = new NaruZkuraiApi(makeConfig());
    const parseErr = toolCallParseErrorResponse;
    await expect(
      (async () => {
        // Keep returning the same parse error for every hit (the SDK also
        // internally retries 5xx), so the provider's own retries exhaust and
        // it must surface its clear final error instead of a raw 500.
        await runStream(api, [parseErr, parseErr, parseErr], parseErr);
      })(),
    ).rejects.toThrow(/unparseable tool call/);
  });
});
