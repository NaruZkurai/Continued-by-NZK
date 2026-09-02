import fs from "fs";
import os from "os";
import path from "path";

import type { ToolPolicy } from "@continuedev/terminal-security";

import { env } from "../env.js";
import { logger } from "../util/logger.js";

/**
 * yolo-restricted command allowlist.
 *
 * GitHub Copilot baseline: VS Code core decides whether a terminal command runs
 * unattended using the `chat.commands.allowList` / `chat.commands.denyList`
 * settings — string arrays of glob patterns matched against the base command.
 * We mirror that exact semantics:
 *   - an allow pattern match  -> command may run without asking;
 *   - a deny pattern match    -> command is refused (agent told "not authorised");
 *   - otherwise               -> the caller asks (Enter accepts).
 *
 * Sources, in order of precedence:
 *   1. VS Code user settings.json `chat.commands.allowList` / `denyList`.
 *   2. Fallback files `<continueHome>/yolo-allowlist.txt` and
 *      `<continueHome>/yolo-denylist.txt` (one glob pattern per line, `#` comment).
 */

export interface CommandAllowlist {
  allow: string[];
  deny: string[];
  /** True when the allow list was sourced from VS Code settings.json. */
  sourceIsVSCode: boolean;
}

/** Optional experimental config overrides (`experimental.yolo*`). */
export interface CommandAllowlistOverrides {
  allow?: string[];
  deny?: string[];
}

const EMPTY: CommandAllowlist = { allow: [], deny: [], sourceIsVSCode: false };

/**
 * Locate VS Code user settings.json. Linux default:
 * `~/.config/Code/User/settings.json`. Other VS Code dists (`code-oss`,
 * VSCodium, Insiders) live alongside. Returns the first that exists, else the
 * Linux default path.
 */
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

/** Extract `chat.commands.allowList` / `chat.commands.denyList` from parsed settings. */
function readVSCodeAllowlist(settings: unknown): CommandAllowlist {
  const chat = (settings as any)?.chat;
  if (!chat || typeof chat !== "object") {
    return EMPTY;
  }
  const asStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
  const allow = asStrings((chat as any).commands?.allowList);
  const deny = asStrings((chat as any).commands?.denyList);
  if (!allow.length && !deny.length) {
    return EMPTY;
  }
  return { allow, deny, sourceIsVSCode: true };
}

/** Parse one pattern-per-line fallback file. `#` starts a comment. */
function readPatternFile(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return fs
      .readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (err) {
    logger.debug(`Failed to read allowlist file ${filePath}`, { err });
    return [];
  }
}

/**
 * Load the merged command allowlist. Precedence:
 *   1. experimental config overrides (`experimental.yoloAllowList`/`yoloDenyList`)
 *   2. VS Code settings.json `chat.commands.allowList`/`denyList`
 *   3. fallback text files under the Continue home directory
 */
export function loadCommandAllowlist(
  settingsJson?: string,
  homeDir?: string,
  overrides?: CommandAllowlistOverrides,
): CommandAllowlist {
  // 1. Experimental config overrides
  if (overrides && (overrides.allow?.length || overrides.deny?.length)) {
    return {
      allow: overrides.allow ?? [],
      deny: overrides.deny ?? [],
      sourceIsVSCode: false,
    };
  }

  // 2. VS Code settings.json
  const settingsPath = settingsJson ?? vscodeSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const fromVSCode = readVSCodeAllowlist(raw);
      if (fromVSCode.sourceIsVSCode) {
        logger.debug(
          `Loaded command allowlist from VS Code settings (${fromVSCode.allow.length} allow, ${fromVSCode.deny.length} deny)`,
        );
        return fromVSCode;
      }
    }
  } catch (err) {
    logger.debug(`Failed to parse VS Code settings ${settingsPath}`, { err });
  }

  // 3. Fallback text files
  const home = homeDir ?? env.continueHome;
  const allow = readPatternFile(path.join(home, "yolo-allowlist.txt"));
  const deny = readPatternFile(path.join(home, "yolo-denylist.txt"));
  if (allow.length || deny.length) {
    return { allow, deny, sourceIsVSCode: false };
  }
  return EMPTY;
}

/**
 * Whether a full command string matches a glob pattern, mirroring the GitHub
 * Copilot / VS Code `chat.commands.allowList` semantics: `*` matches any run
 * of characters (glob, not shell); an exact string matches verbatim. Matching
 * is against the leading command and its arguments as a whole.
 *
 * Examples:
 *   `git status`  matches `git status` and `git *`
 *   `npm test -- --watch` matches `npm test*` and `npm *`
 */
export function commandMatchesGlob(
  command: string,
  pattern: string,
): boolean {
  if (!pattern) {
    return false;
  }
  if (pattern === "*") {
    return true;
  }
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return command === pattern;
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
  );
  return regex.test(command);
}

/**
 * Apply the allowlist three tiers to a command, returning the effective
 * tool policy. Used by the Bash tool in yolo-restricted mode.
 *   - matches an allow pattern -> allowedWithoutPermission (auto run)
 *   - matches a deny pattern   -> disabled (refused)
 *   - otherwise                -> keep basePolicy (ask -> allowedWithPermission)
 */
export function evaluateAllowlistPolicy(
  basePolicy: ToolPolicy,
  command: string,
  allowlist: CommandAllowlist,
): ToolPolicy {
  if (allowlist.deny.some((p) => commandMatchesGlob(command, p))) {
    return "disabled";
  }
  if (allowlist.allow.some((p) => commandMatchesGlob(command, p))) {
    return "allowedWithoutPermission";
  }
  return basePolicy;
}

/**
 * Persist a command to the yolo allowlist or denylist fallback file
 * (`<continueHome>/yolo-allowlist.txt` / `yolo-denylist.txt`). Used by the
 * permission selector's ✓✓ / ✗✗ actions ("add to list"). Deduplicates
 * against existing entries and returns the file that was appended to, or
 * null when the write failed.
 */
export function addCommandToAllowlistFile(
  command: string,
  kind: "allow" | "deny",
  homeDir?: string,
): string | null {
  const home = homeDir ?? env.continueHome;
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
  } catch (err) {
    logger.debug(`Failed to append ${kind} command to ${file}`, { err });
    return null;
  }
}
