import { fetchwithRequestOptions, patchedFetch } from "@continuedev/fetch";
import type { RequestOptions } from "@continuedev/config-types";
import { OpenAI } from "openai/index";
import { z } from "zod";
import { OpenAIConfigSchema } from "../types.js";
import { OpenAIApi } from "./OpenAI.js";

/**
 * NaruZkurai - a provider built as a thin patch over the OpenAI provider.
 *
 * The only differences from upstream `OpenAIApi` are the two behavior fixes
 * needed for a custom OpenAI-compatible inference server:
 *
 *  1. NEVER strip/delete `Authorization`, `x-api-key`, or any custom headers.
 *     (Upstream `customFetch()` deletes default auth headers when it thinks a
 *      custom one is present; that breaks this server, so we use a passthrough
 *      fetch that forwards every header untouched.)
 *
 *  2. Forward `requestOptions.headers` to the OpenAI SDK on every request via
 *     `defaultHeaders`, so a custom `User-Agent` and any other custom headers
 *     (X-Custom-Header, X-Organization-Id, ...) actually reach the server.
 */
export class NaruZkuraiApi extends OpenAIApi {
  constructor(protected config: z.infer<typeof OpenAIConfigSchema>) {
    super(config);
    this.apiBase = config.apiBase ?? this.apiBase;

    // Patch 2: forward custom request headers on every SDK request
    this.openai = new OpenAI({
      // Necessary because `new OpenAI()` will throw an error if there is no API Key
      apiKey: config.apiKey ?? "",
      baseURL: this.apiBase,
      // Patch 1: passthrough fetch that never strips auth/custom headers
      fetch: naruFetch(config.requestOptions),
      timeout: config?.requestOptions?.timeout || undefined,
      defaultHeaders: config?.requestOptions?.headers,
    });
  }
}

/**
 * A copy of upstream `customFetch()` (from util.ts) that OMITS the
 * `letRequestOptionsOverrideAuthHeaders` stripping step. Every header is
 * forwarded to the underlying fetch unchanged.
 */
function naruFetch(
  requestOptions: RequestOptions | undefined,
): typeof patchedFetch {
  if (process.env.FEATURE_FLAG_DISABLE_CUSTOM_FETCH) {
    return patchedFetch;
  }

  return (req: URL | string | Request, init?: any) => {
    if (typeof req === "string" || req instanceof URL) {
      return fetchwithRequestOptions(req, init, requestOptions);
    } else {
      return fetchwithRequestOptions(req.url, init, requestOptions);
    }
  };
}
