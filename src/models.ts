import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { NamingModelConfig } from "./config.ts";

export interface ModelOption extends NamingModelConfig {
	name: string;
}

export interface ArgumentCompletion {
	value: string;
	label: string;
	description: string;
}

export function formatModelSpec(config: NamingModelConfig): string {
	return `${config.provider}/${config.id}`;
}

export function parseModelSpec(spec: string): NamingModelConfig {
	const match = spec.trim().match(/^([^/\s]+)\/([^/\s]+)$/);
	if (!match) throw new Error("Expected model as <provider>/<id>");
	return { provider: match[1], id: match[2] };
}

export function listAvailableModels(registry: Pick<ModelRegistry, "getAvailable">): ModelOption[] {
	return registry
		.getAvailable()
		.map((model) => ({ provider: model.provider, id: model.id, name: model.name ?? model.id }))
		.sort((left, right) => formatModelSpec(left).localeCompare(formatModelSpec(right)));
}

export async function validateModel(
	registry: Pick<ModelRegistry, "find" | "getApiKeyAndHeaders">,
	config: NamingModelConfig,
) {
	const spec = formatModelSpec(config);
	const model = registry.find(config.provider, config.id);
	if (!model) throw new Error(`Naming model not found: ${spec}`);

	const auth = await registry.getApiKeyAndHeaders(model);
	if (!auth.ok) throw new Error(`Naming model unavailable: ${spec}: ${auth.error}`);
	return { model, auth };
}

export function getModelArgumentCompletions(
	prefix: string,
	models: readonly ModelOption[],
): ArgumentCompletion[] | null {
	const normalized = prefix.trimStart();
	if (!normalized.includes(" ")) {
		if ("model".startsWith(normalized)) {
			return [{ value: "model", label: "model", description: "Choose the naming model" }];
		}
		return null;
	}

	if (!normalized.startsWith("model ")) return null;
	const items = models
		.map((model) => {
			const spec = formatModelSpec(model);
			return {
				value: `model ${spec}`,
				label: spec,
				description: model.name,
			};
		})
		.filter((item) => item.value.startsWith(normalized));
	return items.length > 0 ? items : null;
}
