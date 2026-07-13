import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_CONFIG,
	loadConfig as defaultLoadConfig,
	saveConfig as defaultSaveConfig,
	type NamingModelConfig,
} from "./config.ts";
import { collectCompletedExchanges } from "./conversation.ts";
import { generateSessionName as defaultGenerateSessionName } from "./generator.ts";
import {
	formatModelSpec,
	getModelArgumentCompletions,
	listAvailableModels,
	parseModelSpec,
	validateModel,
} from "./models.ts";

const USAGE = "Usage: /auto-rename [model [provider/id]]";
type NoticeLevel = "info" | "warning" | "error";
type RenamePi = Pick<ExtensionAPI, "getSessionName" | "setSessionName">;

export interface ControllerDependencies {
	loadConfig: typeof defaultLoadConfig;
	saveConfig: typeof defaultSaveConfig;
	generateSessionName: typeof defaultGenerateSessionName;
	log(message: string, level: NoticeLevel): void;
}

export interface AutoRenameController {
	refresh(ctx: ExtensionContext): Promise<void>;
	handleAgentSettled(ctx: ExtensionContext): Promise<void>;
	handleCommand(args: string, ctx: ExtensionCommandContext): Promise<void>;
	getArgumentCompletions(prefix: string): ReturnType<typeof getModelArgumentCompletions>;
}

const defaultDependencies: ControllerDependencies = {
	loadConfig: defaultLoadConfig,
	saveConfig: defaultSaveConfig,
	generateSessionName: defaultGenerateSessionName,
	log(message, level) {
		const output = level === "error" ? console.error : console.warn;
		output(`[pi-auto-rename] ${message}`);
	},
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createAutoRenameController(
	pi: RenamePi,
	dependencies: ControllerDependencies = defaultDependencies,
): AutoRenameController {
	let config: NamingModelConfig = { ...DEFAULT_CONFIG };
	let hasValidConfig = false;
	let modelRegistry: Pick<ModelRegistry, "getAvailable"> | undefined;
	let inFlight: Promise<void> | undefined;

	const notify = (ctx: ExtensionContext, message: string, level: NoticeLevel) => {
		if (ctx.hasUI) ctx.ui.notify(message, level);
		else dependencies.log(message, level);
	};

	const refresh = async (ctx: ExtensionContext) => {
		modelRegistry = ctx.modelRegistry;
		try {
			const loaded = await dependencies.loadConfig();
			if (loaded.warnings.length === 0) {
				config = loaded.config;
				hasValidConfig = true;
			} else {
				if (!hasValidConfig) config = loaded.config;
				for (const warning of loaded.warnings) notify(ctx, warning, "warning");
			}
		} catch (error) {
			notify(ctx, `Could not refresh auto-rename configuration: ${errorMessage(error)}`, "warning");
		}
	};

	const runGeneration = async (
		ctx: ExtensionContext,
		exchanges: ReturnType<typeof collectCompletedExchanges>,
		mode: "automatic" | "manual",
	) => {
		if (inFlight) {
			if (mode === "manual") notify(ctx, "Session name generation is already running", "warning");
			return;
		}

		const task = (async () => {
			try {
				const title = await dependencies.generateSessionName(ctx, config, exchanges);
				if (mode === "automatic" && pi.getSessionName()) return;
				pi.setSessionName(title);
				notify(ctx, `Session named: ${title}`, "info");
			} catch (error) {
				const prefix = mode === "automatic" ? "Auto-rename failed" : "Could not rename session";
				notify(ctx, `${prefix}: ${errorMessage(error)}`, "warning");
			}
		})();
		inFlight = task;
		try {
			await task;
		} finally {
			if (inFlight === task) inFlight = undefined;
		}
	};

	const handleAgentSettled = async (ctx: ExtensionContext) => {
		if (pi.getSessionName()) return;
		const exchanges = collectCompletedExchanges(ctx.sessionManager.getBranch());
		if (exchanges.length < 3) return;
		await runGeneration(ctx, exchanges, "automatic");
	};

	const persistModel = async (ctx: ExtensionContext, nextConfig: NamingModelConfig) => {
		await validateModel(ctx.modelRegistry, nextConfig);
		await dependencies.saveConfig(nextConfig);
		config = nextConfig;
		hasValidConfig = true;
		notify(ctx, `Auto-rename model: ${formatModelSpec(config)}`, "info");
	};

	const chooseModel = async (ctx: ExtensionCommandContext) => {
		if (!ctx.hasUI) {
			notify(ctx, "Use /auto-rename model <provider>/<id>", "warning");
			return;
		}
		modelRegistry = ctx.modelRegistry;
		const current = formatModelSpec(config);
		const choices = listAvailableModels(ctx.modelRegistry).map((model) => {
			const spec = formatModelSpec(model);
			return spec === current ? `${spec} (current)` : spec;
		});
		if (choices.length === 0) {
			notify(ctx, "No authenticated models are available", "warning");
			return;
		}
		const choice = await ctx.ui.select("Choose auto-rename model", choices);
		if (!choice) return;
		await persistModel(ctx, parseModelSpec(choice.replace(/ \(current\)$/, "")));
	};

	const handleCommand = async (args: string, ctx: ExtensionCommandContext) => {
		modelRegistry = ctx.modelRegistry;
		await ctx.waitForIdle();
		const normalized = args.trim();
		try {
			if (!normalized) {
				const exchanges = collectCompletedExchanges(ctx.sessionManager.getBranch());
				if (exchanges.length === 0) {
					notify(ctx, "Complete one exchange before renaming the session", "warning");
					return;
				}
				await runGeneration(ctx, exchanges, "manual");
				return;
			}
			if (normalized === "model") {
				await chooseModel(ctx);
				return;
			}
			if (normalized.startsWith("model ")) {
				await persistModel(ctx, parseModelSpec(normalized.slice("model ".length)));
				return;
			}
			notify(ctx, USAGE, "warning");
		} catch (error) {
			notify(ctx, `Auto-rename command failed: ${errorMessage(error)}`, "warning");
		}
	};

	return {
		refresh,
		handleAgentSettled,
		handleCommand,
		getArgumentCompletions(prefix) {
			const available = modelRegistry ? listAvailableModels(modelRegistry) : [];
			return getModelArgumentCompletions(prefix, available);
		},
	};
}
