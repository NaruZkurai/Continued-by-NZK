import Fireworks from "./Fireworks.js";
import { createNaruZkurAISubclassTests } from "./test-utils/naruzkurai-test-utils.js";

createNaruZkurAISubclassTests(Fireworks, {
  providerName: "fireworks",
  defaultApiBase: "https://api.fireworks.ai/inference/v1/",
  modelConversions: {
    "starcoder-7b": "accounts/fireworks/models/starcoder-7b",
  },
  modelConversionContent:
    "<|im_start|>user\nhello<|im_end|>\n<|im_start|>assistant\n",
});
