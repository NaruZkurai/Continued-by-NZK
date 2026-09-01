import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class Fireworks extends NaruZkurAI {
  static providerName = "fireworks";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.fireworks.ai/inference/v1/",
  };

  private static modelConversion: { [key: string]: string } = {
    "starcoder-7b": "accounts/fireworks/models/starcoder-7b",
  };
  protected _convertModelName(model: string): string {
    return Fireworks.modelConversion[model] ?? model;
  }
}

export default Fireworks;
