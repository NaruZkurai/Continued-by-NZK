import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { addCommandToAllowlistFile, loadCommandAllowlist } from "./commandAllowlist.js";

describe("loadCommandAllowlist (file + config + VS Code merge)", () => {
  it("returns empty when nothing is configured", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "yolo-test-"));
    try {
      const result = loadCommandAllowlist(undefined, home, "/nonexistent/settings.json");
      expect(result.allow).toEqual([]);
      expect(result.deny).toEqual([]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("reads patterns from fallback text files", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "yolo-test-"));
    try {
      fs.writeFileSync(path.join(home, "yolo-allowlist.txt"), "git *\n# comment\nls\n");
      fs.writeFileSync(path.join(home, "yolo-denylist.txt"), "rm -rf /\n");
      const result = loadCommandAllowlist(undefined, home, "/nonexistent/settings.json");
      expect(result.allow).toEqual(["git *", "ls"]);
      expect(result.deny).toEqual(["rm -rf /"]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("merges config overrides with file patterns (not mutex)", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "yolo-test-"));
    try {
      fs.writeFileSync(path.join(home, "yolo-allowlist.txt"), "ls\n");
      const result = loadCommandAllowlist(
        { allow: ["npm *"], deny: [] },
        home,
        "/nonexistent/settings.json",
      );
      expect(result.allow).toEqual(["npm *", "ls"]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("reads VS Code settings chat.commands.allowList", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "yolo-test-"));
    const settings = path.join(home, "settings.json");
    try {
      fs.writeFileSync(
        settings,
        JSON.stringify({
          chat: {
            commands: {
              allowList: ["git status"],
              denyList: ["nuke"],
            },
          },
        }),
      );
      const result = loadCommandAllowlist(undefined, home, settings);
      expect(result.allow).toContain("git status");
      expect(result.deny).toContain("nuke");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("addCommandToAllowlistFile", () => {
  it("appends and dedupes", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "yolo-test-"));
    try {
      const file = path.join(home, "yolo-allowlist.txt");
      addCommandToAllowlistFile("ls", "allow", home);
      addCommandToAllowlistFile("ls", "allow", home);
      addCommandToAllowlistFile("pwd", "allow", home);
      const content = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
      expect(content).toEqual(["ls", "pwd"]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
