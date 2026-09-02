import { ToolPolicy } from "@continuedev/terminal-security";

/**
 * Pure (node-free) yolo command-allowlist primitives, safe to import from the
 * browser GUI bundle. File-backed I/O lives separately in
 * `commandAllowlistFiles.ts` (core / node only).
 */

export interface CommandAllowlist {
  allow: string[];
  deny: string[];
}

/**
 * Whether a full command string matches a glob pattern. `*` matches any run of
 * characters (glob, not shell); `?` matches a single char; an exact string
 * matches verbatim. Matching is against the whole command + args.
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
 * Apply the allowlist three tiers to a command, returning the effective tool
 * policy. Only consulted when yolo-restricted mode is enabled.
 *   - matches a deny pattern   -> disabled (refused)
 *   - matches an allow pattern -> allowedWithoutPermission (auto run)
 *   - otherwise                -> keep basePolicy (ask)
 */
export function evaluateAllowlistPolicy(
  basePolicy: ToolPolicy,
  command: string | undefined,
  allowlist: CommandAllowlist,
): ToolPolicy {
  if (!command) {
    return basePolicy;
  }
  if (allowlist.deny.some((p) => commandMatchesGlob(command, p))) {
    return "disabled";
  }
  if (allowlist.allow.some((p) => commandMatchesGlob(command, p))) {
    return "allowedWithoutPermission";
  }
  return basePolicy;
}
