import {
	type ExtensionContext,
	type ModelRegistry,
	parseArgs,
	resolveModelScopeWithDiagnostics,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { formatModelSpec, type ModelOption } from "./models.ts";

export function getSessionModelPatterns(
	argv: readonly string[],
	enabledModels: readonly string[] | undefined,
): string[] {
	const cliModels = parseArgs([...argv]).models;
	return [...(cliModels ?? enabledModels ?? [])];
}

export async function listSessionScopedModels(
	registry: ModelRegistry,
	patterns: readonly string[],
): Promise<ModelOption[]> {
	if (patterns.length === 0) return [];
	const { scopedModels } = await resolveModelScopeWithDiagnostics([...patterns], registry);
	return scopedModels
		.map(({ model }) => ({ provider: model.provider, id: model.id, name: model.name ?? model.id }))
		.sort((left, right) => formatModelSpec(left).localeCompare(formatModelSpec(right)));
}

export async function getCurrentSessionScopedModels(
	ctx: Pick<ExtensionContext, "cwd" | "isProjectTrusted" | "modelRegistry">,
): Promise<ModelOption[]> {
	const settings = SettingsManager.create(ctx.cwd, undefined, {
		projectTrusted: ctx.isProjectTrusted(),
	});
	const patterns = getSessionModelPatterns(process.argv.slice(2), settings.getEnabledModels());
	return listSessionScopedModels(ctx.modelRegistry, patterns);
}
