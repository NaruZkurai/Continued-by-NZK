import { LLMOptions } from "../..";

import NaruZkurAI from "./NaruZkurAI";

class Kindo extends NaruZkurAI {
  static providerName = "kindo";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://llm.kindo.ai/v1/",
    requestOptions: {
      headers: {
        "kindo-token-transaction-type": "CONTINUE",
      },
    },
  };
}

export default Kindo;
