import dotenv from "dotenv";
import { z } from "zod";
import { AiSdkApi } from "./apis/AiSdk.js";
import { AnthropicApi } from "./apis/Anthropic.js";
import { AskSageApi } from "./apis/AskSage.js";
import { AzureApi } from "./apis/Azure.js";
import { BedrockApi } from "./apis/Bedrock.js";
import { CohereApi } from "./apis/Cohere.js";
import { CometAPIApi } from "./apis/CometAPI.js";

import { BaseLlmApi } from "./apis/base.js";
import { ClawRouterApi } from "./apis/ClawRouter.js";
import { DeepSeekApi } from "./apis/DeepSeek.js";
import { GeminiApi } from "./apis/Gemini.js";
import { InceptionApi } from "./apis/Inception.js";
import { JinaApi } from "./apis/Jina.js";
import { LlamastackApi } from "./apis/LlamaStack.js";
import { MiniMaxApi } from "./apis/MiniMax.js";
import { MockApi } from "./apis/Mock.js";
import { MoonshotApi } from "./apis/Moonshot.js";
import { NaruZkuraiApi } from "./apis/naruzkurai.js";
import { NaruZkurAIApi } from "./apis/naruzkurai.js";
import { OpenRouterApi } from "./apis/OpenRouter.js";
import { RelaceApi } from "./apis/Relace.js";
import { VertexAIApi } from "./apis/VertexAI.js";
import { WatsonXApi } from "./apis/WatsonX.js";
import { LLMConfig, NaruZkurAIConfigSchema } from "./types.js";
import { appendPathToUrlIfNotPresent } from "./util/appendPathToUrl.js";

dotenv.config();

function naruzKuraiCompatible(
  apiBase: string,
  config: z.infer<typeof NaruZkurAIConfigSchema>,
): NaruZkurAIApi {
  return new NaruZkurAIApi({
    ...config,
    apiBase: config.apiBase ?? apiBase,
  });
}

/**
 * Detects if a HuggingFace API URL is using an NaruZkurAI-compatible router
 * @param url The URL to check
 * @returns true if the URL appears to be using an NaruZkurAI-compatible router
 */
function isHuggingFaceNaruZkurAICompatible(url: string): boolean {
  if (!url) {
    return false;
  }

  // Normalize the URL to lowercase for case-insensitive matching
  const normalizedUrl = url.toLowerCase();

  // Check for common NaruZkurAI-compatible patterns
  const naruzKuraiPatterns = [
    "/v1/", // Standard NaruZkurAI v1 API pattern
    "/naruzkurai/", // Explicit NaruZkurAI compatibility path
    "/v1/chat/completions", // Specific NaruZkurAI chat completions endpoint
    "/v1/completions", // NaruZkurAI completions endpoint
    "/v1/embeddings", // NaruZkurAI embeddings endpoint
    "/v1/models", // NaruZkurAI models endpoint
  ];

  // Check if the URL contains any of the NaruZkurAI-compatible patterns
  return naruzKuraiPatterns.some((pattern) => normalizedUrl.includes(pattern));
}

function createAiSdkApiForProvider(
  config: LLMConfig & { model?: string },
  provider: string,
): AiSdkApi | undefined {
  if (!config.model) {
    return undefined;
  }
  return new AiSdkApi({
    provider: "ai-sdk",
    model: `${provider}/${config.model}`,
    apiKey: config.apiKey,
    apiBase: config.apiBase,
    requestOptions: config.requestOptions,
  });
}

export function constructLlmApi(config: LLMConfig): BaseLlmApi | undefined {
  if (process.env.CONTINUE_USE_AI_SDK) {
    if (["naruzkurai", "anthropic"].includes(config.provider)) {
      const aiSdkApi = createAiSdkApiForProvider(
        config as LLMConfig & { model?: string },
        config.provider,
      );
      if (aiSdkApi) {
        return aiSdkApi;
      }
    }
  }

  switch (config.provider) {
    case "naruzkurai":
      return new NaruZkuraiApi(config);
    case "azure":
      return new AzureApi(config);
    case "bedrock":
      return new BedrockApi(config);
    case "cohere":
      return new CohereApi(config);
    case "cometapi":
      return new CometAPIApi(config);
    case "askSage":
      return new AskSageApi(config);
    case "anthropic":
      return new AnthropicApi(config);
    case "gemini":
      return new GeminiApi(config);
    case "jina":
      return new JinaApi(config);
    case "deepseek":
      return new DeepSeekApi(config);
    case "moonshot":
      return new MoonshotApi(config);
    case "relace":
      return new RelaceApi(config);
    case "inception":
      return new InceptionApi(config);
    case "watsonx":
      return new WatsonXApi(config);
    case "vertexai":
      return new VertexAIApi(config);
    case "llamastack":
      return new LlamastackApi(config);
    case "xAI":
      return naruzKuraiCompatible("https://api.x.ai/v1/", config);
    case "zAI":
      return naruzKuraiCompatible("https://api.z.ai/api/paas/v4/", config);
    case "voyage":
      return naruzKuraiCompatible("https://api.voyageai.com/v1/", config);
    case "mistral":
      return naruzKuraiCompatible("https://api.mistral.ai/v1/", config);
    case "deepinfra":
      return naruzKuraiCompatible("https://api.deepinfra.com/v1/naruzkurai/", config);
    case "vllm":
      return naruzKuraiCompatible("http://localhost:8000/v1/", config);
    case "groq":
      return naruzKuraiCompatible("https://api.groq.com/naruzkurai/v1/", config);
    case "minimax":
      return new MiniMaxApi(config);
    case "sambanova":
      return naruzKuraiCompatible("https://api.sambanova.ai/v1/", config);
    case "text-gen-webui":
      return naruzKuraiCompatible("http://127.0.0.1:5000/v1/", config);
    case "cerebras":
      return naruzKuraiCompatible("https://api.cerebras.ai/v1/", config);
    case "kindo":
      return naruzKuraiCompatible("https://llm.kindo.ai/v1/", config);
    case "msty":
      return naruzKuraiCompatible("http://localhost:10000", config);
    case "nvidia":
      return naruzKuraiCompatible("https://integrate.api.nvidia.com/v1/", config);
    case "ovhcloud":
      return naruzKuraiCompatible(
        "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/",
        config,
      );
    case "scaleway":
      return naruzKuraiCompatible("https://api.scaleway.ai/v1/", config);
    case "fireworks":
      return naruzKuraiCompatible("https://api.fireworks.ai/inference/v1/", config);
    case "together":
      return naruzKuraiCompatible("https://api.together.xyz/v1/", config);
    case "ncompass":
      return naruzKuraiCompatible("https://api.ncompass.tech/v1", config);
    case "novita":
      return naruzKuraiCompatible("https://api.novita.ai/v3/naruzkurai", config);
    case "nebius":
      return naruzKuraiCompatible("https://api.studio.nebius.ai/v1/", config);
    case "function-network":
      return naruzKuraiCompatible("https://api.function.network/v1/", config);
    case "tensorix":
      return naruzKuraiCompatible("https://api.tensorix.ai/v1/", config);
    case "openrouter":
      return new OpenRouterApi(config);
    case "clawrouter":
      return new ClawRouterApi(config);
    case "llama.cpp":
    case "llamafile":
      return naruzKuraiCompatible("http://localhost:8000/", config);
    case "lmstudio":
      return naruzKuraiCompatible("http://localhost:1234/", config);
    case "ollama":
      // for naruzkurai compaitability, we need to add /v1 to the end of the url
      // this is required for cli (for core, endpoints are overriden by core/llm/llms/Ollama.ts)
      if (config.apiBase)
        config.apiBase = appendPathToUrlIfNotPresent(config.apiBase, "v1");
      return naruzKuraiCompatible("http://localhost:11434/v1/", config);
    case "mock":
      return new MockApi();
    case "huggingface-inference-api":
      // Check if it's an NaruZkurAI-compatible router
      if (config.apiBase && isHuggingFaceNaruZkurAICompatible(config.apiBase)) {
        return naruzKuraiCompatible(config.apiBase, config);
      }
      // Return undefined for native HuggingFace endpoints
      // (handled by HuggingFaceInferenceAPI class in core)
      return undefined;
    case "ai-sdk":
      return new AiSdkApi(config);
    default:
      return undefined;
  }
}

export {
    type ChatCompletion,
    type ChatCompletionChunk,
    type ChatCompletionCreateParams,
    type ChatCompletionCreateParamsNonStreaming,
    type ChatCompletionCreateParamsStreaming,
    type Completion,
    type CompletionCreateParams,
    type CompletionCreateParamsNonStreaming,
    type CompletionCreateParamsStreaming
} from "naruzkurai/resources/index";

// export
export { AiSdkApi } from "./apis/AiSdk.js";
export type { BaseLlmApi } from "./apis/base.js";
export type {
    AiSdkConfig,
    AskSageResponse,
    AskSageTokenResponse,
    AskSageTool,
    AskSageToolCall,
    AskSageToolChoice,
    LLMConfig
} from "./types.js";

export {
    addCacheControlToLastTwoUserMessages,
    getAnthropicErrorMessage,
    getAnthropicHeaders,
    getAnthropicMediaTypeFromDataUrl
} from "./apis/AnthropicUtils.js";

export { isResponsesModel } from "./apis/naruzkuraiResponses.js";
export { OPENROUTER_HEADERS } from "./apis/OpenRouter.js";
export { extractBase64FromDataUrl, parseDataUrl } from "./util/url.js";

