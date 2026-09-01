# NaruZkurai provider patch

This fork of Continue adds a dedicated `naruzkurai` provider for a custom
NaruZkurAI-compatible inference server (NaruZkurAI). It is a thin patch over the
upstream NaruZkurAI provider and leaves all upstream files untouched (clean `git
pull`s with no conflicts).

## Why

The NaruZkurAIApi client and shared `customFetch()` behave badly with the custom
server:

1. Upstream `customFetch()` strips `Authorization` / `x-api-key` (and other
   headers) whenever it detects a custom auth header — that breaks the server.
2. Config `requestOptions.headers` (`User-Agent`, `X-Custom-Header`,
   `X-Organization-Id`) were not being forwarded on NaruZkurAI SDK requests.

## What changed (edits are additive — no upstream behavior changed)

The provider is implemented in a single file:

- `packages/naruzkurai-adapters/src/apis/NaruZkurai.ts`
  - `NaruZkuraiApi extends NaruZkurAIApi`.
  - Constructor adds `defaultHeaders: config.requestOptions?.headers`
    (forwards custom headers on every SDK request).
  - Uses a local `naruFetch()` copy of `customFetch()` that OMITS the header
    stripping step — nothing is ever deleted.
  - Adds **`model: auto`** support (see below).

Other additive registrations (one line each):

- `core/llm/llms/NaruZkurai.ts`
  - `NaruZkurai extends NaruZkurAI` — just changes `providerName` to
    `"naruzkurai"` so core routes to the patched APi.
- `gui/public/logos/naruzkurai.png` — Provider icon (NaruZkurAI org avatar).
- `packages/naruzkurai-adapters/src/index.ts` — import + `case "naruzkurai": return new NaruZkuraiApi(config);`
- `packages/naruzkurai-adapters/src/types.ts` — `z.literal("naruzkurai")` added to `NaruZkurAIConfigSchema`.
- `core/llm/llms/index.ts` — `NaruZkurai` added to `LLMClasses`.
- `packages/config-types/src/index.ts` — `"naruzkurai"` added to `modelDescriptionSchema.provider` enum.
- `gui/src/pages/AddNewModel/configs/providers.ts` — `naruzkurai` provider entry with icon.

## `model: auto` — auto-select the model from the server

Set the model to `auto` and the provider will resolve it automatically from
the server's `GET <apiBase>/models` endpoint:

```yaml
models:
  - name: NaruZkurai
    provider: naruzkurai
    model: auto
    apiBase: http://127.0.0.1:8888/v1
    apiKey: <your-key>
```

How it works for every chat / edit / autocomplete / embed / completion request:

1. If the request's model is exactly `auto`, the provider pings
   `GET <apiBase>/models` (cached in memory for 30s so it doesn't hammer the
   server, e.g. on autocomplete keystrokes).
2. From the returned list it reuses the **last-used model** for that server if
   it's still listed — otherwise it picks the first "generation" model
   (skipping names that look like autocomplete/embedding helpers such as
   `autocomplete`, `embed`, `draft`, `completion`, `rerank`, `*js*`).
3. That id is swapped into the request before it is sent.
4. The chosen model is written to
   `~/.continue/naruzkurai-auto-model.json` (keyed per `apiBase`) so the
   selection is remembered for the rest of the session and used as a fallback
   if a later `/models` ping fails.
- `core/llm/llms/NaruZkurai.ts`
  - `NaruZkurai extends NaruZkurAI` — just changes `providerName` to
    `"naruzkurai"` so core routes to the patched APi.
- `gui/public/logos/naruzkurai.png`
  - Provider icon (NaruZkurAI org avatar).

Minimal registrations (additive, one line each):

- `packages/naruzkurai-adapters/src/index.ts` — import + `case "naruzkurai": return new NaruZkuraiApi(config);`
- `packages/naruzkurai-adapters/src/types.ts` — `z.literal("naruzkurai")` added to `NaruZkurAIConfigSchema`.
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
