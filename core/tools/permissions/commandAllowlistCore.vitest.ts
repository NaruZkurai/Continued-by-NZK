import { describe, expect, it } from "vitest";

import {
    commandMatchesGlob,
    evaluateAllowlistPolicy,
} from "./commandAllowlistCore.js";

describe("commandMatchesGlob", () => {
  it("matches exact strings verbatim", () => {
    expect(commandMatchesGlob("git status", "git status")).toBe(true);
    expect(commandMatchesGlob("git status", "npm test")).toBe(false);
  });

  it("matches * as any run of characters", () => {
    expect(commandMatchesGlob("anything at all", "*")).toBe(true);
    expect(commandMatchesGlob("git status", "git *")).toBe(true);
    expect(commandMatchesGlob("git status --short", "git status*")).toBe(true);
    expect(commandMatchesGlob("npm test -- --watch", "npm *")).toBe(true);
    expect(commandMatchesGlob("git status", "npm *")).toBe(false);
  });

  it("matches ? as a single character", () => {
    expect(commandMatchesGlob("git status", "git statu?")).toBe(true);
    expect(commandMatchesGlob("git status", "git status?")).toBe(false);
    expect(commandMatchesGlob("git status", "git stat???")).toBe(false);
  });

  it("handles empty pattern", () => {
    expect(commandMatchesGlob("git status", "")).toBe(false);
    expect(commandMatchesGlob("git status", undefined as unknown as string)).toBe(
      false,
    );
  });
});

describe("evaluateAllowlistPolicy", () => {
  it("autos when allow matches", () => {
    const result = evaluateAllowlistPolicy("allowedWithPermission", "npm test", {
      allow: ["npm *"],
      deny: [],
    });
    expect(result).toBe("allowedWithoutPermission");
  });

  it("* allows everything", () => {
    const result = evaluateAllowlistPolicy("allowedWithPermission", "rm -rf /x", {
      allow: ["*"],
      deny: [],
    });
    expect(result).toBe("allowedWithoutPermission");
  });

  it("disables on deny match even when also in allow", () => {
    const result = evaluateAllowlistPolicy("allowedWithPermission", "rm -rf /tmp/x", {
      allow: ["rm *"],
      deny: ["rm -rf /tmp/x"],
    });
    expect(result).toBe("disabled");
  });

  it("keeps base policy otherwise", () => {
    const result = evaluateAllowlistPolicy("allowedWithPermission", "ls", {
      allow: ["git *"],
      deny: [],
    });
    expect(result).toBe("allowedWithPermission");
  });

  it("keeps base policy for undefined command", () => {
    const result = evaluateAllowlistPolicy("disabled", undefined, {
      allow: ["*"],
      deny: [],
    });
    expect(result).toBe("disabled");
  });
});
