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

## Rebuild + Install

The repo pins **Node v20.20.1** (`.nvmrc`) — newer majors (e.g. v26) will not
build a full `.vsix`. Use `nvm use` (or your version manager) first, then run
the build script, which mirrors the official CI pipeline:

```bash
nvm use                 # activate Node v20
./build.sh              # builds the .vsix for the current platform
TARGET=linux-x64 ./build.sh   # or target a specific platform/arch
```

Outputs:
- `extensions/vscode/build/` — extension build artifacts
- `extensions/vscode/*.vsix` — the installable package

Install the built extension into VS Code automatically (uses the local `code`
CLI, no extra toolchain):

```bash
./install.sh                  # install the newest built .vsix
BUILD=1 ./install.sh          # build.sh + install in one shot
./install.sh path/to/x.vsix   # install a specific file
```

Then reload VS Code (`Ctrl+Shift+P` → `Developer: Reload Window`) to activate
the rebuilt bundle.
