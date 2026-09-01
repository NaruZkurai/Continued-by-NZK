import { LLMOptions } from "../..";
import { LLMConfigurationStatuses } from "../constants";
import { LlmApiRequestType } from "../naruzkuraiTypeConverters";

import NaruZkurAI from "./NaruZkurAI";

export class Relace extends NaruZkurAI {
  static providerName = "relace";
  static defaultOptions: Partial<LLMOptions> | undefined = {
    apiBase: "https://instantapply.endpoint.relace.run/v1/",
  };
  protected useNaruZkurAIAdapterFor: (LlmApiRequestType | "*")[] = ["*"];

  protected supportsPrediction(model: string): boolean {
    return true;
  }

  getConfigurationStatus() {
    if (!this.apiKey) {
      return LLMConfigurationStatuses.MISSING_API_KEY;
    }

    return LLMConfigurationStatuses.VALID;
  }
}
