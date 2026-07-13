import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";
import { collectCompletedExchanges } from "../src/conversation.ts";

let entryNumber = 0;

function message(role: string, content: unknown): SessionEntry {
	entryNumber += 1;
	return {
		type: "message",
		id: `entry-${entryNumber}`,
		parentId: entryNumber === 1 ? null : `entry-${entryNumber - 1}`,
		timestamp: new Date(0).toISOString(),
		message: { role, content },
	} as unknown as SessionEntry;
}

describe("collectCompletedExchanges", () => {
	test("counts a tool loop as one user-to-assistant exchange", () => {
		const entries = [
			message("user", [{ type: "text", text: "Fix the failing login" }]),
			message("assistant", [
				{ type: "thinking", thinking: "Inspect first" },
				{ type: "text", text: "I will inspect it." },
				{ type: "toolCall", id: "tool-1", name: "read", arguments: {} },
			]),
			message("toolResult", [{ type: "text", text: "secret tool output" }]),
			message("assistant", [{ type: "text", text: "The login is fixed." }]),
			message("user", [{ type: "text", text: "Add a regression test" }]),
			message("assistant", [{ type: "text", text: "The regression test passes." }]),
		];

		expect(collectCompletedExchanges(entries)).toEqual([
			{
				user: "Fix the failing login",
				assistant: "I will inspect it.\nThe login is fixed.",
			},
			{
				user: "Add a regression test",
				assistant: "The regression test passes.",
			},
		]);
	});

	test("ignores non-text content and extension-only entries", () => {
		const entries = [
			message("user", [
				{ type: "image", data: "base64" },
				{ type: "text", text: "  Describe the screenshot  " },
			]),
			{
				type: "custom",
				customType: "test",
				data: { hidden: true },
				id: "custom-1",
				parentId: null,
				timestamp: new Date(0).toISOString(),
			} as SessionEntry,
			message("assistant", [
				{ type: "thinking", thinking: "Visual analysis" },
				{ type: "text", text: "  It shows the dashboard.  " },
			]),
		];

		expect(collectCompletedExchanges(entries)).toEqual([
			{ user: "Describe the screenshot", assistant: "It shows the dashboard." },
		]);
	});

	test("does not count an exchange without assistant text", () => {
		const entries = [
			message("user", [{ type: "text", text: "Run the tool" }]),
			message("assistant", [{ type: "toolCall", id: "tool-1", name: "bash", arguments: {} }]),
			message("toolResult", [{ type: "text", text: "tool output" }]),
		];

		expect(collectCompletedExchanges(entries)).toEqual([]);
	});

	test("returns only the first three completed exchanges by default", () => {
		const entries = Array.from({ length: 4 }, (_, index) => [
			message("user", [{ type: "text", text: `User ${index + 1}` }]),
			message("assistant", [{ type: "text", text: `Assistant ${index + 1}` }]),
		]).flat();

		expect(collectCompletedExchanges(entries).map((exchange) => exchange.user)).toEqual(["User 1", "User 2", "User 3"]);
	});

	test("bounds each side and collapses whitespace", () => {
		const entries = [
			message("user", [{ type: "text", text: "one    two three four" }]),
			message("assistant", [{ type: "text", text: "alpha\n\n beta gamma" }]),
		];

		expect(collectCompletedExchanges(entries, { maxCharsPerSide: 11 })).toEqual([
			{ user: "one two thr", assistant: "alpha beta " },
		]);
	});
});
