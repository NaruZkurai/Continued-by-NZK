import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class DeepInfra extends NaruZkurAI {
  static providerName = "deepinfra";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.deepinfra.com/v1/naruzkurai/",
  };
  maxStopWords: number | undefined = 16;

  protected async _embed(chunks: string[]): Promise<number[][]> {
    const resp = await this.fetch(
      `https://api.deepinfra.com/v1/inference/${this.model}`,
      {
        method: "POST",
        headers: {
          Authorization: `bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ inputs: chunks }),
      },
    );

    const data = await resp.json();
    return data.embeddings;
  }
}

export default DeepInfra;
