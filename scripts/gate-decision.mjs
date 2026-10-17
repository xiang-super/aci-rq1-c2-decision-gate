import { readFile, writeFile } from "node:fs/promises";

const token = process.env.GH_TOKEN;
const repository = process.env.REPOSITORY;
const verdict = JSON.parse(await readFile(process.argv[2] || "review/verdict.json", "utf8"));

const response = await fetch(`https://api.github.com/repos/${repository}/check-runs`, {
  method: "POST",
  headers: {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
  },
  body: JSON.stringify({
    name: "gate/ai-review",
    head_sha: verdict.sha,
    status: "completed",
    conclusion: verdict.approve ? "success" : "failure",
    output: {
      title: verdict.approve ? "Automated review approved" : "Automated review blocked",
      summary: verdict.summary.slice(0, 1400),
    },
  }),
});

if (!response.ok) {
  throw new Error(`check-run failed: HTTP ${response.status} ${await response.text()}`);
}

await writeFile(
  "merge-request.json",
  `${JSON.stringify({ pr: verdict.pr, sha: verdict.sha, approve: verdict.approve }, null, 2)}\n`,
);

console.log(await response.text());
