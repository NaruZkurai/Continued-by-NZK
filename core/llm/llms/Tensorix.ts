import NaruZkurAI from "./NaruZkurAI.js";

import type { LLMOptions } from "../../index.js";

class Tensorix extends NaruZkurAI {
  static providerName = "tensorix";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.tensorix.ai/v1/",
    model: "deepseek/deepseek-chat-v3.1",
    useLegacyCompletionsEndpoint: false,
  };
}

export default Tensorix;
