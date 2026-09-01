import { LLMOptions } from "../..";

import NaruZkurAI from "./NaruZkurAI";

class Nous extends NaruZkurAI {
  static providerName = "nous";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://inference-api.nousresearch.com/v1",
    useLegacyCompletionsEndpoint: false,
  };
}

export default Nous;
