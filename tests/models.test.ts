import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import {
	formatModelSpec,
	getModelArgumentCompletions,
	listAvailableModels,
	parseModelSpec,
	validateModel,
} from "../src/models.ts";

function model(provider: string, id: string, name = id) {
	return { provider, id, name } as ReturnType<ModelRegistry["getAll"]>[number];
}

describe("model specs", () => {
	test("formats and parses an exact provider/model pair", () => {
		expect(formatModelSpec({ provider: "anthropic", id: "claude-haiku-4-5" })).toBe("anthropic/claude-haiku-4-5");
		expect(parseModelSpec(" anthropic/claude-haiku-4-5 ")).toEqual({
			provider: "anthropic",
			id: "claude-haiku-4-5",
		});
	});

	test("preserves slashes inside a model ID", () => {
		expect(parseModelSpec("openrouter/anthropic/claude-sonnet-5")).toEqual({
			provider: "openrouter",
			id: "anthropic/claude-sonnet-5",
		});
	});

	test.each(["", "anthropic", "/model", "provider/", "provider/model id"])("rejects invalid model spec %j", (spec) => {
		expect(() => parseModelSpec(spec)).toThrow("Expected model as <provider>/<id>");
	});
});

describe("listAvailableModels", () => {
	test("sorts authenticated models by provider and id", () => {
		const registry = {
			getAvailable: () => [model("google", "zeta"), model("anthropic", "sonnet"), model("google", "alpha")],
		};

		expect(listAvailableModels(registry)).toEqual([
			{ provider: "anthropic", id: "sonnet", name: "sonnet" },
			{ provider: "google", id: "alpha", name: "alpha" },
			{ provider: "google", id: "zeta", name: "zeta" },
		]);
	});
});

describe("validateModel", () => {
	test("returns the exact model and resolved auth", async () => {
		const selected = model("google", "gemini");
		const registry = {
			find: vi.fn(() => selected),
			hasConfiguredAuth: vi.fn(() => true),
			getApiKeyAndHeaders: vi.fn(async () => ({ ok: true as const, apiKey: "secret", headers: { x: "y" } })),
		};

		await expect(validateModel(registry, { provider: "google", id: "gemini" })).resolves.toEqual({
			model: selected,
			auth: { ok: true, apiKey: "secret", headers: { x: "y" } },
		});
		expect(registry.find).toHaveBeenCalledWith("google", "gemini");
	});

	test("rejects a model missing from the registry", async () => {
		const registry = { find: () => undefined, hasConfiguredAuth: vi.fn(), getApiKeyAndHeaders: vi.fn() };

		await expect(validateModel(registry, { provider: "missing", id: "model" })).rejects.toThrow(
			"Naming model not found: missing/model",
		);
		expect(registry.getApiKeyAndHeaders).not.toHaveBeenCalled();
	});

	test("rejects a model without configured credentials", async () => {
		const getApiKeyAndHeaders = vi.fn();
		const registry = {
			find: () => model("google", "gemini"),
			hasConfiguredAuth: () => false,
			getApiKeyAndHeaders,
		};

		await expect(validateModel(registry, { provider: "google", id: "gemini" })).rejects.toThrow(
			"Naming model unavailable: google/gemini: no configured credentials",
		);
		expect(getApiKeyAndHeaders).not.toHaveBeenCalled();
	});

	test("rejects unavailable credentials without fallback", async () => {
		const registry = {
			find: () => model("google", "gemini"),
			hasConfiguredAuth: () => true,
			getApiKeyAndHeaders: async () => ({ ok: false as const, error: "Log in first" }),
		};

		await expect(validateModel(registry, { provider: "google", id: "gemini" })).rejects.toThrow(
			"Naming model unavailable: google/gemini: Log in first",
		);
	});
});

describe("getModelArgumentCompletions", () => {
	const models = [
		{ provider: "anthropic", id: "claude-haiku-4-5", name: "Haiku" },
		{ provider: "google", id: "gemini-3-flash-preview", name: "Gemini Flash" },
	];

	test("offers the model subcommand", () => {
		expect(getModelArgumentCompletions("mo", models)).toEqual([
			{ value: "model", label: "model", description: "Choose the naming model" },
		]);
	});

	test("offers matching direct model selections", () => {
		expect(getModelArgumentCompletions("model goo", models)).toEqual([
			{
				value: "model google/gemini-3-flash-preview",
				label: "google/gemini-3-flash-preview",
				description: "Gemini Flash",
			},
		]);
	});

	test("returns null when there are no matches", () => {
		expect(getModelArgumentCompletions("other", models)).toBeNull();
	});
});
