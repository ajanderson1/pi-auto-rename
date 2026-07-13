import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ControllerDependencies, createAutoRenameController } from "./controller.ts";

export function registerAutoRenameExtension(pi: ExtensionAPI, dependencies?: ControllerDependencies) {
	const controller = createAutoRenameController(pi, dependencies);

	pi.on("session_start", async (_event, ctx) => {
		await controller.refresh(ctx);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		await controller.handleAgentSettled(ctx);
	});

	pi.registerCommand("auto-rename", {
		description: "Rename this session now or choose the auto-rename naming model",
		getArgumentCompletions(prefix) {
			return controller.getArgumentCompletions(prefix);
		},
		async handler(args, ctx) {
			await controller.handleCommand(args, ctx);
		},
	});

	return controller;
}

export default function autoRenameExtension(pi: ExtensionAPI) {
	registerAutoRenameExtension(pi);
}
