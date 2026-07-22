#!/usr/bin/env node
/*
 * Visara release orchestrator — the ONE command that ships a release.
 *
 *   npm run release 3.0.2
 *
 * Flow: preflight (clean tree, on main, synced with origin) → bump every
 * version anchor (bump-version.js) → verify they all agree
 * (check-version-reconciliation.js) → ensure release notes exist → commit →
 * tag vX.Y.Z → push. The tag push triggers .github/workflows/release.yml,
 * which builds and uploads to Google Play AND App Store Connect.
 *
 * This script never builds anything itself — CI is the single build path.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, opts = {}) =>
	execSync(cmd, { cwd: root, encoding: "utf8", stdio: "pipe", ...opts }).trim();
const say = (msg) => console.log(msg);
const die = (msg) => {
	console.error(`\n❌ ${msg}`);
	process.exit(1);
};

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
	die("Usage: npm run release <x.y.z>   (e.g. npm run release 3.0.2)");
}

// --- Preflight ---------------------------------------------------------------
const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") die(`Releases ship from main (you are on "${branch}").`);

if (run("git status --porcelain") !== "")
	die("Working tree is not clean — commit or stash first.");

say("🔄 Syncing with origin…");
run("git fetch origin --tags");
const local = run("git rev-parse main");
const remote = run("git rev-parse origin/main");
if (local !== remote)
	die("main and origin/main differ — pull/push first so the tag lands on the released commit.");

try {
	run(`git rev-parse -q --verify refs/tags/v${version}`);
	die(`Tag v${version} already exists.`);
} catch {
	/* tag is free — good */
}

// --- Bump + verify -----------------------------------------------------------
say(`\n🔢 Bumping all version anchors to ${version}…`);
run(`node bump-version.js ${version}`, { stdio: "inherit" });
run(`node scripts/check-version-reconciliation.js ${version}`, {
	stdio: "inherit",
});

// --- Release notes -----------------------------------------------------------
// Google Play attaches release-notes/<version>.md (capped at 500 chars there).
const notesPath = path.join(root, "release-notes", `${version}.md`);
if (!fs.existsSync(notesPath)) {
	fs.writeFileSync(notesPath, "Bug fixes and improvements.\n");
	say(
		`📝 Created ${path.relative(root, notesPath)} with placeholder text — edit it BEFORE the next release if you want real notes on Play.`,
	);
}

// --- Commit, tag, push -------------------------------------------------------
say("\n📦 Committing and tagging…");
run(
	"git add package.json package-lock.json app.json android/app/build.gradle ios/Visara.xcodeproj/project.pbxproj release-notes",
);
run(`git commit -m "chore(release): v${version}"`);
run(`git tag -a v${version} -m "Visara ${version}"`);

say("🚀 Pushing main + tag (this triggers the release workflow)…");
run("git push origin main --follow-tags", { stdio: "inherit" });

const repo = run("git remote get-url origin")
	.replace(/\.git$/, "")
	.replace(/^git@github\.com:/, "https://github.com/");
say(`\n✅ v${version} is on its way to BOTH stores.`);
say(`   Watch: ${repo}/actions  (or: gh run watch)`);
say("   Android lands on the Play 'internal' track; iOS lands in TestFlight.");
say("   Promote to production manually — see RELEASING.md §Promoting.");
