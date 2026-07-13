import { describe, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { type ControllerDependencies, createAutoRenameController } from "../src/controller.ts";
import { createFakeContext, createFakePi, exchangeEntries } from "./helpers.ts";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function dependencies(overrides: Partial<ControllerDependencies> = {}): ControllerDependencies {
	return {
		loadConfig: vi.fn(async () => ({ config: { ...DEFAULT_CONFIG }, warnings: [] })),
		saveConfig: vi.fn(async () => undefined),
		generateSessionName: vi.fn(async () => "Generated Session Name"),
		log: vi.fn(),
		...overrides,
	};
}

describe("automatic rename", () => {
	test("does nothing before three completed exchanges", async () => {
		const fakePi = createFakePi();
		const deps = dependencies();
		const controller = createAutoRenameController(fakePi.pi, deps);

		await controller.handleAgentSettled(createFakeContext(exchangeEntries(2)).ctx);

		expect(deps.generateSessionName).not.toHaveBeenCalled();
		expect(fakePi.setSessionName).not.toHaveBeenCalled();
	});

	test("names an unnamed session after three completed exchanges", async () => {
		const fakePi = createFakePi();
		const deps = dependencies();
		const controller = createAutoRenameController(fakePi.pi, deps);
		const fakeContext = createFakeContext(exchangeEntries(3));

		await controller.handleAgentSettled(fakeContext.ctx);

		expect(deps.generateSessionName).toHaveBeenCalledOnce();
		expect(fakePi.currentName()).toBe("Generated Session Name");
		expect(fakeContext.notifications).toContainEqual({
			message: "Session named: Generated Session Name",
			level: "info",
		});
	});

	test("protects an existing session name", async () => {
		const fakePi = createFakePi("Manual Name");
		const deps = dependencies();
		const controller = createAutoRenameController(fakePi.pi, deps);

		await controller.handleAgentSettled(createFakeContext(exchangeEntries(3)).ctx);

		expect(deps.generateSessionName).not.toHaveBeenCalled();
		expect(fakePi.currentName()).toBe("Manual Name");
	});

	test("rechecks the session name before applying a late result", async () => {
		const result = deferred<string>();
		const fakePi = createFakePi();
		const deps = dependencies({ generateSessionName: vi.fn(() => result.promise) });
		const controller = createAutoRenameController(fakePi.pi, deps);
		const running = controller.handleAgentSettled(createFakeContext(exchangeEntries(3)).ctx);

		fakePi.setSessionName("Manual Name");
		result.resolve("Generated Name");
		await running;

		expect(fakePi.currentName()).toBe("Manual Name");
		expect(fakePi.setSessionName).toHaveBeenCalledTimes(1);
	});

	test("warns on failure and retries after a later completed exchange", async () => {
		const generate = vi.fn().mockRejectedValueOnce(new Error("provider failed")).mockResolvedValueOnce("Retry Name");
		const fakePi = createFakePi();
		const deps = dependencies({ generateSessionName: generate });
		const controller = createAutoRenameController(fakePi.pi, deps);
		const fakeContext = createFakeContext(exchangeEntries(4));

		await controller.handleAgentSettled(fakeContext.ctx);
		await controller.handleAgentSettled(fakeContext.ctx);

		expect(generate).toHaveBeenCalledTimes(2);
		expect(fakePi.currentName()).toBe("Retry Name");
		expect(fakeContext.notifications[0]).toEqual({
			message: "Auto-rename failed: provider failed",
			level: "warning",
		});
	});

	test("deduplicates concurrent generation", async () => {
		const result = deferred<string>();
		const fakePi = createFakePi();
		const generate = vi.fn(() => result.promise);
		const controller = createAutoRenameController(fakePi.pi, dependencies({ generateSessionName: generate }));
		const ctx = createFakeContext(exchangeEntries(3)).ctx;

		const first = controller.handleAgentSettled(ctx);
		const second = controller.handleAgentSettled(ctx);
		expect(generate).toHaveBeenCalledOnce();
		result.resolve("Only Name");
		await Promise.all([first, second]);

		expect(fakePi.currentName()).toBe("Only Name");
	});
});

describe("/auto-rename", () => {
	test("manually renames with one exchange and may replace a name", async () => {
		const fakePi = createFakePi("Old Name");
		const deps = dependencies({ generateSessionName: vi.fn(async () => "New Name") });
		const controller = createAutoRenameController(fakePi.pi, deps);
		const fakeContext = createFakeContext(exchangeEntries(1));

		await controller.handleCommand("", fakeContext.ctx);

		expect(fakeContext.waitForIdle).toHaveBeenCalledOnce();
		expect(fakePi.currentName()).toBe("New Name");
	});

	test("does not call the model without a completed exchange", async () => {
		const fakePi = createFakePi();
		const deps = dependencies();
		const controller = createAutoRenameController(fakePi.pi, deps);
		const fakeContext = createFakeContext([]);

		await controller.handleCommand("", fakeContext.ctx);

		expect(deps.generateSessionName).not.toHaveBeenCalled();
		expect(fakeContext.notifications.at(-1)?.message).toBe("Complete one exchange before renaming the session");
	});

	test("opens a model picker and persists the selection", async () => {
		const fakePi = createFakePi();
		const deps = dependencies();
		const controller = createAutoRenameController(fakePi.pi, deps);
		const fakeContext = createFakeContext([], { selected: "anthropic/claude-haiku-4-5" });
		await controller.refresh(fakeContext.ctx);

		await controller.handleCommand("model", fakeContext.ctx);

		expect(fakeContext.select).toHaveBeenCalledOnce();
		expect(deps.saveConfig).toHaveBeenCalledWith({ provider: "anthropic", id: "claude-haiku-4-5" });
		expect(fakeContext.notifications.at(-1)?.message).toBe("Auto-rename model: anthropic/claude-haiku-4-5");
	});

	test("accepts a direct provider/model selection", async () => {
		const fakePi = createFakePi();
		const deps = dependencies();
		const controller = createAutoRenameController(fakePi.pi, deps);
		const fakeContext = createFakeContext([]);

		await controller.handleCommand("model anthropic/claude-haiku-4-5", fakeContext.ctx);

		expect(fakeContext.find).toHaveBeenCalledWith("anthropic", "claude-haiku-4-5");
		expect(deps.saveConfig).toHaveBeenCalledWith({ provider: "anthropic", id: "claude-haiku-4-5" });
	});

	test("keeps the prior model when persistence fails", async () => {
		const fakePi = createFakePi();
		const generate = vi.fn(async () => "Name");
		const deps = dependencies({
			saveConfig: vi.fn(async () => {
				throw new Error("disk full");
			}),
			generateSessionName: generate,
		});
		const controller = createAutoRenameController(fakePi.pi, deps);
		const fakeContext = createFakeContext(exchangeEntries(1));

		await controller.handleCommand("model anthropic/claude-haiku-4-5", fakeContext.ctx);
		await controller.handleCommand("", fakeContext.ctx);

		expect(generate).toHaveBeenCalledWith(fakeContext.ctx, DEFAULT_CONFIG, expect.any(Array));
		expect(fakeContext.notifications.some(({ message }) => message.includes("disk full"))).toBe(true);
	});

	test("requires direct model syntax without UI", async () => {
		const log = vi.fn();
		const controller = createAutoRenameController(createFakePi().pi, dependencies({ log }));

		await controller.handleCommand("model", createFakeContext([], { hasUI: false }).ctx);

		expect(log).toHaveBeenCalledWith("Use /auto-rename model <provider>/<id>", "warning");
	});

	test("shows usage for unknown arguments", async () => {
		const fakeContext = createFakeContext([]);
		const controller = createAutoRenameController(createFakePi().pi, dependencies());

		await controller.handleCommand("wat", fakeContext.ctx);

		expect(fakeContext.notifications.at(-1)?.message).toBe("Usage: /auto-rename [model [provider/id]]");
	});

	test("offers model and direct model completions after refresh", async () => {
		const controller = createAutoRenameController(createFakePi().pi, dependencies());
		await controller.refresh(createFakeContext([]).ctx);

		expect(controller.getArgumentCompletions("mo")?.[0]?.value).toBe("model");
		expect(controller.getArgumentCompletions("model anth")?.[0]?.value).toBe("model anthropic/claude-haiku-4-5");
	});
});
