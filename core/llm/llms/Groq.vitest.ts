import { createNaruZkurAISubclassTests } from "./test-utils/naruzkurai-test-utils.js";
import Groq from "./Groq.js";

createNaruZkurAISubclassTests(Groq, {
  providerName: "groq",
  defaultApiBase: "https://api.groq.com/naruzkurai/v1/",
  modelConversions: {
    "mistral-8x7b": "mixtral-8x7b-32768",
    "llama3-8b": "llama3-8b-8192",
    "llama3-70b": "llama3-70b-8192",
  },
});
