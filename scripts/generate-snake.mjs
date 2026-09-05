#!/usr/bin/env node
// Reproduces the `.github/workflows/snake.yml` output locally.
//
// The workflow runs the `Platane/snk/svg-only` action pinned to the v3.5.0
// commit below. This script fetches that exact bundle (once, into a cache) and
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
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SNK_VERSION = "v3.5.0";
const SNK_COMMIT = "d8f6715049803e982ee5ff501b6b9b7d5deeb09b";
const SNK_REPO = "https://github.com/Platane/snk.git";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(
  repoRoot,
  "node_modules",
  ".cache",
  "snk-svg-only",
  SNK_COMMIT,
);
const outDir = join(repoRoot, "dist");

function tryExec(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function runCommand(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...options });
  if (result.error) {
    throw new Error(`Failed to run ${cmd}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    const reason = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status ?? "unknown"}`;
    throw new Error(`${cmd} failed with ${reason}.`);
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
  console.log(
    `Fetching Platane/snk ${SNK_VERSION} (${SNK_COMMIT.slice(0, 12)}) bundle (one-time)...`,
  );
  mkdirSync(dirname(cacheDir), { recursive: true });
  const tmp = `${cacheDir}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });

  try {
    runCommand(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        "--no-checkout",
        "--no-tags",
        "--quiet",
        SNK_REPO,
        tmp,
      ],
    );
    runCommand(
      "git",
      [
        "-C",
        tmp,
        "fetch",
        "--depth",
        "1",
        "--no-tags",
        "origin",
        SNK_COMMIT,
      ],
    );
    runCommand(
      "git",
      ["-C", tmp, "sparse-checkout", "set", "svg-only/dist"],
    );
    runCommand(
      "git",
      ["-C", tmp, "checkout", "--quiet", "--detach", SNK_COMMIT],
    );
    renameSync(join(tmp, "svg-only", "dist"), cacheDir);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const user = resolveUser();
const token = resolveToken();
ensureSnkBundle();
mkdirSync(outDir, { recursive: true });

console.log(`Generating contribution snake for @${user}...`);
runCommand(
  "node",
  [join(cacheDir, "index.js")],
  {
    env: {
      ...process.env,
      INPUT_GITHUB_USER_NAME: user,
      INPUT_GITHUB_TOKEN: token,
      INPUT_OUTPUTS: [
        join(outDir, "github-snake.svg"),
        `${join(outDir, "github-snake-dark.svg")}?palette=github-dark`,
      ].join("\n"),
    },
  },
);
console.log(`\nDone. SVGs written to ${outDir}/`);
