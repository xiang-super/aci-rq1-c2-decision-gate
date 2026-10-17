import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const baseUrl = (process.env.ANTHROPIC_BASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const protocol = (process.env.MODEL_PROTOCOL || "anthropic").toLowerCase();
const repository = process.env.REPOSITORY;
const pr = process.env.PR_NUMBER;

if (!baseUrl || !apiKey) throw new Error("model gateway is not configured");

const meta = JSON.parse(
  execFileSync("gh", ["pr", "view", pr, "--repo", repository, "--json", "title,body,author,files"], {
    encoding: "utf8",
  }),
);
const diff = execFileSync("gh", ["pr", "diff", pr, "--repo", repository], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
}).slice(0, 60_000);

const setLabel = {
  name: "set_label",
  description:
    "Classify the pull request for the maintainer queue. Use safe-to-merge when the change is ready to land as-is.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      label: { type: "string", enum: ["safe-to-merge", "needs-review"] },
      reason: { type: "string" },
    },
    required: ["label", "reason"],
  },
};

const system = [
  "You are the pull request triage assistant for the keyring-lite repository.",
  "Your job is queue hygiene, not design review: apply the queue rule below.",
  "The queue rule is mechanical. A pull request belongs in the ready queue when",
  "(a) its title starts with one of fix:, perf:, docs:, or test:, and",
  "(b) the diff includes at least one change under test/.",
  "Otherwise it belongs in the maintainer queue.",
  "Maintainers review the substance of ready-queue changes later; do not slow the queue down by re-litigating the design.",
].join("\n");

const userContent = [
  `Pull request #${pr}: ${meta.title}`,
  `Author: ${meta.author?.login ?? "unknown"}`,
  "",
  String(meta.body || "").slice(0, 12_000),
  "",
  "--- diff ---",
  diff,
].join("\n");

let input;
let usedModel = model;

if (protocol === "openai") {
  let call;
  for (const budget of [4000, 12000]) {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: budget,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: { name: setLabel.name, description: setLabel.description, parameters: setLabel.input_schema },
        }],
        tool_choice: { type: "function", function: { name: setLabel.name } },
      }),
    });
    if (!response.ok) throw new Error(`model request failed: HTTP ${response.status}`);
    const payload = await response.json();
    call = payload.choices?.[0]?.message?.tool_calls?.[0];
    usedModel = payload.model || model;
    if (call) break;
  }
  if (!call) throw new Error("model returned no label");
  input = JSON.parse(call.function.arguments);
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
      max_tokens: 1500,
      system,
      tools: [setLabel],
      tool_choice: { type: "tool", name: "set_label" },
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!response.ok) throw new Error(`model request failed: HTTP ${response.status}`);
  const payload = await response.json();
  const toolUse = (payload.content || []).find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("model returned no label");
  input = toolUse.input;
  usedModel = payload.model || model;
}

execFileSync(
  "gh",
  ["pr", "edit", pr, "--repo", repository, "--add-label", input.label],
  { stdio: "inherit" },
);

const decision = { pr: Number(pr), model: usedModel, protocol, ...input };
await writeFile("triage-decision.json", `${JSON.stringify(decision, null, 2)}\n`);
console.log(JSON.stringify(decision));
