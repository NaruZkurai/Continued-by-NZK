import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class Lemonade extends NaruZkurAI {
  static providerName = "lemonade";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "http://localhost:8000/api/v1/",
  };
}

export default Lemonade;
