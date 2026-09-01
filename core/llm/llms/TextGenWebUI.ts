import { LLMOptions } from "../../index.js";

import NaruZkurAI from "./NaruZkurAI.js";

class TextGenWebUI extends NaruZkurAI {
  static providerName = "text-gen-webui";
  static defaultOptions: Partial<LLMOptions> = {
    apiBase: "http://localhost:5000/v1/",
  };
}

export default TextGenWebUI;
