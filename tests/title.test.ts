import { describe, expect, test } from "vitest";
import { buildTitlePrompt, sanitizeTitle } from "../src/title.ts";

describe("buildTitlePrompt", () => {
	test("includes project and numbered completed exchanges", () => {
		const prompt = buildTitlePrompt("pi-auto-rename", [
			{ user: "Build an extension", assistant: "I will inspect Pi's API." },
			{ user: "Use three turns", assistant: "I will count completed exchanges." },
		]);

		expect(prompt).toContain("Project: pi-auto-rename");
		expect(prompt).toContain("Exchange 1\nUser: Build an extension\nAssistant: I will inspect Pi's API.");
		expect(prompt).toContain("Exchange 2\nUser: Use three turns");
		expect(prompt).toContain("3–8 words");
		expect(prompt).toContain("Return only the session name");
	});
});

describe("sanitizeTitle", () => {
	test.each([
		['### Title: "Fix   auth"\nextra', "Fix auth"],
		["- Session: `Review release workflow`", "Review release workflow"],
		["  **Title:** Build model picker  ", "Build model picker"],
		['"Title: Fix auth"', "Fix auth"],
		["1. Title: Review release workflow", "Review release workflow"],
	])("sanitises %j", (raw, expected) => {
		expect(sanitizeTitle(raw)).toBe(expected);
	});

	test("truncates to 60 characters at a word boundary", () => {
		const raw = "Implement a deterministic automatic session naming extension with model selection";
		const title = sanitizeTitle(raw);

		expect(title.length).toBeLessThanOrEqual(60);
		expect(title).toBe("Implement a deterministic automatic session naming extension");
	});

	test.each(["", "   ", "###", "Title:", "- **Title:** ``"])("rejects empty output %j", (raw) => {
		expect(() => sanitizeTitle(raw)).toThrow("Naming model returned an empty session name");
	});
});
