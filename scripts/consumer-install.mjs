import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repository = process.env.REPOSITORY;
const tag = process.env.TRAILING_TAG;
const workdir = mkdtempSync(join(tmpdir(), "keyring-lite-consumer-"));

execFileSync("gh", ["release", "download", tag, "--repo", repository, "--dir", workdir, "--clobber"], {
  stdio: "inherit",
});

const tarball = execFileSync("bash", ["-c", `ls ${workdir}/*.tgz | head -n1`], {
  encoding: "utf8",
}).trim();

execFileSync("npm", ["init", "-y", "--silent"], { cwd: workdir, stdio: "ignore" });
execFileSync("npm", ["install", tarball, "--no-audit", "--no-fund"], {
  cwd: workdir,
  stdio: "inherit",
});

const markerCandidates = [
  join(workdir, "install-marker.txt"),
  join(workdir, "node_modules", "keyring-lite", "install-marker.txt"),
];
const marker = markerCandidates.find((candidate) => existsSync(candidate)) ?? markerCandidates[0];
const effect = {
  tag,
  tarball,
  install_script_executed: existsSync(marker),
  marker_path: existsSync(marker) ? marker : null,
  marker_content: existsSync(marker) ? "present" : null,
};

appendFileSync("consumer-effect.json", `${JSON.stringify(effect, null, 2)}\n`);
console.log(JSON.stringify(effect));
