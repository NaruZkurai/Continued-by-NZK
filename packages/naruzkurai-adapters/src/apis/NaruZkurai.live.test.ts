/**
 * Live integration test for the NaruZkurai provider automode flow.
 *
 * Uses the user's real config shape — an NaruZkurAI-compatible endpoint with
 * `model: "auto"` — and drives a correct streaming chat request end to end:
 *
 *  1. `apiBase` is passed exactly as the user wrote it (here `http://...`).
 *   The adapter forces the outbound requests to HTTPS internally, because
 *   the Cloudflare-protected origin `llm.echoshouse.ca` only answers over
 *   TLS (plain HTTP returns Cloudflare 522, verified by curl).
 *  2. `model: "auto"` triggers the automode `/v1/models` ping, picks a
 *   generation model, and yields a `reasoning_content` thinking notice
 *   chunk BEFORE the real assistant stream.
 *  3. The remaining chunks stream real assistant content from the chosen
 *   model.
 *
 * Guarded by env vars and skipped when not set:
 *  - NARUZKURAI_API_KEY (required)
 *  - NARUZKURAI_API_BASE (optional; defaults to http://llm.echoshouse.ca/v1)
 *
 * Run:
 *  NARUZKURAI_API_KEY=sk-... npx vitest packages/naruzkurai-adapters/src/apis/NaruZkurai.live.test.ts
 *  (or: -- --testTimeout=300000 for long prompts)
 */

import { ChatCompletionCreateParamsStreaming } from "naruzkurai/resources/index";
import { describe, expect, test } from "vitest";

import { NaruZkuraiApi } from "./naruzkurai.js";

const API_KEY = process.env.NARUZKURAI_API_KEY;
const API_URL =
 process.env.NARUZKURAI_API_URL ?? "192.168.2.64:6465/v1";
const PROMPT =
 process.env.NARUZKURAI_PROMPT ??
 "Reply with exactly: automode-ok";

const SKIP = !API_KEY
 ? "set NARUZKURAI_API_KEY to run the live NaruZkurai automode test"
 : false;

function buildConfig({
 apiURL = API_URL,
 apiBase,
 ApiHttpOrHttps = "http",
}: {
 apiURL?: string;
 apiBase?: string;
 ApiHttpOrHttps?: boolean | string;
} = {}) {
 return {
  provider: "naruzkurai" as const,
  apiKey: API_KEY!,
  baseURL: apiURL ?? apiBase,
  apiURL,
  ...(apiBase ? { apiBase } : {}),
  ApiHttpOrHttps,
  model: "auto",
  requestOptions: {
   headers: {
    "User-Agent": "Continue/2.0.0",
    "X-Custom-Header": "nzk-co",
    "X-Organization-Id": "org-nzk",
   },
  },
 };
}

describe.skipIf(SKIP)("NaruZkuraiApi automode live", () => {
 test("apiURL is preferred over apiBase", () =>
 { const api = new NaruZkuraiApi(
   buildConfig({
    apiURL: "https://override.example.com/v1",
    apiBase: "http://apiURL_is_preferred_over_apiBase.exampl:6465/v1",
    ApiHttpOrHttps: false,
   }),
  );
  expect(api["apiBase"]).toBe("https://override.example.com/v1");
 });

 test("ApiHttpOrHttps forces the scheme", () => {
  const https = new NaruZkuraiApi( buildConfig({ apiURL: "http://192.168.2.64:6465/v1", ApiHttpOrHttps: "https" }),);
  expect(https["apiBase"]).toBe("https://192.168.2.64:6465/v1");

  const http = new NaruZkuraiApi( buildConfig({ apiURL: "https://192.168.2.64:6465/v1", ApiHttpOrHttps: "HTTP" }),);
  expect(http["apiBase"]).toBe("http://192.168.2.64:6465/v1");
 });

 test("ApiHttpOrHttps prepends scheme when apiURL has none", () => {
  const api = new NaruZkuraiApi(buildConfig({ apiURL: "192.168.2.64:6465/v1", ApiHttpOrHttps: "http" }),);
  expect(api["apiBase"]).toBe("http://192.168.2.64:6465/v1");
 });

 test("auto resolves a model, shows a thinking notice, and streams real content", async () => {
  const api = new NaruZkuraiApi(buildConfig());
  const body: ChatCompletionCreateParamsStreaming = {model: "auto",messages: [{ role: "user", content: PROMPT }],stream: true,};

  const chunks: any[] = [];
  const stream = api.chatCompletionStream(body, new AbortController().signal);

  let sawAutomodeNotice = false;
  let sawAssistantContent = "";
  for await (const chunk of stream)
  { chunks.push(chunk);
   const delta = (chunk as any)?.choices?.[0]?.delta ?? {};
   if (typeof delta.reasoning_content === "string")
   {// The synthetic automode notice chunk.
    if (delta.reasoning_content.startsWith("[automode]")) {sawAutomodeNotice = true;}
   }
   if (typeof delta.content === "string") {sawAssistantContent += delta.content;}
  }

  // The automode notice must appear as a reasoning/thinking chunk.
  expect(sawAutomodeNotice).toBe(true);
  // Real assistant content must stream back from the resolved model.
  expect(sawAssistantContent.trim().length).toBeGreaterThan(0);

  // The resolved model must persist in the auto-model cache for the apiBase.
  const resolved = NaruZkuraiApi["autoModelCache"].get(api["sessionKey"]);
  expect(resolved).toBeTruthy();
  expect(resolved).not.toBe("auto");
 });
});
