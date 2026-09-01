import { providers } from "../pages/AddNewModel/configs/providers";

export interface ErrorAnalysis {
  parsedError: string;
  statusCode?: number;
  message?: string;
  modelTitle: string;
  providerName: string;
  apiKeyUrl?: string;
  helpUrl?: string;
  customErrorMessage?: string;
  isModelDownloading?: boolean;
}

function parseErrorMessage(fullErrMsg: string): string {
  if (
    !fullErrMsg ||
    typeof fullErrMsg !== "string" ||
    !fullErrMsg.includes("\n\n")
  ) {
    return fullErrMsg;
  }

  const msg = fullErrMsg.split("\n\n").slice(1).join("\n\n");
  try {
    const parsed = JSON.parse(msg);
    if (parsed.error !== undefined && parsed.error !== null) {
      return JSON.stringify(parsed.error);
    }
    if (parsed.message !== undefined && parsed.message !== null) {
      return JSON.stringify(parsed.message);
    }
    return msg;
  } catch (e) {
    return msg;
  }
}

export function analyzeError(
  error: unknown,
  selectedModel: any,
): ErrorAnalysis {
  const errorMessage = (error as any)?.message;
  const parsedError = parseErrorMessage(
    typeof errorMessage === "string" ? errorMessage : "",
  );

  // Collect model information to display useful error info
  let modelTitle = "Chat model";
  let providerName = "the model provider";
  let apiKeyUrl: string | undefined = undefined;

  if (selectedModel) {
    modelTitle = selectedModel.title;
    providerName = selectedModel.underlyingProviderName;

    // If there's a matching provider from add model form provider info
    // We can get more info
    const foundProvider = Object.values(providers).find(
      (p) => p?.provider === selectedModel.underlyingProviderName,
    );
    if (foundProvider) {
      providerName = foundProvider.title;
      if (foundProvider.apiKeyUrl) {
        apiKeyUrl = foundProvider.apiKeyUrl;
      }
    }
  }

  let message: undefined | string = undefined;
  let statusCode: undefined | number = undefined;

  // Attempt to get error message and status code from error
  if (
    error &&
    (error instanceof Error || typeof error === "object") &&
    "message" in error &&
    typeof error["message"] === "string"
  ) {
    message = error["message"];
    const parts = message?.split(" ") ?? [];

    // Handle single word case (like "404")
    if (parts.length === 1) {
      const trimmed = parts[0].trim();
      if (trimmed !== "") {
        const code = Number(trimmed);
        if (!Number.isNaN(code)) {
          statusCode = code;
        }
      }
    } else if (parts.length > 1) {
      const status = parts[0] === "HTTP" ? parts[1] : parts[0];
      if (status) {
        const code = Number(status);
        if (!Number.isNaN(code)) {
          statusCode = code;
        }
      }
    }
  }

  let helpUrl: string | undefined = undefined;
  let customErrorMessage: string | undefined = undefined;

  const lowerMessage = (message ?? "").toLowerCase();
  const lowerParsedError = parsedError.toLowerCase();
  const errorText = lowerMessage + " " + lowerParsedError;

  // NaruZkurAI organization verification error (reasoning summaries or streaming)
  const isNaruZkurAI =
    errorText.includes("naruzkurai") ||
    (providerName ?? "").toLowerCase().includes("naruzkurai");
  if (
    isNaruZkurAI &&
    (errorText.includes(
      "organization must be verified to generate reasoning summaries",
    ) ||
      errorText.includes("organization must be verified to stream"))
  ) {
    helpUrl =
      "https://help.naruzkurai.com/en/articles/10910291-api-organization-verification";
    customErrorMessage =
      "Your NaruZkurAI organization must be verified for this feature. To avoid this, add `useResponsesApi: false` to your model config to use the /chat/completions endpoint instead, or verify your organization via the help page.";
  }

  // Invalid API key detection
  if (
    errorText.includes("incorrect api key provided") ||
    errorText.includes("invalid api key") ||
    errorText.includes("invalid x-api-key")
  ) {
    customErrorMessage =
      "This error usually happens when the API key is actually invalid. Check your API key value or try a new one.";

    // Check if the key contains "secrets." indicating failed secret templating
    if (
      selectedModel?.apiKey &&
      String(selectedModel.apiKey).includes("secrets.")
    ) {
      customErrorMessage =
        "API key secret not found. Add the apiKey to your secrets or set it directly in your config.";
    }
  }

  // Missing authentication header (no API key configured)
  if (errorText.includes("missing bearer or basic authentication")) {
    helpUrl = "https://docs.continue.dev/reference#models";
    customErrorMessage =
      'No API key was sent with the request. Add "apiKey" to your model config.';
  }

  // Ollama tool call parsing failure (transient model output issue)
  if (errorText.includes("error parsing tool call")) {
    customErrorMessage =
      "This model produced an invalid tool call that Ollama could not parse. " +
      "This is a known transient issue — you can resubmit your message to try again. " +
      'Enabling "Only use system message tools" in Settings > Experimental ' +
      "may reduce these errors by avoiding Ollama's native tool call parser.";
  }

  // 402 Insufficient Balance
  if (statusCode === 402 || errorText.includes("insufficient balance")) {
    const providerLabel = providerName || "your provider";
    customErrorMessage = `Your ${providerLabel} account appears to be out of credits. Add more credits to your account to continue using this model.`;
  }

  // Model is still downloading on the backend (e.g. Unsloth Studio).
  // With `isModelDownloading` set, the caller (streamThunkWrapper) will wait
  // and retry until the download completes instead of showing an error dialog.
  const isModelDownloading = isModelDownloadingError(error);

  return {
    parsedError,
    statusCode,
    message,
    modelTitle,
    providerName,
    apiKeyUrl,
    helpUrl,
    customErrorMessage,
    isModelDownloading,
  };
}

/**
 * Detects the `model_downloading` condition returned by NaruZkurAI-compatible
 * backends (e.g. Unsloth Studio) when a requested model is still downloading.
 *
 * Unsloth returns an `api_error` shaped like:
 *   { message: "Downloading '...' (1.9 GB). Retry shortly. Track it in Unsloth Studio.",
 *     type: "api_error", param: "model", code: "model_downloading" }
 *
 * Detection uses both the structured `code` field and the message text, so it
 * remains accurate even if the error was serialized and reshaped in transit.
 *
 * Accepts either a string message (e.g. `error.message`) or an error-like
 * object with `code` / `message` fields.
 */
export function isModelDownloadingError(
  error: unknown | string,
): boolean {
  if (typeof error === "string") {
    return isModelDownloadingMessage(error);
  }
  if (error && typeof error === "object") {
    const obj = error as { code?: unknown; message?: unknown };
    if (obj.code === "model_downloading") {
      return true;
    }
    if (typeof obj.message === "string") {
      return isModelDownloadingMessage(obj.message);
    }
  }
  return false;
}

function isModelDownloadingMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("model_downloading") ||
    (lower.startsWith("downloading '") && lower.includes("retry shortly"))
  );
}
