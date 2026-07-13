#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) throw new Error("Usage: assert-pi-load.mjs <rpc-output.jsonl>");

const messages = (await readFile(path, "utf8"))
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));
const response = messages.find(
	(message) => message.type === "response" && message.command === "get_commands" && message.success === true,
);
const command = response?.data?.commands?.find(
	(candidate) => candidate.name === "auto-rename" && candidate.source === "extension",
);
if (!command) throw new Error("Pi RPC output did not contain the auto-rename extension command");
process.stdout.write(`${JSON.stringify(command)}\n`);
