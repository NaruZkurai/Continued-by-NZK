import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class xAI extends NaruZkurAI {
  static providerName = "xAI";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.x.ai/v1/",
  };

  supportsCompletions(): boolean {
    return false;
  }
}

export default xAI;
