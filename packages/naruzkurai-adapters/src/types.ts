import * as z from "zod";

export const ClientCertificateOptionsSchema = z.object({
  cert: z.string(),
  key: z.string(),
  passphrase: z.string().optional(),
});

export const RequestOptionsSchema = z.object({
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  caBundlePath: z.union([z.string(), z.array(z.string())]).optional(),
  proxy: z.string().optional(),
  headers: z.record(z.string()).optional(),
  extraBodyProperties: z.record(z.unknown()).optional(),
  noProxy: z.array(z.string()).optional(),
  clientCertificate: z.lazy(() => ClientCertificateOptionsSchema).optional(),
});

// Base config objects
export const BaseConfig = z.object({
  provider: z.string(),
  requestOptions: RequestOptionsSchema.optional(),
});

export const BasePlusConfig = BaseConfig.extend({
  apiBase: z.string().optional(),
  apiURL: z.string().optional(),
  quant: z.string().optional(),
  // naruzkurai-only: force the outbound scheme. false = keep configured
  // scheme; otherwise case-insensitive "http" or "https".
  ApiHttpOrHttps: z
    .union([
      z.boolean(),
      z.string().transform((v) => v.trim().toLowerCase()),
    ])
    .optional(),
  apiKey: z.string().optional(),
});

// NaruZkurAI and compatible
export const NaruZkurAIConfigSchema = BasePlusConfig.extend({
  useResponsesApi: z.boolean().optional(),
  provider: z.union([
    z.literal("naruzkurai"),
    z.literal("mistral"),
    z.literal("voyage"),
    z.literal("deepinfra"),
    z.literal("groq"),
    z.literal("nvidia"),
    z.literal("ovhcloud"),
    z.literal("fireworks"),
    z.literal("together"),
    z.literal("novita"),
    z.literal("nebius"),
    z.literal("function-network"),
    z.literal("llama.cpp"),
    z.literal("llamafile"),
    z.literal("lmstudio"),
    z.literal("ollama"),
    z.literal("cerebras"),
    z.literal("kindo"),
    z.literal("msty"),
    z.literal("openrouter"),
    z.literal("clawrouter"),
    z.literal("sambanova"),
    z.literal("text-gen-webui"),
    z.literal("vllm"),
    z.literal("xAI"),
    z.literal("zAI"),
    z.literal("scaleway"),
    z.literal("tensorix"),
    z.literal("ncompass"),
    z.literal("relace"),
    z.literal("huggingface-inference-api"),
    z.literal("naruzkurai"),
  ]),
});
export type NaruZkurAIConfig = z.infer<typeof NaruZkurAIConfigSchema>;

export const MoonshotConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("moonshot"),
});
export type MoonshotConfig = z.infer<typeof MoonshotConfigSchema>;

export const DeepseekConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("deepseek"),
});
export type DeepseekConfig = z.infer<typeof DeepseekConfigSchema>;

export const MiniMaxConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("minimax"),
});
export type MiniMaxConfig = z.infer<typeof MiniMaxConfigSchema>;

export const BedrockConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("bedrock"),
  // cacheBehavior: z.object({
  //   cacheSystemMessage: z.boolean().optional(),
  //   cacheConversation: z.boolean().optional(),
  // }).optional(),
  env: z
    .object({
      region: z.string().optional(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
      profile: z.string().optional(),
    })
    .optional(),
});
export type BedrockConfig = z.infer<typeof BedrockConfigSchema>;

export const LlamastackConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("llamastack"),
});
export type LlamastackConfig = z.infer<typeof LlamastackConfigSchema>;

export const MockConfigSchema = BasePlusConfig.extend({
  provider: z.literal("mock"),
});

export type MockConfig = z.infer<typeof MockConfigSchema>;

// Other APIs
export const CohereConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("cohere"),
});
export type CohereConfig = z.infer<typeof CohereConfigSchema>;

export const CometAPIConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("cometapi"),
});
export type CometAPIConfig = z.infer<typeof CometAPIConfigSchema>;

export const AskSageConfigSchema = BasePlusConfig.extend({
  provider: z.literal("askSage"),
  env: z
    .object({
      email: z.string().optional(),
      userApiUrl: z.string().optional(),
    })
    .optional(),
});
export type AskSageConfig = z.infer<typeof AskSageConfigSchema>;

/**
 * AskSage tool format (NaruZkurAI-compatible)
 */
export interface AskSageTool {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export type AskSageToolChoice =
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };

export interface AskSageToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * AskSage API response format
 */
export interface AskSageResponse {
  text?: string;
  answer?: string;
  message?: string;
  status?: number | string;
  response?: unknown;
  tool_calls?: AskSageToolCall[];
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: AskSageToolCall[];
    };
  }>;
}

export interface AskSageTokenResponse {
  status: number | string;
  response: {
    access_token: string;
  };
}

export const AzureConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("azure"),
  env: z
    .object({
      apiVersion: z.string().optional(),
      apiType: z
        .union([
          z.literal("azure-foundry"),
          z.literal("azure-naruzkurai"),
          z.literal("azure"), // Legacy
        ])
        .optional(),
      deployment: z.string().optional(),
    })
    .optional(),
});
export type AzureConfig = z.infer<typeof AzureConfigSchema>;

export const GeminiConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("gemini"),
  apiKey: z.string(),
});
export type GeminiConfig = z.infer<typeof GeminiConfigSchema>;

export const AnthropicConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("anthropic"),
  apiKey: z.string(),
});
export type AnthropicConfig = z.infer<typeof AnthropicConfigSchema>;

export const WatsonXConfigSchema = BasePlusConfig.extend({
  provider: z.literal("watsonx"),
  apiKey: z.string(),
  env: z.object({
    apiVersion: z.string().optional(),
    projectId: z.string().optional(),
    deploymentId: z.string().optional(),
  }),
});
export type WatsonXConfig = z.infer<typeof WatsonXConfigSchema>;

export const JinaConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("jina"),
});
export type JinaConfig = z.infer<typeof JinaConfigSchema>;

export const InceptionConfigSchema = NaruZkurAIConfigSchema.extend({
  provider: z.literal("inception"),
});
export type InceptionConfig = z.infer<typeof InceptionConfigSchema>;

export const VertexAIConfigSchema = BasePlusConfig.extend({
  provider: z.literal("vertexai"),
  env: z
    .object({
      region: z.string().optional(),
      projectId: z.string().optional(),
      keyFile: z.string().optional(),
      keyJson: z.string().optional(),
    })
    .optional(),
});
export type VertexAIConfig = z.infer<typeof VertexAIConfigSchema>;

export const AiSdkConfigSchema = BasePlusConfig.extend({
  provider: z.literal("ai-sdk"),
  model: z.string(),
  providerOptions: z.record(z.unknown()).optional(),
});
export type AiSdkConfig = z.infer<typeof AiSdkConfigSchema>;

// Discriminated union
export const LLMConfigSchema = z.discriminatedUnion("provider", [
  NaruZkurAIConfigSchema,
  BedrockConfigSchema,
  MoonshotConfigSchema,
  DeepseekConfigSchema,
  MiniMaxConfigSchema,
  CohereConfigSchema,
  AzureConfigSchema,
  GeminiConfigSchema,
  AnthropicConfigSchema,
  WatsonXConfigSchema,
  JinaConfigSchema,
  MockConfigSchema,
  InceptionConfigSchema,
  VertexAIConfigSchema,
  LlamastackConfigSchema,
  CometAPIConfigSchema,
  AskSageConfigSchema,
  AiSdkConfigSchema,
]);
export type LLMConfig = z.infer<typeof LLMConfigSchema>;
