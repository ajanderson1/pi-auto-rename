import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export interface Exchange {
	user: string;
	assistant: string;
}

export interface ConversationOptions {
	maxExchanges?: number;
	maxCharsPerSide?: number;
}

const DEFAULT_MAX_EXCHANGES = 3;
const DEFAULT_MAX_CHARS_PER_SIDE = 4_000;

function messageRole(entry: SessionEntry): string | undefined {
	if (entry.type !== "message") return undefined;
	return typeof entry.message.role === "string" ? entry.message.role : undefined;
}

function messageText(entry: SessionEntry): string {
	if (entry.type !== "message" || !("content" in entry.message)) return "";
	const content = entry.message.content;
	if (typeof content === "string") return content.replace(/\s+/g, " ").trim();
	if (!Array.isArray(content)) return "";

	return content
		.filter(
			(block): block is { type: "text"; text: string } =>
				typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string",
		)
		.map((block) => block.text)
		.join("\n")
		.replace(/\s+/g, " ")
		.trim();
}

function bound(text: string, maxChars: number): string {
	return text.slice(0, maxChars);
}

export function collectCompletedExchanges(
	entries: readonly SessionEntry[],
	options: ConversationOptions = {},
): Exchange[] {
	const maxExchanges = options.maxExchanges ?? DEFAULT_MAX_EXCHANGES;
	const maxCharsPerSide = options.maxCharsPerSide ?? DEFAULT_MAX_CHARS_PER_SIDE;
	const exchanges: Exchange[] = [];
	let user = "";
	let assistantParts: string[] = [];

	const finishCandidate = () => {
		const assistant = assistantParts.join("\n").trim();
		if (user && assistant) {
			exchanges.push({
				user: bound(user, maxCharsPerSide),
				assistant: bound(assistant, maxCharsPerSide),
			});
		}
		user = "";
		assistantParts = [];
	};

	for (const entry of entries) {
		const role = messageRole(entry);
		if (role === "user") {
			finishCandidate();
			user = messageText(entry);
			if (exchanges.length >= maxExchanges) break;
			continue;
		}
		if (role === "assistant" && user) {
			const text = messageText(entry);
			if (text) assistantParts.push(text);
		}
	}

	if (exchanges.length < maxExchanges) finishCandidate();
	return exchanges.slice(0, maxExchanges);
}
