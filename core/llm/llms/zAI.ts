import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class zAI extends NaruZkurAI {
  static providerName = "zAI";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.z.ai/api/paas/v4/",
    useLegacyCompletionsEndpoint: false,
  };
}

export default zAI;
