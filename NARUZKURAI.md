# NaruZkurai provider patch

This fork of Continue adds a dedicated `naruzkurai` provider for a custom
OpenAI-compatible inference server (NaruZkurAI). It is a thin patch over the
upstream OpenAI provider and leaves all upstream files untouched (clean `git
pull`s with no conflicts).

## Why

The OpenAIApi client and shared `customFetch()` behave badly with the custom
server:

1. Upstream `customFetch()` strips `Authorization` / `x-api-key` (and other
   headers) whenever it detects a custom auth header — that breaks the server.
2. Config `requestOptions.headers` (`User-Agent`, `X-Custom-Header`,
   `X-Organization-Id`) were not being forwarded on OpenAI SDK requests.

## What changed (all new files, no upstream edits)

New files:

- `packages/openai-adapters/src/apis/NaruZkurai.ts`
  - `NaruZkuraiApi extends OpenAIApi`.
  - Constructor adds `defaultHeaders: config.requestOptions?.headers`
    (forwards custom headers on every SDK request).
  - Uses a local `naruFetch()` copy of `customFetch()` that OMITS the header
    stripping step — nothing is ever deleted.
- `core/llm/llms/NaruZkurai.ts`
  - `NaruZkurai extends OpenAI` — just changes `providerName` to
    `"naruzkurai"` so core routes to the patched APi.
- `gui/public/logos/naruzkurai.png`
  - Provider icon (NaruZkurAI org avatar).

Minimal registrations (additive, one line each):

- `packages/openai-adapters/src/index.ts` — import + `case "naruzkurai": return new NaruZkuraiApi(config);`
- `packages/openai-adapters/src/types.ts` — `z.literal("naruzkurai")` added to `OpenAIConfigSchema`.
- `core/llm/llms/index.ts` — `NaruZkurai` added to `LLMClasses`.
- `packages/config-types/src/index.ts` — `"naruzkurai"` added to `modelDescriptionSchema.provider` enum.
- `gui/src/pages/AddNewModel/configs/providers.ts` — `naruzkurai` provider entry with icon.

## Using it

In `~/.continue/config.yaml` set the provider and point at the server:

```yaml
models:
  - name: NaruZkurai
    provider: naruzkurai
    model: <your-model>
    apiBase: http://127.0.0.1:8888/v1
    apiKey: <your-key>
    requestOptions:
      headers:
        User-Agent: Continue/2.0.0
```

## Rebuild

Install deps and build the VSCode extension:

```bash
npm install
npm run package:vscode   # or the build command used for the vsix
```

Then reload the unpacked/installed extension so the rebuilt bundle takes
effect.
