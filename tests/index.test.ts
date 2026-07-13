import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import { registerAutoRenameExtension } from "../src/index.ts";

interface RegisteredCommand {
	description?: string;
	getArgumentCompletions?: (prefix: string) => Array<{ value: string }> | null;
	handler: (...args: unknown[]) => unknown;
}

describe("extension registration", () => {
	test("registers lifecycle handlers and the auto-rename command", () => {
		const handlers = new Map<string, (...args: unknown[]) => unknown>();
		const commands = new Map<string, RegisteredCommand>();
		const pi = {
			on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => handlers.set(event, handler)),
			registerCommand: vi.fn((name: string, command: RegisteredCommand) => commands.set(name, command)),
			getSessionName: vi.fn(),
			setSessionName: vi.fn(),
		} as unknown as ExtensionAPI;

		registerAutoRenameExtension(pi);

		expect(handlers.has("session_start")).toBe(true);
		expect(handlers.has("agent_settled")).toBe(true);
		const command = commands.get("auto-rename");
		expect(command?.description).toContain("Rename this session");
		expect(command?.description).toContain("naming model");
		expect(command?.getArgumentCompletions?.("mo")).toEqual([
			{ value: "model", label: "model", description: "Choose the naming model" },
		]);
	});
});
