#!/usr/bin/env node
// Reproduces the `.github/workflows/snake.yml` output locally.
//
// The workflow runs the `Platane/snk/svg-only@v3` action, which is a bundled
// Node action. This script fetches that exact bundle (once, into a cache) and
// runs it with the same inputs, so the SVGs generated here match what CI
// publishes to the `output` branch.
//
// Usage:
//   npm run snake                 # user inferred from git remote, token from gh
//   SNAKE_USER=octocat npm run snake
//   GITHUB_TOKEN=ghp_xxx npm run snake
//
// Requires network access to github.com and a GitHub token (GITHUB_TOKEN, or a
// logged-in `gh` CLI). The token only needs read access to public data.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SNK_REF = "v3";
const SNK_REPO = "https://github.com/Platane/snk.git";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(repoRoot, "node_modules", ".cache", "snk-svg-only");
const outDir = join(repoRoot, "dist");

function tryExec(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function resolveUser() {
  if (process.env.SNAKE_USER) return process.env.SNAKE_USER;
  const remote = tryExec("git", ["remote", "get-url", "origin"]);
  const match = remote.match(/github\.com[:/]([^/]+)\//i);
  if (match) return match[1];
  throw new Error(
    "Could not determine GitHub user. Set SNAKE_USER=<username>.",
  );
}

function resolveToken() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  const fromGh = tryExec("gh", ["auth", "token"]);
  if (fromGh) return fromGh;
  throw new Error(
    "No GitHub token found. Set GITHUB_TOKEN or run `gh auth login`.",
  );
}

function ensureSnkBundle() {
  if (existsSync(join(cacheDir, "index.js"))) return;
  console.log(`Fetching Platane/snk@${SNK_REF} bundle (one-time)...`);
  mkdirSync(dirname(cacheDir), { recursive: true });
  const tmp = `${cacheDir}.tmp`;
  spawnSync("rm", ["-rf", tmp, cacheDir], { stdio: "inherit" });
  const clone = spawnSync(
    "git",
    [
      "-c", "advice.detachedHead=false",
      "clone", "--depth", "1", "--branch", SNK_REF,
      "--filter=blob:none", "--sparse", "--quiet", SNK_REPO, tmp,
    ],
    { stdio: "inherit" },
  );
  if (clone.status !== 0) throw new Error("Failed to clone Platane/snk.");
  const sparse = spawnSync(
    "git", ["-C", tmp, "sparse-checkout", "set", "svg-only/dist"],
    { stdio: "inherit" },
  );
  if (sparse.status !== 0) throw new Error("Failed sparse-checkout.");
  spawnSync("mv", [join(tmp, "svg-only", "dist"), cacheDir], {
    stdio: "inherit",
  });
  spawnSync("rm", ["-rf", tmp], { stdio: "inherit" });
}

const user = resolveUser();
const token = resolveToken();
ensureSnkBundle();
mkdirSync(outDir, { recursive: true });

console.log(`Generating contribution snake for @${user}...`);
const result = spawnSync("node", [join(cacheDir, "index.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    INPUT_GITHUB_USER_NAME: user,
    INPUT_GITHUB_TOKEN: token,
    INPUT_OUTPUTS: [
      join(outDir, "github-snake.svg"),
      `${join(outDir, "github-snake-dark.svg")}?palette=github-dark`,
    ].join("\n"),
  },
});

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`\nDone. SVGs written to ${outDir}/`);
