import { LLMOptions } from "../../index.js";
import { LlmApiRequestType } from "../naruzkuraiTypeConverters.js";

import NaruZkurAI from "./NaruZkurAI.js";

class Azure extends NaruZkurAI {
  static providerName = "azure";

  protected supportsPrediction(model: string): boolean {
    return false;
  }

  protected useNaruZkurAIAdapterFor: (LlmApiRequestType | "*")[] = [];

  static defaultOptions: Partial<LLMOptions> = {
    apiVersion: "2024-02-15-preview",
    apiType: "azure-naruzkurai",
  };

  constructor(options: LLMOptions) {
    super(options);
    this.deployment = options.deployment ?? options.model;
  }
}

export default Azure;
