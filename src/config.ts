import * as nodeFs from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface NamingModelConfig {
	provider: string;
	id: string;
}

export const DEFAULT_CONFIG: NamingModelConfig = {
	provider: "opencode-go",
	id: "glm-5.2",
};

export interface LoadedConfig {
	config: NamingModelConfig;
	warnings: string[];
}

export interface ConfigFileSystem {
	readFile(path: string, encoding: "utf8"): Promise<string>;
	mkdir(path: string, options: { recursive: true }): Promise<unknown>;
	writeFile(path: string, content: string, encoding: "utf8"): Promise<unknown>;
	rename(from: string, to: string): Promise<unknown>;
	rm(path: string, options: { force: true }): Promise<unknown>;
}

export interface ConfigOptions {
	homeDir?: string;
	fs?: ConfigFileSystem;
	pid?: number;
}

export function getConfigPath(homeDir = homedir()): string {
	return join(homeDir, ".pi", "agent", "auto-rename.json");
}

function isMissingFile(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function parseConfig(value: unknown): NamingModelConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("configuration must be an object");
	}

	const candidate = value as Record<string, unknown>;
	if (typeof candidate.provider !== "string" || !candidate.provider.trim()) {
		throw new Error("provider must be a non-empty string");
	}
	if (typeof candidate.id !== "string" || !candidate.id.trim()) {
		throw new Error("id must be a non-empty string");
	}

	return { provider: candidate.provider.trim(), id: candidate.id.trim() };
}

export async function loadConfig(options: ConfigOptions = {}): Promise<LoadedConfig> {
	const fs = options.fs ?? nodeFs;
	const path = getConfigPath(options.homeDir);

	try {
		const raw = await fs.readFile(path, "utf8");
		return { config: parseConfig(JSON.parse(raw)), warnings: [] };
	} catch (error) {
		if (isMissingFile(error)) {
			return { config: { ...DEFAULT_CONFIG }, warnings: [] };
		}
		const message = error instanceof Error ? error.message : String(error);
		return {
			config: { ...DEFAULT_CONFIG },
			warnings: [`Could not load ${path}: ${message}. Using ${DEFAULT_CONFIG.provider}/${DEFAULT_CONFIG.id}.`],
		};
	}
}

export async function saveConfig(config: NamingModelConfig, options: ConfigOptions = {}): Promise<void> {
	const fs = options.fs ?? nodeFs;
	const path = getConfigPath(options.homeDir);
	const temporaryPath = `${path}.tmp-${options.pid ?? process.pid}`;

	await fs.mkdir(dirname(path), { recursive: true });
	try {
		await fs.writeFile(temporaryPath, `${JSON.stringify(parseConfig(config), null, 2)}\n`, "utf8");
		await fs.rename(temporaryPath, path);
	} catch (error) {
		await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}
