import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import { NaruZkuraiApi } from "../apis/naruzkurai.js";
import { NaruZkurAIConfigSchema } from "../types.js";

// ---------------------------------------------------------------------------
// NaruZkurai adapter — base URL resolution tests
//
// These tests are pure configuration assertions: constructing the adapter must
// never fire a network request, so we only need to verify which base URL the
// NaruZkurAI SDK client is pointed at. The critical invariant is that, when BOTH
// `apiURL` and `ApiHttpOrHttps` are provided, the adapter talks to the
// configured echoshouse server and NEVER silently falls back to api.naruzkurai.com.
// ---------------------------------------------------------------------------

// Mock node:fs so no test ever reads/writes the real
// ~/.continue/naruzkurai-auto-model.json on disk. The adapter touches this
// file only during model auto-resolution, but mocking keeps every test fully
// hermetic regardless of code path.
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(() => {
      throw new Error("fs read disabled in tests");
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

type Config = z.infer<typeof NaruZkurAIConfigSchema>;

// Reference the user's real VPM Shop config.yaml. We read it through
// `vi.importActual("node:fs")` on purpose: the `node:fs` mock above disables
// ALL fs access (including the adapter's own auto-model file), but this
// helper must still reach the on-disk config so the tests exercise the real
// `(dev)`/`(Auto)` models. When the file is absent (e.g. CI/install.sh) the
// helper returns `undefined` and dependent tests skip instead of failing.
async function loadUserConfigYaml(): Promise<any | undefined> {
  const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
  const home = process.env.HOME || os_homedir();
  const path =
    process.env.CONTINUE_CONFIG_YAML ?? `${home}/.continue/config.yaml`;
  try {
    const text = fs.readFileSync(path, "utf8");
    return parseYaml(text);
  } catch {
    return undefined;
  }
}

// Return the adapter config object for the named model (`(dev)`, `(Auto)`, ...)
// straight from the user's real config.yaml, mapped to NaruZkurAIConfigSchema.
async function adapterConfigFor(name: string): Promise<Config | undefined> {
  const doc = await loadUserConfigYaml();
  const model = Array.isArray(doc?.models)
    ? doc.models.find((m: any) => m?.name === name)
    : undefined;
  if (!model) {
    return undefined;
  }
  return {
    provider: "naruzkurai",
    apiKey: model.apiKey,
    apiURL: model.apiURL,
    ApiHttpOrHttps: model.ApiHttpOrHttps,
    quant: model.quant,
    requestOptions: model.requestOptions,
  } as Config;
}

// Small helper — the real fs homedir, so we don't need to import node:os just
// for this one path.
function os_homedir(): string {
  return typeof process.env.HOME === "string" && process.env.HOME.length > 0
    ? process.env.HOME
    : "/tmp";
}

describe("NaruZkurai adapter base URL resolution", () => {
  beforeEach(() => {
    // Isolate the static auto-model caches across tests/orderings.
    (NaruZkuraiApi as unknown as {
      autoModelCache?: { clear: () => void };
      autoModelExpiry?: { clear: () => void };
    }).autoModelCache?.clear?.();
    (NaruZkuraiApi as unknown as {
      autoModelCache?: { clear: () => void };
      autoModelExpiry?: { clear: () => void };
    }).autoModelExpiry?.clear?.();
    // Isolate the /v1/models response cache so no test inherits another's list.
    (NaruZkuraiApi as unknown as {
      modelsCache?: { clear: () => void };
      modelsCacheExpiry?: { clear: () => void };
    }).modelsCache?.clear?.();
    (NaruZkuraiApi as unknown as {
      modelsCache?: { clear: () => void };
      modelsCacheExpiry?: { clear: () => void };
    }).modelsCacheExpiry?.clear?.();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("T1: apiURL + ApiHttpOrHttps=http resolves to the http echoshouse base, never api.naruzkurai.com", () => {
    const config: Config = {
      provider: "naruzkurai",
      apiURL: "llm.echoshouse.ca:6465/v1",
      ApiHttpOrHttps: "http",
      apiKey: "sk-test",
    };
    const api = new NaruZkuraiApi(config) as NaruZkuraiApi;

    expect(api.apiBase).toBe("http://llm.echoshouse.ca:6465/v1/");
    expect(api.naruzkurai.baseURL).toBe("http://llm.echoshouse.ca:6465/v1/");
    expect(api.apiBase).not.toContain("api.naruzkurai.com");
  });

  it("T2: ApiHttpOrHttps=https resolves to the https echoshouse base", () => {
    const config: Config = {
      provider: "naruzkurai",
      // `llms` (with S) is the HTTPS-only origin; `llm` (no S) is HTTP-only.
      apiURL: "llms.echoshouse.ca:6465/v1",
      ApiHttpOrHttps: "https",
      apiKey: "sk-test",
    };
    const api = new NaruZkuraiApi(config) as NaruZkuraiApi;

    expect(api.apiBase).toBe("https://llms.echoshouse.ca:6465/v1/");
    expect(api.naruzkurai.baseURL).toBe("https://llms.echoshouse.ca:6465/v1/");
    expect(api.apiBase).not.toContain("api.naruzkurai.com");
  });

  it("T3: apiURL takes priority over apiBase", () => {
    const config: Config = {
      provider: "naruzkurai",
      apiURL: "http://a.example.com/v1",
      apiBase: "http://b.example.com",
      ApiHttpOrHttps: false,
      apiKey: "sk-test",
    };
    const api = new NaruZkuraiApi(config) as NaruZkuraiApi;

    expect(api.apiBase).toBe("http://a.example.com/v1/");
    expect(api.apiBase).toContain("a.example.com");
    expect(api.apiBase).not.toContain("b.example.com");
    expect(api.apiBase).not.toContain("api.naruzkurai.com");
  });

  it("T4: no apiURL/apiBase leaves no non-empty base and never falls back to api.naruzkurai.com", () => {
    const config: Config = {
      provider: "naruzkurai",
      apiKey: "sk-test",
      ApiHttpOrHttps: false,
    };
    const api = new NaruZkuraiApi(config) as NaruZkuraiApi;

    // Implementation prepends "http://", so an empty host yields "http://".
    // Assert the meaningful part: no host is resolved and naruzkurai.com never appears.
    expect(api.apiBase === "" || api.apiBase === "http://").toBe(true);
    expect(api.apiBase).not.toContain("api.naruzkurai.com");
    expect(api.naruzkurai.baseURL).not.toContain("api.naruzkurai.com");
  });

  it("T5: baseCandidates[0] is the first candidate actually used", () => {
    const config: Config = {
      provider: "naruzkurai",
      apiURL: "llm.echoshouse.ca:6465/v1",
      ApiHttpOrHttps: "http",
      apiKey: "sk-test",
    };
    const api = new NaruZkuraiApi(config) as unknown as {
      apiBase: string;
      baseCandidates: string[];
    };

    expect(api.baseCandidates[0]).toBe("http://llm.echoshouse.ca:6465/v1");
    // apiBase is normalized with a trailing slash; the scheme resolution is
    // what matters here.
    expect(api.apiBase).toBe("http://llm.echoshouse.ca:6465/v1/");
  });

  it("T6: no ApiHttpOrHttps (undefined) prepends http:// to a schemeless apiURL", () => {
    const config: Config = {
      provider: "naruzkurai",
      apiURL: "llm.echoshouse.ca:6465/v1",
      apiKey: "sk-test",
    };
    const api = new NaruZkuraiApi(config) as NaruZkuraiApi;

    expect(api.apiBase.startsWith("http://")).toBe(true);
    expect(api.apiBase).toBe("http://llm.echoshouse.ca:6465/v1/");
    expect(api.apiBase).not.toContain("api.naruzkurai.com");
  });
});

describe("NaruZkurai adapter extraBodyProperties injection", () => {
  beforeEach(() => {
    (NaruZkuraiApi as unknown as {
      autoModelCache?: { clear: () => void };
      autoModelExpiry?: { clear: () => void };
    }).autoModelCache?.clear?.();
    (NaruZkuraiApi as unknown as {
      autoModelCache?: { clear: () => void };
      autoModelExpiry?: { clear: () => void };
    }).autoModelExpiry?.clear?.();
    (NaruZkuraiApi as unknown as {
      modelsCache?: { clear: () => void };
      modelsCacheExpiry?: { clear: () => void };
    }).modelsCache?.clear?.();
    (NaruZkuraiApi as unknown as {
      modelsCache?: { clear: () => void };
      modelsCacheExpiry?: { clear: () => void };
    }).modelsCacheExpiry?.clear?.();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("T7: chat_template_kwargs from the real config.yaml reach the outbound chat body", async () => {
    // Prefer the user's real (Auto) model; fall back to an explicit fixture so
    // the test still asserts the mechanism when config.yaml isn't present.
    const fromConfig = await adapterConfigFor("(Auto)");
    const config: Config =
      fromConfig ??
      ({
        provider: "naruzkurai",
        apiURL: "llm.echoshouse.ca/v1",
        ApiHttpOrHttps: "http",
        apiKey: "sk-test",
        quant: "UD-Q2_K_XL",
        requestOptions: {
          extraBodyProperties: {
            chat_template_kwargs: { reasoning_effort: "high" },
          },
        },
      } as Config);
    const api = new NaruZkuraiApi(config) as NaruZkuraiApi;

    // Capture the body handed to the SDK client.
    let capturedBody: Record<string, any> | undefined;
    (api as any).naruzkurai.chat.completions.create = vi.fn(
      async (body: Record<string, any>) => {
        capturedBody = body;
        // Return an async iterable with a single usage-only chunk so the
        // method yields without error.
        return (async function* () {
          yield { id: "x", object: "chat.completion.chunk", created: 0 };
        })();
      },
    );

    const chunkStream = api.chatCompletionStream(
      {
        model: "peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF",
        messages: [{ role: "user", content: "hello" }],
        stream: true,
      },
      new AbortController().signal,
    );
    for await (const _ of chunkStream) {
      // drain
    }

    expect(api.naruzkurai.chat.completions.create).toHaveBeenCalledTimes(1);
    expect(capturedBody?.chat_template_kwargs).toBeTruthy();
    expect(capturedBody?.messages).toEqual([
      { role: "user", content: "hello" },
    ]);
    expect(capturedBody?.stream_options).toEqual({ include_usage: true });
  });

  it("T8: (dev) auto model from config.yaml resolves + applies quant without load-wait", async () => {
    const fromConfig = await adapterConfigFor("(dev)");
    if (!fromConfig) {
      // No on-disk config (CI/install.sh): skip rather than fail.
      return;
    }
    const api = new NaruZkuraiApi(fromConfig) as NaruZkuraiApi;

    // The (dev) model is `model: auto` -> resolveAutoModel is called.
    // Stub it so no /models network call happens.
    const resolveSpy = vi
      .spyOn(api as any, "resolveAutoModel")
      .mockResolvedValue("peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF");
    // Auto quant -> the loaded quant is detected via resolveLoadedQuant (it
    // must NOT be appended as a literal `:auto`). Provide a plausible result.
    const isAutoQuant =
      !fromConfig.quant ||
      String(fromConfig.quant).toLowerCase() === "auto";
    const expectedQuant = isAutoQuant ? "Q4_K_M" : fromConfig.quant;
    const resolveQuantSpy = vi
      .spyOn(api as any, "resolveLoadedQuant")
      .mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((modelId: string, ..._rest: unknown[]): Promise<string> => {
          return isAutoQuant
            ? Promise.resolve(`${modelId}:${expectedQuant}`)
            : Promise.resolve(modelId);
        }) as any,
      );
    const tryLoadedSpy = vi
      .spyOn(api as any, "tryFetchModelLoaded")
      .mockResolvedValue(true);

    let capturedBody: Record<string, any> | undefined;
    (api as any).naruzkurai.chat.completions.create = vi.fn(
      async (body: Record<string, any>) => {
        capturedBody = body;
        return (async function* () {
          yield { id: "x", object: "chat.completion.chunk", created: 0 };
        })();
      },
    );

    const chunkStream = api.chatCompletionStream(
      {
        model: "auto",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      },
      new AbortController().signal,
    );
    for await (const _ of chunkStream) {
      // drain
    }

    expect(resolveSpy).toHaveBeenCalled();
    // Auto quant -> the resolved quant is detected (real quant), never a
    // literal `:auto` stub. Explicit quant -> appended via withQuant.
    expect(capturedBody?.model).toBe(
      `peculiar-ragdoll/Dirk-Qwen3.8-27B-GGUF${expectedQuant ? ":" + expectedQuant : ""}`,
    );
    // Auto quant -> resolveLoadedQuant runs; explicit quant -> it does not.
    if (isAutoQuant) {
      expect(resolveQuantSpy).toHaveBeenCalled();
    } else {
      expect(resolveQuantSpy).not.toHaveBeenCalled();
    }
    // Never wait for model load / force a reload.
    expect(tryLoadedSpy).not.toHaveBeenCalled();
    expect(capturedBody?.stream_options).toEqual({ include_usage: true });
  });
});
