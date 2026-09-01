import { parseAssistantUnrolled } from "@continuedev/config-yaml";
import { describe, expect, it } from "vitest";
import { NaruZkuraiApi } from "../apis/naruzkurai.js";

// ---------------------------------------------------------------------------
// LIVE integration test — pre-loaded quant must NOT trigger a reload.
//
// Uses the REAL config.yaml (`quant: UD-Q2_K_XL`) parsed through the real
// config-yaml package, and talks to the REAL server (llm.echoshouse.ca).
//
// PASS criterion: within 20s the provider must POST /chat/completions and
// stream actual content. If the only observable output is a
// "[loading model ...]" note and no content chunk arrives within 20s, the
// test FAILS.
//
// This test is deliberately NOT skipped when the server/API key is bad — an
// invalid key or unreachable server surfaces as a FAILURE here (with the
// underlying error), not a silent skip. That is the point: "if it only
// loading-loads and no chat response => fail".
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

// 20s deadline for a real (non-loading) chat response.
const RESPONSE_DEADLINE_MS = 20_000;

describe("NaruZkurai live: pre-loaded quant is reused, not reloaded", () => {
  it(
    "streams a chat response within 20s without forcing a reload",
    async () => {
      const assistant = parseAssistantUnrolled(REAL_CONFIG_YAML);
      const model = assistant.models?.[0];
      expect(model, "yaml must parse a model").toBeTruthy();
      const raw = model as unknown as Record<string, unknown>;

      // Build the provider config straight from the parsed yaml model.
      const config = {
        provider: "naruzkurai",
        model: raw.model,
        quant: raw.quant,
        apiURL: raw.apiURL,
        apiBase: raw.apiBase,
        ApiHttpOrHttps: raw.ApiHttpOrHttps,
        apiKey: raw.apiKey,
        requestOptions: raw.requestOptions,
      } as never;

      const api = new NaruZkuraiApi(config);

      let sawLoadingNote = false;
      let sawServerChunk = false; // any real SSE chunk from the server
      let loadingText = "";

      try {
        for await (const chunk of api.chatCompletionStream(
          {
            model: raw.model as string,
            messages: [{ role: "user", content: "Reply with the single word: ok" }],
            stream: true,
          },
          new AbortController().signal,
        )) {
          const delta = chunk.choices?.[0]?.delta as
            | { content?: string; reasoning_content?: string }
            | undefined;

          if (delta?.reasoning_content?.includes("loading model")) {
            sawLoadingNote = true;
            loadingText = delta.reasoning_content;
          }
          // Any substantive delta (content or reasoning) means the server is
          // actually streaming a response — the model was NOT reloaded (the
          // reload path emits only "[loading model ...]" notes).
          if (
            (typeof delta?.content === "string" && delta.content.length > 0) ||
            (typeof delta?.reasoning_content === "string" &&
              delta.reasoning_content.length > 0)
          ) {
            sawServerChunk = true;
            break;
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        if (sawLoadingNote && !sawServerChunk) {
          throw new Error(
            "FAIL: adapter entered '[loading model]' (forced reload) and " +
              `never streamed a server response.\n\nloading note:\n${loadingText}\n\ncause: ${detail}\n` +
              "The configured model:quant is reported loaded by the server, " +
              "so the adapter must POST /chat/completions and stream directly.",
          );
        }
        // No loading note either: the request failed for another reason
        // (bad key, server down, etc.). Surface it loudly.
        throw new Error(`FAIL: chat request errored before any content: ${detail}`);
      }

      expect(
        sawServerChunk,
        `expected a real server stream chunk within ${RESPONSE_DEADLINE_MS}ms` +
          (sawLoadingNote ? `; only '[loading model]' was seen:\n${loadingText}` : ""),
      ).toBe(true);
    },
    RESPONSE_DEADLINE_MS,
  );
});
