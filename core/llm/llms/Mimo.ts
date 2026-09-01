import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class Mimo extends NaruZkurAI {
  static providerName = "mimo";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "https://api.xiaomimimo.com/v1/",
    model: "mimo-v2-flash",
  };
}

export default Mimo;
