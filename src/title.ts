import type { Exchange } from "./conversation.ts";

const DEFAULT_MAX_TITLE_CHARS = 60;

export function buildTitlePrompt(projectName: string, exchanges: readonly Exchange[]): string {
	const transcript = exchanges
		.map((exchange, index) => `Exchange ${index + 1}\nUser: ${exchange.user}\nAssistant: ${exchange.assistant}`)
		.join("\n\n");

	return [
		"Generate a concise, descriptive name for this Pi coding session.",
		"Use 3–8 words. Describe the work, not the conversation.",
		"Return only the session name with no quotes, label, Markdown, or explanation.",
		`Project: ${projectName}`,
		"",
		transcript,
	].join("\n");
}

function firstNonEmptyLine(raw: string): string {
	return (
		raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean) ?? ""
	);
}

function stripMatchingQuotes(value: string): string {
	const match = value.match(/^(["'`])([\s\S]*)\1$/);
	return match ? match[2] : value;
}

export function sanitizeTitle(raw: string, maxChars = DEFAULT_MAX_TITLE_CHARS): string {
	let title = stripMatchingQuotes(firstNonEmptyLine(raw)).trim();
	title = title
		.replace(/^(?:#{1,6}\s*|[-*+]\s+|\d+[.)]\s+)/, "")
		.replace(/^\*{0,2}(?:title|session(?:\s+name)?)\s*:\*{0,2}\s*/i, "")
		.trim();
	title = stripMatchingQuotes(title).replace(/\s+/g, " ").trim();

	if (title.length > maxChars) {
		const candidate = title.slice(0, maxChars + 1);
		const wordBoundary = candidate.lastIndexOf(" ");
		title = (wordBoundary > 0 ? candidate.slice(0, wordBoundary) : title.slice(0, maxChars)).trim();
	}

	if (!title || /^(?:#{1,6}|[-*+])$/.test(title)) {
		throw new Error("Naming model returned an empty session name");
	}
	return title;
}
