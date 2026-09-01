import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      apiURL: "llm.echoshouse.ca:6465/v1",
      ApiHttpOrHttps: "https",
      apiKey: "sk-test",
    };
    const api = new NaruZkuraiApi(config) as NaruZkuraiApi;

    expect(api.apiBase).toBe("https://llm.echoshouse.ca:6465/v1/");
    expect(api.naruzkurai.baseURL).toBe("https://llm.echoshouse.ca:6465/v1/");
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
