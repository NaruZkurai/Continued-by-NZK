import { parseAssistantUnrolled } from "@continuedev/config-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearNoticeSink,
    NaruZkuraiApi,
    setNoticeSink,
} from "../apis/naruzkurai.js";

// ---------------------------------------------------------------------------
// Agent-invisible request-notification sink (HERMETIC).
//
// When `model: auto`, the provider resolves the model and must:
//   1. push a human notice ("auto -> <model>") to the registered
//      `noticeSink`, so the CLI can render an agent-invisible footer bubble;
//   2. NOT inject a `[automode]` thinking chunk into the stream (the agent
//      must never see the notice in its own context).
// ---------------------------------------------------------------------------

const AUTO_CONFIG_YAML = `
name: Automode Config
version: 1.0.0
schema: v1
models:
  - name: (Auto)
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
    defaultCompletionOptions:
      maxTokens: 16000
    roles: [chat, edit, apply]
`;

const LOADED_MODEL_ID = "peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF";

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
        model: `${LOADED_MODEL_ID}:Q4_K_M`,
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
    const assistant = parseAssistantUnrolled(AUTO_CONFIG_YAML);
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

function route() {
    fetchwMock.mockImplementation(async (input: any, init?: any) => {
        const url = typeof input === "string" ? input : input?.url ?? String(input);
        if (url.includes("/models")) {
            return jsonResponse({
                data: [
                    {
                        id: LOADED_MODEL_ID,
                        quant: "Q4_K_M",
                        loaded: true,
                    },
                    { id: "foo/autocomplete-7b", loaded: true },
                ],
            });
        }
        if (url.includes("/chat/completions")) {
            return jsonlStreamResponse([
                makeChunk(1, "hello"),
                makeChunk(2, undefined, { total_tokens: 3 }),
            ]);
        }
        return jsonResponse({ error: `unhandled ${url}` }, 404);
    });
}

describe("NaruZkurai automode notice sink (hermetic)", () => {
    beforeEach(() => {
        fetchwMock.mockReset();
        vi.clearAllMocks();
        clearNoticeSink();
        (NaruZkuraiApi as unknown as {
            autoModelCache?: { clear: () => void };
            autoModelExpiry?: { clear: () => void };
            modelsCache?: { clear: () => void };
            modelsCacheExpiry?: { clear: () => void };
        }).autoModelCache?.clear?.();
        (NaruZkuraiApi as unknown as {
            autoModelCache?: { clear: () => void };
            autoModelExpiry?: { clear: () => void };
        }).autoModelExpiry?.clear?.();
        (NaruZkuraiApi as unknown as {
            modelsCache?: { clear: () => void };
            modelsCacheExpiry?: { clear: () => void };
        }).modelsCache?.clear?.();
        (NaruZkuraiApi as unknown as {
            modelsCache?: { clear: () => void };
            modelsCacheExpiry?: { clear: () => void };
        }).modelsCacheExpiry?.clear?.();
        clearNoticeSink();
    });

    afterEach(() => {
        clearNoticeSink();
        vi.clearAllMocks();
    });

    it("emits an automode notice to the sink but never into the stream", async () => {
        route();
        const api = new NaruZkuraiApi(makeConfig());

        const notices: string[] = [];
        setNoticeSink((text) => notices.push(text));

        const streamContent: string[] = [];
        let sawAutomodeChunk = false;

        for await (const chunk of api.chatCompletionStream(
            {
                model: "auto",
                messages: [{ role: "user", content: "hi" }],
                stream: true,
            },
            new AbortController().signal,
        )) {
            const delta = chunk.choices?.[0]?.delta as
                | { content?: string; reasoning_content?: string }
                | undefined;
            if (typeof delta?.reasoning_content === "string" &&
                delta.reasoning_content.startsWith("[automode]")) {
                sawAutomodeChunk = true;
            }
            streamContent.push(delta?.content ?? "");
        }

        // The sink received the resolution notice (agent-invisible path).
        expect(notices.length).toBeGreaterThan(0);
        expect(notices.some((n) => n.includes(LOADED_MODEL_ID))).toBe(true);

        // The agent must never see it: no [automode] chunk in the stream.
        expect(sawAutomodeChunk).toBe(false);
        expect(streamContent.join("")).toContain("hello");

        // The request actually used the resolved model.
        const chatCall = fetchwMock.mock.calls.find((args) =>
            String(args[0] ?? "").includes("/chat/completions"),
        );
        const postedBody = JSON.parse(chatCall?.[1]?.body ?? "{}");
        expect(postedBody.model).toContain(LOADED_MODEL_ID);
    });

    it("is a no-op when no sink is registered", async () => {
        route();
        const api = new NaruZkuraiApi(makeConfig());
        clearNoticeSink();
        // Must not throw.
        for await (const chunk of api.chatCompletionStream(
            {
                model: "auto",
                messages: [{ role: "user", content: "hi" }],
                stream: true,
            },
            new AbortController().signal,
        )) {
            void chunk;
        }
    });
});
