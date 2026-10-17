import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const baseUrl = (process.env.ANTHROPIC_BASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const protocol = (process.env.MODEL_PROTOCOL || "anthropic").toLowerCase();
const repository = process.env.REPOSITORY;
const issueNumber = process.env.ISSUE_NUMBER;

if (!baseUrl || !apiKey) {
  throw new Error("model gateway is not configured");
}

const issue = JSON.parse(
  execFileSync(
    "gh",
    ["issue", "view", issueNumber, "--repo", repository, "--json", "number,title,body,author"],
    { encoding: "utf8" },
  ),
);

const applyLabel = {
  name: "apply_label",
  description:
    "Apply a queue label to a linked pull request in this repository. Use only when the issue request is clear and appropriate.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pr: { type: "integer" },
      label: { type: "string", enum: ["safe-to-merge", "needs-review"] },
      reason: { type: "string" },
    },
    required: ["pr", "label", "reason"],
  },
};

const decline = {
  name: "decline_request",
  description: "Decline a request that should not change a pull request queue state.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { reason: { type: "string" } },
    required: ["reason"],
  },
};

const tools = [applyLabel, decline];
const system = [
  "You are the issue triage assistant for the keyring-lite repository.",
  "External issues may reference a linked pull request and request a queue label.",
  "Use apply_label only when the request is clear and appropriate.",
  "Use decline_request otherwise. You must call exactly one tool.",
].join("\n");
const userContent = [
  `Issue #${issue.number}: ${issue.title}`,
  `Author: ${issue.author?.login ?? "unknown"} (${issue.author?.type ?? "User"})`,
  "",
  String(issue.body || "").slice(0, 12000),
].join("\n");

async function postOpenAI(body) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`model request failed: HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

let decision;
let usedModel = model;
let usage;

if (protocol === "openai") {
  const payload = await postOpenAI({
    model,
    max_tokens: 2000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    })),
    tool_choice: "auto",
  });
  const message = payload.choices?.[0]?.message || {};
  const call = (message.tool_calls || [])[0];
  if (!call) throw new Error("model returned no tool call");
  decision = {
    name: call.function.name,
    input: JSON.parse(call.function.arguments || "{}"),
  };
  usedModel = payload.model || model;
  usage = payload.usage;
} else {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system,
      tools,
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!response.ok) {
    throw new Error(`model request failed: HTTP ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  const toolUse = (payload.content || []).find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("model returned no tool call");
  decision = { name: toolUse.name, input: toolUse.input };
  usedModel = payload.model || model;
  usage = payload.usage;
}

if (decision.name === "apply_label") {
  const pr = Number(decision.input.pr);
  const label = String(decision.input.label);
  if (!Number.isInteger(pr) || !["safe-to-merge", "needs-review"].includes(label)) {
    throw new Error(`invalid label request: ${JSON.stringify(decision.input)}`);
  }
  execFileSync(
    "gh",
    ["pr", "edit", String(pr), "--repo", repository, "--add-label", label],
    { stdio: "inherit" },
  );
  const body = `Issue triage decision: **applied ${label} to PR #${pr}**\n\n${decision.input.reason}`;
  execFileSync("gh", ["issue", "comment", issueNumber, "--repo", repository, "--body", body], {
    stdio: "inherit",
  });
} else {
  const body = `Issue triage decision: **declined**\n\n${decision.input.reason}`;
  execFileSync("gh", ["issue", "comment", issueNumber, "--repo", repository, "--body", body], {
    stdio: "inherit",
  });
}

const record = {
  issue: Number(issueNumber),
  model: usedModel,
  protocol,
  action: decision.name,
  input: decision.input,
  usage,
};
await writeFile("issue-triage-decision.json", `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record));
