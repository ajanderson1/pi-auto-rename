import type { ExtensionAPI, ExtensionCommandContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

let entryId = 0;

function message(role: "user" | "assistant", text: string): SessionEntry {
	entryId += 1;
	return {
		type: "message",
		id: `entry-${entryId}`,
		parentId: entryId === 1 ? null : `entry-${entryId - 1}`,
		timestamp: new Date(0).toISOString(),
		message: { role, content: [{ type: "text", text }] },
	} as unknown as SessionEntry;
}

export function exchangeEntries(count: number): SessionEntry[] {
	return Array.from({ length: count }, (_, index) => [
		message("user", `User request ${index + 1}`),
		message("assistant", `Assistant response ${index + 1}`),
	]).flat();
}

export function createFakePi(initialName?: string) {
	let name = initialName;
	const setSessionName = vi.fn((nextName: string) => {
		name = nextName;
	});
	const getSessionName = vi.fn(() => name);
	return {
		pi: { setSessionName, getSessionName } as unknown as ExtensionAPI,
		setSessionName,
		getSessionName,
		currentName: () => name,
	};
}

interface FakeContextOptions {
	hasUI?: boolean;
	selected?: string;
	models?: Array<{ provider: string; id: string; name: string }>;
}

export function createFakeContext(entries: SessionEntry[], options: FakeContextOptions = {}) {
	const notifications: Array<{ message: string; level: string | undefined }> = [];
	const availableModels = options.models ?? [
		{ provider: "opencode-go", id: "glm-5.2", name: "GLM 5.2" },
		{ provider: "anthropic", id: "claude-haiku-4-5", name: "Haiku" },
	];
	const find = vi.fn((provider: string, id: string) =>
		availableModels.find((model) => model.provider === provider && model.id === id),
	);
	const getApiKeyAndHeaders = vi.fn(async () => ({ ok: true as const, apiKey: "secret" }));
	const waitForIdle = vi.fn(async () => undefined);
	const select = vi.fn(async () => options.selected);
	const ctx = {
		cwd: "/tmp/project",
		signal: undefined,
		hasUI: options.hasUI ?? true,
		mode: options.hasUI === false ? "print" : "tui",
		waitForIdle,
		sessionManager: { getBranch: () => entries },
		modelRegistry: {
			getAvailable: () => availableModels,
			find,
			getApiKeyAndHeaders,
		},
		ui: {
			notify(message: string, level?: string) {
				notifications.push({ message, level });
			},
			select,
		},
	} as unknown as ExtensionCommandContext;
	return { ctx, notifications, waitForIdle, select, find, getApiKeyAndHeaders };
}
