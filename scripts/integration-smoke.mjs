#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryHome = await mkdtemp(join(tmpdir(), "pi-auto-rename-integration-"));
const child = spawn(
	"pnpm",
	[
		"exec",
		"pi",
		"-e",
		"./tests/fixtures/faux-provider.ts",
		"-e",
		"./src/index.ts",
		"--mode",
		"rpc",
		"--no-session",
		"--provider",
		"auto-rename-test",
		"--model",
		"title",
		"--models",
		"auto-rename-test/title",
	],
	{
		cwd: process.cwd(),
		env: { ...process.env, HOME: temporaryHome },
		stdio: ["pipe", "pipe", "pipe"],
	},
);

let stdoutBuffer = "";
let stderr = "";
let sequence = 0;
let settledCount = 0;
let pickerOptions;
const pendingResponses = new Map();
const settledWaiters = [];

function failAll(error) {
	for (const pending of pendingResponses.values()) pending.reject(error);
	pendingResponses.clear();
	for (const waiter of settledWaiters.splice(0)) waiter.reject(error);
}

const childExited = new Promise((resolve) => {
	child.once("exit", (code, signal) => {
		if (pendingResponses.size > 0 || settledWaiters.length > 0) {
			failAll(new Error(`Pi RPC exited before completing the smoke test (code=${code}, signal=${signal})`));
		}
		resolve();
	});
});
child.once("error", failAll);

function handleMessage(message) {
	if (process.env.DEBUG_RPC) process.stderr.write(`${JSON.stringify(message)}\n`);
	if (message.type === "response" && message.id) {
		const pending = pendingResponses.get(message.id);
		if (pending) {
			pendingResponses.delete(message.id);
			if (message.success) pending.resolve(message);
			else pending.reject(new Error(message.error ?? `RPC command ${message.command} failed`));
		}
	}
	if (
		message.type === "extension_ui_request" &&
		message.method === "select" &&
		message.title === "Choose auto-rename model"
	) {
		pickerOptions = message.options;
		child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: message.id, cancelled: true })}\n`);
	}
	if (message.type === "agent_settled") {
		settledCount += 1;
		for (const waiter of [...settledWaiters]) {
			if (settledCount >= waiter.target) {
				settledWaiters.splice(settledWaiters.indexOf(waiter), 1);
				waiter.resolve();
			}
		}
	}
	if (message.type === "extension_error") {
		failAll(new Error(`Pi extension error: ${message.error}`));
	}
}

child.stdout.on("data", (chunk) => {
	stdoutBuffer += chunk.toString("utf8");
	while (true) {
		const newline = stdoutBuffer.indexOf("\n");
		if (newline < 0) break;
		const line = stdoutBuffer.slice(0, newline).replace(/\r$/, "");
		stdoutBuffer = stdoutBuffer.slice(newline + 1);
		if (line) handleMessage(JSON.parse(line));
	}
});
child.stderr.on("data", (chunk) => {
	stderr += chunk.toString("utf8");
});

function send(command) {
	sequence += 1;
	const id = `request-${sequence}`;
	return new Promise((resolve, reject) => {
		pendingResponses.set(id, { resolve, reject });
		child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
	});
}

function waitForSettled(target) {
	if (settledCount >= target) return Promise.resolve();
	return new Promise((resolve, reject) => settledWaiters.push({ target, resolve, reject }));
}

async function prompt(message, targetSettledCount) {
	await send({ type: "prompt", message });
	await waitForSettled(targetSettledCount);
}

const timeout = setTimeout(() => {
	child.kill("SIGKILL");
}, 30_000);
timeout.unref?.();

try {
	const commands = await send({ type: "get_commands" });
	const autoRename = commands.data.commands.find(
		(command) => command.name === "auto-rename" && command.source === "extension",
	);
	if (!autoRename) throw new Error("auto-rename command was not registered");

	await send({ type: "prompt", message: "/auto-rename model auto-rename-test/title" });
	await send({ type: "prompt", message: "/auto-rename model" });
	if (JSON.stringify(pickerOptions) !== JSON.stringify(["auto-rename-test/title (current)"])) {
		throw new Error(`Expected only the session-scoped naming model, received ${JSON.stringify(pickerOptions)}`);
	}
	await prompt("First request", 1);
	await prompt("Second request", 2);
	await prompt("Third request", 3);

	const afterThird = await send({ type: "get_state" });
	if (afterThird.data.sessionName !== "INTEGRATION AUTO RENAME") {
		throw new Error(`Expected automatic name after three exchanges, received ${afterThird.data.sessionName ?? "none"}`);
	}

	await prompt("Fourth request", 4);
	const afterFourth = await send({ type: "get_state" });
	if (afterFourth.data.sessionName !== "INTEGRATION AUTO RENAME") {
		throw new Error(`Automatic name changed after a fourth exchange: ${afterFourth.data.sessionName ?? "none"}`);
	}

	process.stdout.write(
		`${JSON.stringify({
			command: autoRename.name,
			pickerOptions,
			sessionName: afterFourth.data.sessionName,
			exchanges: 4,
		})}\n`,
	);
} finally {
	clearTimeout(timeout);
	child.stdin.end();
	child.kill("SIGTERM");
	await childExited;
	await rm(temporaryHome, { recursive: true, force: true });
	if (stderr.trim()) process.stderr.write(stderr);
}
