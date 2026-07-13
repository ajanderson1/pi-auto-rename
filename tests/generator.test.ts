import type { Api, AssistantMessage, Context, Model, ProviderStreamOptions } from "@earendil-works/pi-ai/compat";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";
import type { Exchange } from "../src/conversation.ts";
import { type CompleteFunction, type GenerationContext, generateSessionName } from "../src/generator.ts";

const exchanges: Exchange[] = [{ user: "Build automatic naming", assistant: "I will implement the extension." }];
type CompleteCall = [Model<Api>, Context, ProviderStreamOptions?];

function model(provider = "opencode-go", id = "glm-5.2") {
	return { provider, id, name: id } as ReturnType<ModelRegistry["getAll"]>[number];
}

function response(
	text: string,
	stopReason: AssistantMessage["stopReason"] = "stop",
	errorMessage?: string,
): AssistantMessage {
	return { content: [{ type: "text", text }], stopReason, errorMessage } as AssistantMessage;
}

function asComplete(fn: (...args: CompleteCall) => Promise<AssistantMessage>): CompleteFunction {
	return fn as CompleteFunction;
}

function context(overrides: Partial<GenerationContext> = {}): GenerationContext {
	const selected = model();
	return {
		cwd: "/Users/aj/project-name",
		signal: undefined,
		modelRegistry: {
			find: vi.fn(() => selected),
			getApiKeyAndHeaders: vi.fn(async () => ({
				ok: true as const,
				apiKey: "api-key",
				headers: { "x-test": "yes" },
			})),
		},
		...overrides,
	};
}

describe("generateSessionName", () => {
	test("calls the exact configured model and sanitises its text", async () => {
		const ctx = context();
		const complete = vi.fn(async (..._args: CompleteCall) => response('### Title: "Build Auto Rename"'));

		const title = await generateSessionName(ctx, { provider: "opencode-go", id: "glm-5.2" }, exchanges, {
			complete: asComplete(complete),
		});

		expect(title).toBe("Build Auto Rename");
		expect(ctx.modelRegistry.find).toHaveBeenCalledWith("opencode-go", "glm-5.2");
		expect(complete).toHaveBeenCalledOnce();
		const [calledModel, request, options] = complete.mock.calls[0];
		const userMessage = request.messages[0] as { content: Array<{ type: string; text?: string }> };
		expect(calledModel).toMatchObject({ provider: "opencode-go", id: "glm-5.2" });
		expect(userMessage.content[0].text).toContain("Project: project-name");
		expect(options).toMatchObject({ apiKey: "api-key", headers: { "x-test": "yes" } });
		expect(options?.signal).toBeInstanceOf(AbortSignal);
	});

	test("rejects a missing configured model instead of falling back", async () => {
		const ctx = context({
			modelRegistry: { find: () => undefined, getApiKeyAndHeaders: vi.fn() },
		});
		const complete = vi.fn(async (..._args: CompleteCall) => response("unused"));

		await expect(
			generateSessionName(ctx, { provider: "missing", id: "model" }, exchanges, {
				complete: asComplete(complete),
			}),
		).rejects.toThrow("Naming model not found: missing/model");
		expect(complete).not.toHaveBeenCalled();
	});

	test("propagates credential errors", async () => {
		const ctx = context({
			modelRegistry: {
				find: () => model(),
				getApiKeyAndHeaders: async () => ({ ok: false as const, error: "No credentials" }),
			},
		});

		await expect(generateSessionName(ctx, { provider: "opencode-go", id: "glm-5.2" }, exchanges)).rejects.toThrow(
			"Naming model unavailable: opencode-go/glm-5.2: No credentials",
		);
	});

	test("rejects an empty text response", async () => {
		await expect(
			generateSessionName(context(), { provider: "opencode-go", id: "glm-5.2" }, exchanges, {
				complete: asComplete(async () => response("   ")),
			}),
		).rejects.toThrow("Naming model returned an empty session name");
	});

	test("propagates provider failures", async () => {
		await expect(
			generateSessionName(context(), { provider: "opencode-go", id: "glm-5.2" }, exchanges, {
				complete: asComplete(async () => {
					throw new Error("provider failed");
				}),
			}),
		).rejects.toThrow("provider failed");
	});

	test("rejects partial text from a resolved provider error", async () => {
		await expect(
			generateSessionName(context(), { provider: "opencode-go", id: "glm-5.2" }, exchanges, {
				complete: asComplete(async () => response("Partial title", "error", "quota exceeded")),
			}),
		).rejects.toThrow("Session name generation failed: quota exceeded");
	});

	test("rejects partial text from an aborted response", async () => {
		await expect(
			generateSessionName(context(), { provider: "opencode-go", id: "glm-5.2" }, exchanges, {
				complete: asComplete(async () => response("Partial title", "aborted")),
			}),
		).rejects.toThrow("Session name generation aborted");
	});

	test("times out a stalled provider", async () => {
		await expect(
			generateSessionName(context(), { provider: "opencode-go", id: "glm-5.2" }, exchanges, {
				timeoutMs: 5,
				complete: asComplete(async () => new Promise(() => undefined)),
			}),
		).rejects.toThrow("Session name generation timed out after 5ms");
	});

	test("links caller cancellation to the model request", async () => {
		const parent = new AbortController();
		let markStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const complete = vi.fn(
			async (_model: Model<Api>, _context: Context, options?: ProviderStreamOptions) =>
				new Promise<AssistantMessage>((_resolve, reject) => {
					markStarted?.();
					options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				}),
		);
		const promise = generateSessionName(
			context({ signal: parent.signal }),
			{ provider: "opencode-go", id: "glm-5.2" },
			exchanges,
			{ complete: asComplete(complete) },
		);

		await started;
		parent.abort();

		await expect(promise).rejects.toThrow("aborted");
		expect(complete.mock.calls[0][2]?.signal?.aborted).toBe(true);
	});
});
