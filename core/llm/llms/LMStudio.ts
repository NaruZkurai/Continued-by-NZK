import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class LMStudio extends NaruZkurAI {
  static providerName = "lmstudio";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "http://localhost:1234/v1/",
  };
}

export default LMStudio;
