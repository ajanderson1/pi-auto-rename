import { basename } from "node:path";
import { complete as defaultComplete } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { NamingModelConfig } from "./config.ts";
import type { Exchange } from "./conversation.ts";
import { validateModel } from "./models.ts";
import { buildTitlePrompt, sanitizeTitle } from "./title.ts";

const DEFAULT_TIMEOUT_MS = 15_000;

export type CompleteFunction = typeof defaultComplete;

export interface GenerationOptions {
	complete?: CompleteFunction;
	timeoutMs?: number;
}

export type GenerationContext = Pick<ExtensionContext, "cwd" | "signal"> & {
	modelRegistry: Pick<ModelRegistry, "find" | "getApiKeyAndHeaders">;
};

export async function generateSessionName(
	ctx: GenerationContext,
	config: NamingModelConfig,
	exchanges: readonly Exchange[],
	options: GenerationOptions = {},
): Promise<string> {
	const { model, auth } = await validateModel(ctx.modelRegistry, config);
	const controller = new AbortController();
	const abortFromParent = () => controller.abort(ctx.signal?.reason);
	if (ctx.signal?.aborted) abortFromParent();
	else ctx.signal?.addEventListener("abort", abortFromParent, { once: true });

	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new Error(`Session name generation timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		timer.unref?.();
	});

	try {
		const prompt = buildTitlePrompt(basename(ctx.cwd), exchanges);
		const response = await Promise.race([
			(options.complete ?? defaultComplete)(
				model,
				{
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: prompt }],
							timestamp: Date.now(),
						},
					],
				},
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					env: auth.env,
					signal: controller.signal,
				},
			),
			timeout,
		]);
		const text = response.content
			.filter(
				(block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string",
			)
			.map((block) => block.text)
			.join("\n");
		return sanitizeTitle(text);
	} finally {
		if (timer) clearTimeout(timer);
		ctx.signal?.removeEventListener("abort", abortFromParent);
	}
}
