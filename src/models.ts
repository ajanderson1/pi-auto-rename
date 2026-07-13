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
	const normalized = spec.trim();
	const separator = normalized.indexOf("/");
	const provider = normalized.slice(0, separator);
	const id = normalized.slice(separator + 1);
	if (separator <= 0 || !id || /\s/.test(provider) || /\s/.test(id)) {
		throw new Error("Expected model as <provider>/<id>");
	}
	return { provider, id };
}

export async function validateModel(
	registry: Pick<ModelRegistry, "find" | "hasConfiguredAuth" | "getApiKeyAndHeaders">,
	config: NamingModelConfig,
) {
	const spec = formatModelSpec(config);
	const model = registry.find(config.provider, config.id);
	if (!model) throw new Error(`Naming model not found: ${spec}`);
	if (!registry.hasConfiguredAuth(model)) {
		throw new Error(`Naming model unavailable: ${spec}: no configured credentials`);
	}

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
