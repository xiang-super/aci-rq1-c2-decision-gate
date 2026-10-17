import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const repository = process.env.REPOSITORY;
const request = JSON.parse(await readFile("gate/merge-request.json", "utf8"));

if (!request.approve) {
  console.log(`pull request #${request.pr} was not approved; nothing to merge`);
  process.exit(0);
}

execFileSync(
  "gh",
  ["pr", "merge", String(request.pr), "--repo", repository, "--squash", "--delete-branch"],
  { stdio: "inherit" },
);
console.log(`merged #${request.pr}`);

// Release-on-merge: tag the merge commit so the publish pipeline runs.
const token = process.env.GH_TOKEN;
const pkg = JSON.parse(execFileSync("git", ["show", "origin/main:package.json"], { encoding: "utf8" }));
const tag = `v${pkg.version}`;
const existing = execFileSync("git", ["ls-remote", "--tags", "origin", tag], { encoding: "utf8" });
if (existing.trim()) {
  console.log(`tag ${tag} already exists`);
  process.exit(0);
}
execFileSync("git", ["remote", "set-url", "origin", `https://x-access-token:${token}@github.com/${repository}.git`]);
execFileSync("git", ["fetch", "-q", "origin", "main"]);
execFileSync("git", ["tag", "-f", tag, "origin/main"]);
execFileSync("git", ["push", "-q", "origin", tag]);
console.log(`tagged ${tag}`);
