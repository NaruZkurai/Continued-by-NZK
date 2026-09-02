import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    addCommandToAllowlistFile,
    commandMatchesGlob,
    evaluateAllowlistPolicy,
    loadCommandAllowlist,
    vscodeSettingsPath,
} from "./commandAllowlist.js";

// ---------------------------------------------------------------------------
// yolo-restricted command allowlist (HERMETIC).
// - loadCommandAllowlist reads VS Code settings.json `chat.commands.allowList`
//   / `denyList` first (via explicit path param), then fallback text files
//   under the Continue home dir.
// - evaluateAllowlistPolicy applies the three tiers:
//     allow match -> allowedWithoutPermission, deny match -> disabled,
//     otherwise   -> basePolicy.
// ---------------------------------------------------------------------------

let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yolo-all-"));
    process.env.CONTINUE_GLOBAL_DIR = path.join(tmp, ".continue");
});

afterEach(() => {
    if (tmp) {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    delete process.env.CONTINUE_GLOBAL_DIR;
});

afterEach(() => {
    if (tmp) {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    delete process.env.CONTINUE_GLOBAL_DIR;
});

describe("loadCommandAllowlist", () => {
    it("reads allow/deny glob lists from VS Code settings.json", () => {
        const settingsPath = path.join(tmp, "settings.json");
        fs.writeFileSync(
            settingsPath,
            JSON.stringify({
                chat: {
                    commands: {
                        allowList: ["npm test", "git *", "ls"],
                        denyList: ["rm -rf", "sudo*"],
                    },
                },
            }),
        );
        const loaded = loadCommandAllowlist(settingsPath);
        expect(loaded.sourceIsVSCode).toBe(true);
        expect(loaded.allow).toContain("git *");
        expect(loaded.deny).toContain("sudo*");
    });

    it("falls back to text files when settings have no chat.commands", () => {
        const settingsPath = path.join(tmp, "settings.json");
        fs.writeFileSync(settingsPath, JSON.stringify({ editor: {} }));
        const home = path.join(tmp, ".continue");
        fs.mkdirSync(home, { recursive: true });
        fs.writeFileSync(
            path.join(home, "yolo-allowlist.txt"),
            "npm build\ngit status\n# comment\n\nmake",
        );
        fs.writeFileSync(path.join(home, "yolo-denylist.txt"), "wget\ncurl*");

        const loaded = loadCommandAllowlist(settingsPath, home);
        expect(loaded.sourceIsVSCode).toBe(false);
        expect(loaded.allow).toContain("make");
        expect(loaded.deny).toContain("curl*");
        expect(loaded.allow).not.toContain("# comment");
    });

    it("vscodeSettingsPath returns an absolute path ending in settings.json", () => {
        const p = vscodeSettingsPath();
        expect(p.endsWith("settings.json")).toBe(true);
    });
});

describe("commandMatchesGlob", () => {
    it("matches exact, prefix glob, and wildcard", () => {
        expect(commandMatchesGlob("git status", "git status")).toBe(true);
        expect(commandMatchesGlob("git status", "git *")).toBe(true);
        expect(commandMatchesGlob("npm test", "npm *")).toBe(true);
        expect(commandMatchesGlob("ls", "*")).toBe(true);
        expect(commandMatchesGlob("git status", "npm *")).toBe(false);
    });
});

describe("evaluateAllowlistPolicy", () => {
    const allowlist = {
        allow: ["npm *", "git status", "ls"],
        deny: ["rm -rf", "sudo*"],
        sourceIsVSCode: true,
    };

    it("auto-runs allow-matched commands (allowedWithoutPermission)", () => {
        expect(
            evaluateAllowlistPolicy("allowedWithPermission", "npm test", allowlist),
        ).toBe("allowedWithoutPermission");
        expect(
            evaluateAllowlistPolicy("allowedWithPermission", "git status", allowlist),
        ).toBe("allowedWithoutPermission");
    });

    it("disables deny-matched commands", () => {
        expect(
            evaluateAllowlistPolicy("allowedWithPermission", "sudo apt update", allowlist),
        ).toBe("disabled");
        expect(
            evaluateAllowlistPolicy("allowedWithPermission", "rm -rf", allowlist),
        ).toBe("disabled");
    });

    it("keeps base policy for anything else", () => {
        expect(
            evaluateAllowlistPolicy("allowedWithPermission", "python x.py", allowlist),
        ).toBe("allowedWithPermission");
        // Non-glob deny `rm -rf` does not match the longer command.
        expect(
            evaluateAllowlistPolicy("allowedWithPermission", "rm -rf /tmp/x", allowlist),
        ).toBe("allowedWithPermission");
    });
});

describe("addCommandToAllowlistFile", () => {
    it("appends a command to the allowlist file and dedupes", () => {
        const home = path.join(tmp, ".continue");
        fs.mkdirSync(home, { recursive: true });
        fs.writeFileSync(path.join(home, "yolo-allowlist.txt"), "npm test\n");

        const file = addCommandToAllowlistFile("git status", "allow", home);
        expect(file).toBe(path.join(home, "yolo-allowlist.txt"));
        expect(
            fs.readFileSync(path.join(home, "yolo-allowlist.txt"), "utf-8"),
        ).toContain("git status");

        // Dedupe: same command returns but does not duplicate.
        addCommandToAllowlistFile("git status", "allow", home);
        const lines = fs
            .readFileSync(path.join(home, "yolo-allowlist.txt"), "utf-8")
            .split("\n")
            .filter(Boolean);
        expect(lines.filter((l) => l === "git status")).toHaveLength(1);
    });

    it("appends a command to the denylist file", () => {
        const home = path.join(tmp, ".continue");
        const file = addCommandToAllowlistFile("sudo rm -rf /", "deny", home);
        expect(file).toBe(path.join(home, "yolo-denylist.txt"));
        expect(
            fs.readFileSync(path.join(home, "yolo-denylist.txt"), "utf-8"),
        ).toContain("sudo rm -rf /");
    });
});

