import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { type ConfigFileSystem, DEFAULT_CONFIG, getConfigPath, loadConfig, saveConfig } from "../src/config.ts";

const temporaryDirectories: string[] = [];

async function makeHome(): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "pi-auto-rename-"));
	temporaryDirectories.push(home);
	return home;
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("getConfigPath", () => {
	test("uses Pi's global agent directory", () => {
		expect(getConfigPath("/tmp/home")).toBe("/tmp/home/.pi/agent/auto-rename.json");
	});
});

describe("loadConfig", () => {
	test("returns the default without warning when the file is missing", async () => {
		const result = await loadConfig({ homeDir: await makeHome() });

		expect(result).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
	});

	test("loads a valid configured model", async () => {
		const homeDir = await makeHome();
		const path = getConfigPath(homeDir);
		await saveConfig({ provider: "anthropic", id: "claude-haiku-4-5" }, { homeDir });

		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
			provider: "anthropic",
			id: "claude-haiku-4-5",
		});
		expect(await loadConfig({ homeDir })).toEqual({
			config: { provider: "anthropic", id: "claude-haiku-4-5" },
			warnings: [],
		});
	});

	test("warns and uses the default for malformed JSON", async () => {
		const homeDir = await makeHome();
		await saveConfig(DEFAULT_CONFIG, { homeDir });
		await writeFile(getConfigPath(homeDir), "{not-json", "utf8");

		const result = await loadConfig({ homeDir });

		expect(result.config).toEqual(DEFAULT_CONFIG);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("Could not load");
	});

	test.each([
		{},
		{ provider: "", id: "model" },
		{ provider: "provider", id: 42 },
		[],
	])("warns and uses the default for invalid config %#", async (invalid) => {
		const homeDir = await makeHome();
		await saveConfig(DEFAULT_CONFIG, { homeDir });
		await writeFile(getConfigPath(homeDir), JSON.stringify(invalid), "utf8");

		const result = await loadConfig({ homeDir });

		expect(result.config).toEqual(DEFAULT_CONFIG);
		expect(result.warnings).toHaveLength(1);
	});
});

describe("saveConfig", () => {
	test("creates the parent and replaces the config atomically", async () => {
		const operations: string[] = [];
		const fs: ConfigFileSystem = {
			async readFile() {
				throw Object.assign(new Error("missing"), { code: "ENOENT" });
			},
			async mkdir() {
				operations.push("mkdir");
				return undefined;
			},
			async writeFile(path, content) {
				operations.push(`write:${path}:${content.endsWith("\n")}`);
			},
			async rename(from, to) {
				operations.push(`rename:${from}:${to}`);
			},
			async rm() {
				operations.push("rm");
			},
		};

		await saveConfig({ provider: "google", id: "gemini-3-flash-preview" }, { homeDir: "/home/aj", fs, pid: 123 });

		expect(operations).toEqual([
			"mkdir",
			"write:/home/aj/.pi/agent/auto-rename.json.tmp-123:true",
			"rename:/home/aj/.pi/agent/auto-rename.json.tmp-123:/home/aj/.pi/agent/auto-rename.json",
		]);
	});

	test("removes the temporary file when rename fails", async () => {
		const operations: string[] = [];
		const fs: ConfigFileSystem = {
			async readFile() {
				throw Object.assign(new Error("missing"), { code: "ENOENT" });
			},
			async mkdir() {},
			async writeFile() {},
			async rename() {
				throw new Error("rename failed");
			},
			async rm(path) {
				operations.push(path);
			},
		};

		await expect(saveConfig(DEFAULT_CONFIG, { homeDir: "/home/aj", fs, pid: 7 })).rejects.toThrow("rename failed");
		expect(operations).toEqual(["/home/aj/.pi/agent/auto-rename.json.tmp-7"]);
	});
});
