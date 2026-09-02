import fs from "fs";
import os from "os";
import path from "path";

/**
 * yolo-restricted command allowlist file backing (core / node only).
 *
 * The pure matching primitives live in `commandAllowlistCore.ts` (node-free, so
 * the browser GUI can import them without pulling in fs/os/path). This module
 * re-exports those primitives and adds the file-backed I/O used by the core
 * process: reading/appending the `<continueHome>/yolo-allowlist.txt` and
 * `yolo-denylist.txt` fallback files, mirroring the CLI implementation.
 */

export {
  commandMatchesGlob,
  evaluateAllowlistPolicy,
  type CommandAllowlist
} from "./commandAllowlistCore.js";

/** Parse one pattern-per-line fallback file. `#` starts a comment. */
export function readPatternFile(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return fs
      .readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return [];
  }
}

/** Locate the Continue home directory. */
export function continueHomeDir(): string {
  return process.env.CONTINUE_HOME ?? path.join(os.homedir(), ".continue");
}

/** VS Code user-settings.json candidates (Copilot-style `chat.commands.allowList`). */
export function vscodeSettingsPath(): string {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".config", "Code", "User", "settings.json"),
    path.join(home, ".config", "Code - Insiders", "User", "settings.json"),
    path.join(home, ".config", "VSCodium", "User", "settings.json"),
    path.join(home, ".config", "code-oss", "User", "settings.json"),
    path.join(
      home,
      "Library",
      "Application Support",
      "Code",
      "User",
      "settings.json",
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function readVSCodeAllowlist(settings: unknown): {
  allow: string[];
  deny: string[];
} {
  const chat = (settings as any)?.chat;
  if (!chat || typeof chat !== "object") {
    return { allow: [], deny: [] };
  }
  const asStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  const allow = asStrings((chat as any).commands?.allowList);
  const deny = asStrings((chat as any).commands?.denyList);
  return { allow, deny };
}

/**
 * Load the merged yolo command allowlist from all sources (union, deduped):
 *   - experimental config overrides (`experimental.yoloAllowList`/`DenyList`)
 *   - VS Code settings.json `chat.commands.allowList`/`denyList` (Copilot)
 *   - fallback text files `<continueHome>/yolo-allowlist.txt` / `yolo-denylist.txt`
 * Unlike the CLI (which returns the first non-empty source), this merges every
 * source so a pattern set in Copilot, config, or the fallback file all apply.
 */
export function loadCommandAllowlist(
  overrides?: { allow?: string[]; deny?: string[] },
  homeDir?: string,
  settingsJson?: string,
): { allow: string[]; deny: string[] } {
  const allowSet = new Set<string>();
  const denySet = new Set<string>();

  const push = (src: { allow: string[]; deny: string[] }) => {
    for (const p of src.allow ?? []) if (p) allowSet.add(p);
    for (const p of src.deny ?? []) if (p) denySet.add(p);
  };

  // 1. Experimental config overrides
  if (overrides) {
    push({ allow: overrides.allow ?? [], deny: overrides.deny ?? [] });
  }

  // 2. VS Code settings.json (Copilot `chat.commands.allowList`)
  const settingsPath = settingsJson ?? vscodeSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      push(readVSCodeAllowlist(raw));
    }
  } catch {
    // ignore malformed settings
  }

  // 3. Fallback text files
  const home = homeDir ?? continueHomeDir();
  push({
    allow: readPatternFile(path.join(home, "yolo-allowlist.txt")),
    deny: readPatternFile(path.join(home, "yolo-denylist.txt")),
  });

  return { allow: [...allowSet], deny: [...denySet] };
}

/**
 * Append a command to the yolo allowlist or denylist fallback file
 * (`<continueHome>/yolo-allowlist.txt` / `yolo-denylist.txt`). Deduplicates
 * against existing entries. Returns the file that was appended to, or null on
 * failure.
 */
export function addCommandToAllowlistFile(
  command: string,
  kind: "allow" | "deny",
  homeDir?: string,
): string | null {
  const home = homeDir ?? continueHomeDir();
  const file = path.join(
    home,
    kind === "allow" ? "yolo-allowlist.txt" : "yolo-denylist.txt",
  );
  try {
    const existing = readPatternFile(file);
    if (existing.some((p) => p === command)) {
      return file; // already present — no-op
    }
    fs.mkdirSync(home, { recursive: true });
    fs.appendFileSync(file, `${command}\n`, "utf-8");
    return file;
  } catch {
    return null;
  }
}

