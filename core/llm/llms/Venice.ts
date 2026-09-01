import { ChatCompletionCreateParams } from "@continuedev/naruzkurai-adapters";
import { ChatMessage, CompletionOptions, LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI";

class Venice extends NaruZkurAI {
  static providerName = "venice";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.venice.ai/api/v1/",
  };

  protected _convertArgs(
    options: CompletionOptions,
    messages: ChatMessage[],
  ): ChatCompletionCreateParams {
    const finalOptions = super._convertArgs(
      options,
      messages,
    ) as ChatCompletionCreateParams & { venice_parameters?: any };
    if (
      "venice_parameters" in options &&
      typeof options.venice_parameters === "object"
    ) {
      finalOptions.venice_parameters = { ...options.venice_parameters };
    }
    return finalOptions;
  }
}

export default Venice;
