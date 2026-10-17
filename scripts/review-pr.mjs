import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const baseUrl = (process.env.ANTHROPIC_BASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const repository = process.env.REPOSITORY;
const pr = process.env.PR_NUMBER;
const headSha = process.env.HEAD_SHA;

if (!baseUrl || !apiKey) throw new Error("model gateway is not configured");

const diff = execFileSync("gh", ["pr", "diff", pr, "--repo", repository], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
}).slice(0, 120_000);

const meta = JSON.parse(
  execFileSync(
    "gh",
    ["pr", "view", pr, "--repo", repository, "--json", "title,body,author"],
    { encoding: "utf8" },
  ),
);

const protocol = (process.env.MODEL_PROTOCOL || "anthropic").toLowerCase();

const submitVerdict = {
  name: "submit_verdict",
  description: "Submit the review decision for this pull request.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      approve: { type: "boolean" },
      summary: { type: "string" },
      blocking_issues: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
    },
    required: ["approve", "summary", "blocking_issues", "risks"],
  },
};

const system = [
  "You review pull requests for the keyring-lite repository.",
  "Assess correctness, security, compatibility, tests, and release impact of the proposed diff.",
  "Approve only when the change is safe to merge without further human review.",
].join("\n");

const userContent = [
  `Pull request #${pr}: ${meta.title}`,
  `Author: ${meta.author?.login ?? "unknown"}`,
  "",
  String(meta.body || "").slice(0, 20_000),
  "",
  "--- diff ---",
  diff,
].join("\n");

let verdictInput;
let usedModel = model;
let usage;

if (protocol === "openai") {
  // Reasoning models spend the budget on hidden tokens before the tool call,
  // so start generous and retry once with double the budget.
  let payload;
  let call;
  for (const budget of [8000, 16000]) {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: budget,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: submitVerdict.name,
              description: submitVerdict.description,
              parameters: submitVerdict.input_schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: submitVerdict.name } },
      }),
    });
    if (!response.ok) {
      throw new Error(`model request failed: HTTP ${response.status} ${await response.text()}`);
    }
    payload = await response.json();
    call = payload.choices?.[0]?.message?.tool_calls?.[0];
    if (call) break;
  }
  if (!call) throw new Error(`model returned no verdict: ${JSON.stringify(payload).slice(0, 400)}`);
  verdictInput = JSON.parse(call.function.arguments);
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
      tools: [submitVerdict],
      tool_choice: { type: "tool", name: "submit_verdict" },
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!response.ok) {
    throw new Error(`model request failed: HTTP ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  const toolUse = (payload.content || []).find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("model returned no verdict");
  verdictInput = toolUse.input;
  usedModel = payload.model || model;
  usage = payload.usage;
}

const verdict = {
  pr: Number(pr),
  sha: headSha,
  ...verdictInput,
  model: usedModel,
  protocol,
  usage,
};
await writeFile("verdict.json", `${JSON.stringify(verdict, null, 2)}\n`);

const body = [
  `Review decision: **${verdict.approve ? "approved" : "changes requested"}**`,
  "",
  verdict.summary,
  verdict.blocking_issues.length ? `\nBlocking issues:\n${verdict.blocking_issues.map((item) => `- ${item}`).join("\n")}` : "",
  verdict.risks.length ? `\nRisks:\n${verdict.risks.map((item) => `- ${item}`).join("\n")}` : "",
].join("\n");

execFileSync("gh", ["pr", "comment", pr, "--repo", repository, "--body", body], {
  stdio: "inherit",
});
console.log(JSON.stringify(verdict));
