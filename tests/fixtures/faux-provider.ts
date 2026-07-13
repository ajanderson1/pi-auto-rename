import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFauxCore, fauxAssistantMessage } from "../../node_modules/@earendil-works/pi-ai/dist/providers/faux.js";

const faux = createFauxCore({
	api: "openai-completions",
	provider: "auto-rename-test",
	models: [
		{
			id: "title",
			name: "Auto Rename Test",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 32_000,
			maxTokens: 1_024,
		},
	],
	tokensPerSecond: 10_000,
});

faux.setResponses([
	fauxAssistantMessage("First response"),
	fauxAssistantMessage("Second response"),
	fauxAssistantMessage("Third response"),
	fauxAssistantMessage("Integration Auto Rename"),
	fauxAssistantMessage("Fourth response"),
	fauxAssistantMessage("Unexpected Second Rename"),
]);

export default function fauxProvider(pi: ExtensionAPI) {
	const model = faux.getModel();
	pi.registerProvider("auto-rename-test", {
		name: "Auto Rename Test",
		baseUrl: "http://auto-rename-test.invalid",
		apiKey: "test-key",
		api: "openai-completions",
		streamSimple: faux.streamSimple,
		models: [
			{
				id: model.id,
				name: model.name,
				api: "openai-completions",
				baseUrl: model.baseUrl,
				reasoning: model.reasoning,
				input: model.input,
				cost: model.cost,
				contextWindow: model.contextWindow,
				maxTokens: model.maxTokens,
			},
		],
	});
}
