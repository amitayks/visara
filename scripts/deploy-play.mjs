#!/usr/bin/env node
/**
 * deploy-play.mjs — upload a Visara AAB to Google Play.
 *
 * Zero-runtime-dep uploader: it uses `google-auth-library` (already a
 * devDependency) only to mint an OAuth token, then talks to the Android
 * Publisher REST API v3 with Node's native `fetch`. Works the same on
 * macOS, Linux, and the Windows Android box.
 *
 * Flow (Android Publisher v3 "edits"):
 *   1. POST   /edits                         -> open an edit ({ id })
 *   2. POST   /upload .../bundles            -> upload the .aab ({ versionCode })
 *   3. PUT    /edits/{id}/tracks/{track}     -> assign versionCode to a track
 *   4. POST   /edits/{id}:commit             -> publish the edit
 *   On any failure the edit is DELETEd so nothing half-applied is left behind.
 *
 * Run `node scripts/deploy-play.mjs --help` for usage. See DEPLOY.md for the
 * one-time Play Console / service-account setup.
 */

import { spawn } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GoogleAuth } from "google-auth-library";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API_BASE =
	"https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const UPLOAD_BASE =
	"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications";

const DEFAULT_PACKAGE = "com.visara.app";
const DEFAULT_TRACK = "internal";
const DEFAULT_STATUS = "completed";
const NOTES_LANGUAGE = "en-US";
const MAX_NOTES_LEN = 500; // Google Play caps release-note text at 500 chars/language.
const VALID_STATUSES = ["completed", "draft", "inProgress", "halted"];

const BUNDLE_DIR = path.join(
	PROJECT_ROOT,
	"android",
	"app",
	"build",
	"outputs",
	"bundle",
	"release",
);
const GRADLE_FILE = path.join(PROJECT_ROOT, "android", "app", "build.gradle");
const GRADLE_WRAPPER_JAR = path.join(
	PROJECT_ROOT,
	"android",
	"gradle",
	"wrapper",
	"gradle-wrapper.jar",
);

const DEFAULT_API_TIMEOUT_MS = 180_000; // 3 min per JSON call.
const DEFAULT_UPLOAD_TIMEOUT_MS = 900_000; // 15 min for the .aab upload.

const TAG = "deploy-play";

// ---------------------------------------------------------------------------
// Logging (ASCII only so it renders on the Windows console too)
// ---------------------------------------------------------------------------

const log = (msg) => console.log(`[${TAG}] ${msg}`);
const step = (msg) => console.log(`[${TAG}] > ${msg}`);
const ok = (msg) => console.log(`[${TAG}] OK   ${msg}`);
const warn = (msg) => console.warn(`[${TAG}] WARN ${msg}`);
const fail = (msg) => console.error(`[${TAG}] ERROR ${msg}`);

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** A user-facing configuration / validation problem (clean message, exit 1). */
class UserError extends Error {}

/** A non-2xx response from the Android Publisher API (exit 3). */
class ApiError extends Error {
	constructor(status, statusText, body, method, url) {
		super(`${method} ${url} -> HTTP ${status} ${statusText}`);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
		this.method = method;
		this.url = url;
	}

	/** Return a targeted, actionable hint for the common failure modes. */
	hint() {
		const body = (this.body ?? "").toLowerCase();
		const versionConflict =
			body.includes("already been used") ||
			body.includes("apkupgradeversionconflict") ||
			(body.includes("version code") && body.includes("used"));
		if (versionConflict) {
			return "This versionCode was already used on Google Play. Bump `versionCode` in android/app/build.gradle (currently 30000), rebuild the AAB, and retry. Each upload needs a unique, higher versionCode.";
		}
		if (
			this.status === 404 ||
			body.includes("application not found") ||
			body.includes("no application")
		) {
			return "Package/app not found. Check --package matches the app in Play Console (default com.visara.app), that the app already exists there with at least one prior upload, and that this service account is linked to the correct Play developer account.";
		}
		if (this.status === 401) {
			return "Authentication was rejected. Confirm the service-account JSON is valid and that the 'Google Play Android Developer API' is enabled on its GCP project.";
		}
		if (this.status === 403) {
			return "Permission denied. In Play Console -> Users & permissions, invite the service-account email and grant it 'Release to testing tracks' (plus 'Release to production' for the production track). Admin is not required. Newly granted access can take a few minutes to propagate.";
		}
		return null;
	}
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

function safeJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return { raw: text };
	}
}

function toNumberOrNull(value) {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const n = Number(value);
	return Number.isNaN(n) ? Number.NaN : n;
}

function formatBytes(bytes) {
	const mb = bytes / (1024 * 1024);
	return `${mb.toFixed(1)} MiB`;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const USAGE = `
Visara -> Google Play uploader

Usage:
  node scripts/deploy-play.mjs [options]

Options:
  --track <name>        Play track: internal | alpha | beta | production | <custom>
                        (default: internal, or $PLAY_TRACK)
  --status <status>     completed | draft | inProgress | halted
                        (default: completed, or $PLAY_STATUS)
                        Use "draft" to stage a release for manual review in the console.
  --rollout <fraction>  userFraction for a staged rollout, 0 < f < 1 (required when
                        --status inProgress). E.g. 0.1 = 10%. (or $PLAY_ROLLOUT)
  --aab <path>          Path to the .aab. Default: freshest file in
                        android/app/build/outputs/bundle/release/*.aab
  --package <id>        Application id (default: com.visara.app, or $PLAY_PACKAGE)
  --notes <path|text>   Release notes: a file path (markdown ok) or literal text.
                        Default: release-notes/<versionName>.md
  --version-name <v>    Marketing version used to locate the default notes file
                        (default: read from android/app/build.gradle)
  --service-account <p> Service-account JSON: a file path or inline JSON.
                        Default: $GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
  --build               Run "npm run aab" to build the AAB first, then upload.
  --dry-run             Validate credentials + Play API access and print the plan,
                        WITHOUT uploading or committing anything.
  --timeout <ms>        Per-request timeout for JSON calls (default 180000).
  -h, --help            Show this help.

Examples:
  # Build then upload the freshest AAB to the internal track (published immediately):
  npm run deploy:play:build

  # Upload an already-built AAB as a draft on the production track (review in console):
  node scripts/deploy-play.mjs --track production --status draft

  # Staged 10% rollout to production:
  node scripts/deploy-play.mjs --track production --status inProgress --rollout 0.1

  # First-run credential/permission check (nothing is published):
  node scripts/deploy-play.mjs --dry-run
`;

function parseCli(argv) {
	try {
		const { values } = parseArgs({
			args: argv,
			allowPositionals: false,
			strict: true,
			options: {
				track: { type: "string" },
				status: { type: "string" },
				rollout: { type: "string" },
				aab: { type: "string" },
				package: { type: "string" },
				notes: { type: "string" },
				"version-name": { type: "string" },
				"service-account": { type: "string" },
				build: { type: "boolean" },
				"dry-run": { type: "boolean" },
				timeout: { type: "string" },
				help: { type: "boolean", short: "h" },
			},
		});
		return values;
	} catch (err) {
		throw new UserError(`${err.message}\n${USAGE}`);
	}
}

// ---------------------------------------------------------------------------
// Config resolution (flags > .env / env > defaults)
// ---------------------------------------------------------------------------

function loadDotEnv() {
	const envFile = path.join(PROJECT_ROOT, ".env");
	try {
		process.loadEnvFile(envFile);
	} catch {
		// No .env is fine; env vars may come from the shell / CI.
	}
}

async function readGradleVersion() {
	try {
		const text = await readFile(GRADLE_FILE, "utf8");
		const name = /versionName\s+"([^"]+)"/.exec(text)?.[1] ?? null;
		const code = /versionCode\s+(\d+)/.exec(text)?.[1] ?? null;
		return { versionName: name, versionCode: code ? Number(code) : null };
	} catch {
		return { versionName: null, versionCode: null };
	}
}

async function readPackageVersion() {
	try {
		const text = await readFile(
			path.join(PROJECT_ROOT, "package.json"),
			"utf8",
		);
		return JSON.parse(text).version ?? null;
	} catch {
		return null;
	}
}

async function resolveConfig(values) {
	const env = process.env;
	const gradle = await readGradleVersion();

	const packageName = values.package ?? env.PLAY_PACKAGE ?? DEFAULT_PACKAGE;
	const track = values.track ?? env.PLAY_TRACK ?? DEFAULT_TRACK;
	const status = values.status ?? env.PLAY_STATUS ?? DEFAULT_STATUS;
	const rollout = toNumberOrNull(values.rollout ?? env.PLAY_ROLLOUT ?? null);
	const serviceAccount =
		values["service-account"] ?? env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "";
	const versionName =
		values["version-name"] ??
		gradle.versionName ??
		(await readPackageVersion()) ??
		"3.0.0";

	const apiTimeoutMs =
		toNumberOrNull(values.timeout ?? env.PLAY_HTTP_TIMEOUT_MS) ||
		DEFAULT_API_TIMEOUT_MS;
	const uploadTimeoutMs =
		toNumberOrNull(env.PLAY_UPLOAD_TIMEOUT_MS) || DEFAULT_UPLOAD_TIMEOUT_MS;

	return {
		packageName,
		track,
		status,
		rollout,
		serviceAccount,
		versionName,
		gradleVersionCode: gradle.versionCode,
		aabFlag: values.aab ?? null,
		notesFlag: values.notes ?? null,
		build: Boolean(values.build),
		dryRun: Boolean(values["dry-run"]),
		apiTimeoutMs,
		uploadTimeoutMs,
	};
}

function validateConfig(config) {
	if (!VALID_STATUSES.includes(config.status)) {
		throw new UserError(
			`Invalid --status "${config.status}". Expected one of: ${VALID_STATUSES.join(", ")}.`,
		);
	}
	if (!config.track || !config.track.trim()) {
		throw new UserError(
			"--track must be a non-empty track name (e.g. internal, beta, production).",
		);
	}
	if (!config.serviceAccount) {
		throw new UserError(
			"No service account provided. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON in .env (see .env.example) or pass --service-account <path>. See DEPLOY.md for how to create one.",
		);
	}

	if (config.rollout !== null && Number.isNaN(config.rollout)) {
		throw new UserError(
			"--rollout must be a number between 0 and 1 (e.g. 0.1 for 10%).",
		);
	}
	if (config.status === "inProgress") {
		if (config.rollout === null) {
			throw new UserError(
				"--status inProgress requires --rollout <fraction> (0 < f < 1), e.g. --rollout 0.1.",
			);
		}
		if (config.rollout <= 0 || config.rollout >= 1) {
			throw new UserError(
				`--rollout must be strictly between 0 and 1 for a staged rollout (got ${config.rollout}).`,
			);
		}
	}
	if (
		config.rollout !== null &&
		(config.status === "completed" || config.status === "draft")
	) {
		warn(
			`--rollout ${config.rollout} is ignored for --status ${config.status} (userFraction only applies to inProgress/halted).`,
		);
	}
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function buildAuthContext(config) {
	const raw = config.serviceAccount.trim();
	const options = { scopes: [SCOPE] };

	if (raw.startsWith("{")) {
		let credentials;
		try {
			credentials = JSON.parse(raw);
		} catch {
			throw new UserError(
				"GOOGLE_PLAY_SERVICE_ACCOUNT_JSON looks like inline JSON but could not be parsed.",
			);
		}
		options.credentials = credentials;
	} else {
		const keyFile = path.resolve(process.cwd(), raw);
		if (!(await fileExists(keyFile))) {
			throw new UserError(
				`Service-account key not found at: ${keyFile}\nSet GOOGLE_PLAY_SERVICE_ACCOUNT_JSON to the JSON key path (see DEPLOY.md).`,
			);
		}
		// Light validation so we fail early with a clear message (never log contents).
		try {
			const parsed = JSON.parse(await readFile(keyFile, "utf8"));
			if (parsed.type !== "service_account" || !parsed.client_email) {
				warn(
					"The service-account file does not look like a Google service_account key (missing type/client_email).",
				);
			}
		} catch {
			throw new UserError(
				`Service-account key at ${keyFile} is not valid JSON.`,
			);
		}
		options.keyFile = keyFile;
	}

	const auth = new GoogleAuth(options);
	// Fresh token per call; google-auth-library caches and refreshes internally,
	// so this is cheap and survives long uploads without expiring.
	const getToken = async () => {
		const token = await auth.getAccessToken();
		if (!token) {
			throw new UserError(
				"Failed to obtain an access token from the service account.",
			);
		}
		return token;
	};
	return {
		getToken,
		apiTimeoutMs: config.apiTimeoutMs,
		uploadTimeoutMs: config.uploadTimeoutMs,
	};
}

// ---------------------------------------------------------------------------
// HTTP against the Android Publisher API
// ---------------------------------------------------------------------------

async function apiFetch(ctx, method, url, options = {}) {
	const token = await ctx.getToken();
	const headers = { Authorization: `Bearer ${token}` };
	let body;

	if (options.json !== undefined) {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(options.json);
	} else if (options.body !== undefined) {
		headers["Content-Type"] = options.contentType ?? "application/octet-stream";
		body = options.body;
	}

	const res = await fetch(url, {
		method,
		headers,
		body,
		signal: AbortSignal.timeout(options.timeoutMs ?? ctx.apiTimeoutMs),
	});

	const text = await res.text();
	if (!res.ok) {
		throw new ApiError(res.status, res.statusText, text, method, url);
	}
	return text ? safeJson(text) : {};
}

const editsBase = (packageName) =>
	`${API_BASE}/${encodeURIComponent(packageName)}/edits`;

async function createEdit(ctx, packageName) {
	const edit = await apiFetch(ctx, "POST", editsBase(packageName), {
		json: {},
	});
	if (!edit.id) {
		throw new ApiError(
			200,
			"OK",
			JSON.stringify(edit),
			"POST",
			editsBase(packageName),
		);
	}
	return edit.id;
}

async function deleteEdit(ctx, packageName, editId) {
	await apiFetch(ctx, "DELETE", `${editsBase(packageName)}/${editId}`);
}

async function uploadBundle(ctx, packageName, editId, aabPath) {
	const bytes = await readFile(aabPath);
	const url = `${UPLOAD_BASE}/${encodeURIComponent(packageName)}/edits/${editId}/bundles?uploadType=media`;
	step(
		`Uploading ${path.basename(aabPath)} (${formatBytes(bytes.length)}) ...`,
	);
	const bundle = await apiFetch(ctx, "POST", url, {
		body: bytes,
		contentType: "application/octet-stream",
		timeoutMs: ctx.uploadTimeoutMs,
	});
	if (typeof bundle.versionCode !== "number") {
		throw new ApiError(200, "OK", JSON.stringify(bundle), "POST", url);
	}
	return bundle.versionCode;
}

async function assignTrack(ctx, config, editId, versionCode, notes) {
	const release = {
		status: config.status,
		versionCodes: [String(versionCode)],
	};
	if (notes) {
		release.releaseNotes = [{ language: NOTES_LANGUAGE, text: notes }];
	}
	if (
		(config.status === "inProgress" || config.status === "halted") &&
		config.rollout !== null
	) {
		release.userFraction = config.rollout;
	}
	const url = `${editsBase(config.packageName)}/${editId}/tracks/${encodeURIComponent(config.track)}`;
	await apiFetch(ctx, "PUT", url, {
		json: { track: config.track, releases: [release] },
	});
}

async function commitEdit(ctx, packageName, editId) {
	await apiFetch(ctx, "POST", `${editsBase(packageName)}/${editId}:commit`);
}

/** Best-effort read-only check that the versionCode is present on the track. */
async function verifyLanded(ctx, config, versionCode) {
	const editId = await createEdit(ctx, config.packageName);
	try {
		const url = `${editsBase(config.packageName)}/${editId}/tracks/${encodeURIComponent(config.track)}`;
		const track = await apiFetch(ctx, "GET", url);
		const releases = track.releases ?? [];
		const found = releases.some((r) =>
			(r.versionCodes ?? []).map(String).includes(String(versionCode)),
		);
		return { found, releases };
	} finally {
		await deleteEdit(ctx, config.packageName, editId).catch(() => {});
	}
}

// ---------------------------------------------------------------------------
// AAB discovery + build
// ---------------------------------------------------------------------------

async function resolveAabPath(config, { required }) {
	if (config.aabFlag) {
		const resolved = path.resolve(process.cwd(), config.aabFlag);
		if (!(await fileExists(resolved))) {
			throw new UserError(`--aab path does not exist: ${resolved}`);
		}
		return resolved;
	}

	let entries = [];
	try {
		entries = await readdir(BUNDLE_DIR);
	} catch {
		entries = [];
	}
	const aabs = entries.filter((name) => name.toLowerCase().endsWith(".aab"));
	if (aabs.length === 0) {
		if (!required) {
			return null;
		}
		throw new UserError(
			`No .aab found in ${BUNDLE_DIR}\nBuild one first (npm run aab) or pass --aab <path>, or add --build to build automatically.`,
		);
	}

	const withMtime = await Promise.all(
		aabs.map(async (name) => {
			const full = path.join(BUNDLE_DIR, name);
			const info = await stat(full);
			return { full, mtimeMs: info.mtimeMs };
		}),
	);
	withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return withMtime[0].full;
}

async function ensureGradleWrapper() {
	if (!(await fileExists(GRADLE_WRAPPER_JAR))) {
		throw new UserError(
			[
				"Gradle wrapper is missing (android/gradle/wrapper/gradle-wrapper.jar).",
				"It is gitignored, so regenerate it once before building. With a system Gradle installed:",
				"  cd android && gradle wrapper --gradle-version 8.14.1 --distribution-type bin",
				"See DEPLOY.md -> 'Gradle wrapper' for details. Or build the AAB elsewhere and pass --aab.",
			].join("\n"),
		);
	}
}

async function runBuild() {
	await ensureGradleWrapper();
	step('Building AAB via "npm run aab" ...');
	const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
	await new Promise((resolve, reject) => {
		const child = spawn(npmCmd, ["run", "aab"], {
			stdio: "inherit",
			cwd: PROJECT_ROOT,
		});
		child.on("error", (err) =>
			reject(new UserError(`Could not start the build: ${err.message}`)),
		);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new UserError(
						`Build failed ("npm run aab" exited with code ${code}).`,
					),
				);
			}
		});
	});
}

// ---------------------------------------------------------------------------
// Release notes
// ---------------------------------------------------------------------------

function stripMarkdown(markdown) {
	return markdown
		.replace(/```[\s\S]*?```/g, "")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^\s*>\s?/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "- ")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/[*_`]/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function extractStoreNotes(markdown) {
	// Prefer an explicit store "what's new" section's fenced block (the store copy).
	const heading = /^#{1,6}\s+.*store.*what.?s new.*$/im.exec(markdown);
	if (heading) {
		const after = markdown.slice(heading.index + heading[0].length);
		const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(after);
		if (fenced) {
			return fenced[1].trim();
		}
	}
	// Otherwise, the first fenced block anywhere is a common place to keep store copy.
	const anyFenced = /```[^\n]*\n([\s\S]*?)```/.exec(markdown);
	if (anyFenced) {
		return anyFenced[1].trim();
	}
	// Last resort: strip markdown so we do not ship syntax to the store.
	return stripMarkdown(markdown);
}

function capNotes(text) {
	const trimmed = text.trim();
	if (trimmed.length <= MAX_NOTES_LEN) {
		return trimmed;
	}
	warn(
		`Release notes are ${trimmed.length} chars; Google Play caps notes at ${MAX_NOTES_LEN}. Truncating (pass --notes to control this).`,
	);
	const slice = trimmed.slice(0, MAX_NOTES_LEN - 1);
	const lastSpace = slice.lastIndexOf(" ");
	const base =
		lastSpace > MAX_NOTES_LEN - 80 ? slice.slice(0, lastSpace) : slice;
	return `${base.trimEnd()}…`;
}

async function resolveNotes(config) {
	const flag = config.notesFlag;
	let source = null;
	let raw = null;

	if (flag) {
		const asPath = path.resolve(process.cwd(), flag);
		if (await fileExists(asPath)) {
			source = asPath;
			raw = await readFile(asPath, "utf8");
		} else {
			source = "<inline --notes text>";
			raw = flag;
		}
	} else {
		const candidates = [
			path.join(PROJECT_ROOT, "release-notes", `${config.versionName}.md`),
			path.join(PROJECT_ROOT, "release-notes", "3.0.0.md"),
		];
		for (const candidate of candidates) {
			if (await fileExists(candidate)) {
				source = candidate;
				raw = await readFile(candidate, "utf8");
				break;
			}
		}
	}

	if (raw === null) {
		warn(
			"No release notes found; the release will be created without release notes.",
		);
		return { text: null, source: "<none>" };
	}

	const isMarkdown =
		source !== "<inline --notes text>"
			? source.endsWith(".md")
			: /^#{1,6}\s|```/.test(raw);
	const extracted = isMarkdown ? extractStoreNotes(raw) : raw.trim();
	const text = capNotes(extracted);
	return { text: text.length > 0 ? text : null, source };
}

// ---------------------------------------------------------------------------
// Plan output
// ---------------------------------------------------------------------------

function serviceAccountLabel(config) {
	const raw = config.serviceAccount.trim();
	if (raw.startsWith("{")) {
		return "<inline JSON>";
	}
	return path.resolve(process.cwd(), raw);
}

function printPlan(config, aabPath, notes) {
	log("Release plan:");
	log(`  package      : ${config.packageName}`);
	log(`  track        : ${config.track}`);
	log(
		`  status       : ${config.status}${config.status === "inProgress" ? ` (userFraction ${config.rollout})` : ""}`,
	);
	log(
		`  version name : ${config.versionName} (gradle versionCode ${config.gradleVersionCode ?? "?"})`,
	);
	log(`  aab          : ${aabPath ?? "<none found — build first>"}`);
	log(`  notes source : ${notes.source}`);
	log(`  service acct : ${serviceAccountLabel(config)}`);
	if (notes.text) {
		const preview =
			notes.text.length > 160 ? `${notes.text.slice(0, 160)}...` : notes.text;
		log(`  notes preview: ${preview.replace(/\n/g, " ")}`);
	}
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function runDryRun(ctx, config, aabPath, notes) {
	printPlan(config, aabPath, notes);
	step(
		"Dry run: validating credentials + Play API access (opens then abandons a throwaway edit; nothing is published) ...",
	);
	await ctx.getToken();
	ok("Authenticated with the service account.");
	const editId = await createEdit(ctx, config.packageName);
	await deleteEdit(ctx, config.packageName, editId).catch(() => {});
	ok(
		`Service account can open an edit for ${config.packageName} — package + permissions look good.`,
	);
	if (!aabPath) {
		warn(
			"No AAB was found; build one (npm run aab / --build) before a real upload.",
		);
	}
	log("Dry run complete. Re-run without --dry-run to upload and publish.");
}

async function runDeploy(ctx, config, aabPath, notes) {
	printPlan(config, aabPath, notes);
	let editId = await createEdit(ctx, config.packageName);
	step(`Opened edit ${editId}.`);
	try {
		const versionCode = await uploadBundle(
			ctx,
			config.packageName,
			editId,
			aabPath,
		);
		ok(`Uploaded bundle: versionCode ${versionCode}.`);
		if (
			config.gradleVersionCode !== null &&
			config.gradleVersionCode !== versionCode
		) {
			warn(
				`Uploaded versionCode ${versionCode} differs from gradle versionCode ${config.gradleVersionCode}.`,
			);
		}

		await assignTrack(ctx, config, editId, versionCode, notes.text);
		ok(
			`Assigned versionCode ${versionCode} to track "${config.track}" (status ${config.status}).`,
		);

		await commitEdit(ctx, config.packageName, editId);
		const committed = editId;
		editId = null; // committed — do not clean up.
		ok(`Committed edit ${committed}.`);

		try {
			const result = await verifyLanded(ctx, config, versionCode);
			if (result.found) {
				ok(
					`Verified: versionCode ${versionCode} is live on track "${config.track}".`,
				);
			} else {
				warn(
					`Could not confirm versionCode ${versionCode} on track "${config.track}" yet (it may still be propagating; check the Play Console).`,
				);
			}
		} catch (err) {
			warn(
				`Post-commit verification skipped: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		log("");
		ok("Done.");
		log(
			`versionCode ${versionCode} -> ${config.packageName} track "${config.track}" (${config.status}).`,
		);
		if (config.status === "draft") {
			log(
				"Status is draft: open Play Console -> Release to finish and roll it out.",
			);
		}
	} catch (err) {
		if (editId) {
			step(`Cleaning up: abandoning edit ${editId} ...`);
			await deleteEdit(ctx, config.packageName, editId).catch((cleanupErr) => {
				warn(
					`Could not delete edit ${editId}: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`,
				);
			});
		}
		throw err;
	}
}

async function main() {
	const values = parseCli(process.argv.slice(2));
	if (values.help) {
		console.log(USAGE);
		return;
	}

	loadDotEnv();
	const config = await resolveConfig(values);
	validateConfig(config);

	if (config.build) {
		await runBuild();
	}

	const aabPath = await resolveAabPath(config, { required: !config.dryRun });
	const notes = await resolveNotes(config);
	const ctx = await buildAuthContext(config);

	if (config.dryRun) {
		await runDryRun(ctx, config, aabPath, notes);
	} else {
		await runDeploy(ctx, config, aabPath, notes);
	}
}

// ---------------------------------------------------------------------------
// Entry point + error handling
// ---------------------------------------------------------------------------

try {
	await main();
} catch (err) {
	if (err instanceof UserError) {
		fail(err.message);
		process.exitCode = 1;
	} else if (err instanceof ApiError) {
		fail(err.message);
		const hint = err.hint();
		if (hint) {
			fail(`Hint: ${hint}`);
		}
		if (err.body) {
			const body =
				err.body.length > 1200 ? `${err.body.slice(0, 1200)}...` : err.body;
			console.error(`[${TAG}] API response body:\n${body}`);
		}
		process.exitCode = 3;
	} else if (err?.name === "TimeoutError" || err?.name === "AbortError") {
		fail(
			`Request timed out. Check your connection or raise --timeout / PLAY_UPLOAD_TIMEOUT_MS. (${err.message})`,
		);
		process.exitCode = 2;
	} else {
		fail(
			`Unexpected error: ${err instanceof Error ? err.stack || err.message : String(err)}`,
		);
		process.exitCode = 2;
	}
}
