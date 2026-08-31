import { LLMOptions } from "../../index.js";
import OpenAI from "./OpenAI.js";

/**
 * NaruZkurai - core LLM class for the `naruzkurai` provider.
 *
 * This is a thin patch over the upstream `OpenAI` LLM class. It only changes
 * the provider name so that config `provider: "naruzkurai"` routes through
 * the OpenAI-compatible stack and, crucially, is resolved to the patched
 * `NaruZkuraiApi` in `@continuedev/openai-adapters` (via `constructLlmApi`),
 * which forwards custom headers and never strips auth/custom headers.
 */
class NaruZkurai extends OpenAI {
 static providerName = "naruzkurai";
 static defaultOptions: Partial<LLMOptions> | undefined = {
  ...OpenAI.defaultOptions,
 };
}

export default NaruZkurai;
