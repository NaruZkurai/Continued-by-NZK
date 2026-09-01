import { LLMOptions } from "../../index.js";
import { osModelsEditPrompt } from "../templates/edit.js";

import NaruZkurAI from "./NaruZkurAI.js";

class TARS extends NaruZkurAI {
  static providerName = "tars";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.router.tetrate.ai/v1",
    model: "gpt-5-mini",
    promptTemplates: {
      edit: osModelsEditPrompt,
    },
    useLegacyCompletionsEndpoint: false,
  };
}

export default TARS;
