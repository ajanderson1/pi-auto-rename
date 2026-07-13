import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";
import { getSessionModelPatterns, listSessionScopedModels } from "../src/session-models.ts";

function model(provider: string, id: string, name = id) {
	return { provider, id, name } as ReturnType<ModelRegistry["getAll"]>[number];
}

describe("getSessionModelPatterns", () => {
	test("uses CLI model scope instead of configured enabled models", () => {
		expect(
			getSessionModelPatterns(
				["--models", "anthropic/claude-sonnet-5,google/gemini-3.5-flash"],
				["opencode-go/glm-5.2"],
			),
		).toEqual(["anthropic/claude-sonnet-5", "google/gemini-3.5-flash"]);
	});

	test("uses configured enabled models when the CLI did not override the scope", () => {
		expect(getSessionModelPatterns([], ["opencode-go/glm-5.2"])).toEqual(["opencode-go/glm-5.2"]);
	});

	test("returns an empty scope when the session has no configured models", () => {
		expect(getSessionModelPatterns([], undefined)).toEqual([]);
	});
});

describe("listSessionScopedModels", () => {
	test("offers only models resolved by the current session scope", async () => {
		const registry = {
			getAvailable: () => [
				model("openai-codex", "gpt-5.5", "GPT 5.5"),
				model("anthropic", "claude-sonnet-5", "Sonnet 5"),
				model("google", "gemini-3.5-flash", "Gemini 3.5 Flash"),
			],
		} as unknown as ModelRegistry;

		await expect(listSessionScopedModels(registry, ["google/*", "anthropic/claude-sonnet-5:high"])).resolves.toEqual([
			{ provider: "anthropic", id: "claude-sonnet-5", name: "Sonnet 5" },
			{ provider: "google", id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
		]);
	});
});
