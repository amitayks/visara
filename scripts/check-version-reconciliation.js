#!/usr/bin/env node

/*
 * Read-only version reconciliation check (the safety net for bump-version.js's
 * per-section fail-soft behavior). Given a target x.y.z (an explicit arg, or
 * package.json's current version), it asserts that EVERY platform anchor agrees:
 *
 *   - package.json                          -> version
 *   - app.json                              -> version
 *   - android/app/build.gradle              -> versionName + versionCode
 *   - ios/Visara.xcodeproj/project.pbxproj  -> MARKETING_VERSION (all configs)
 *                                              + CURRENT_PROJECT_VERSION (all configs)
 *
 * The derived store build number is major*10000 + minor*100 + patch and MUST
 * equal every Android versionCode / iOS CURRENT_PROJECT_VERSION. A target whose
 * minor or patch exceeds 99 is REJECTED (Constraint A -- the derivation would
 * collide or be non-monotonic, e.g. 2.0.100 -> 20100 == 2.1.0).
 *
 * This script NEVER writes. It exits 0 when all anchors agree, and non-zero on
 * any mismatch, missing anchor, or out-of-range target.
 *
 * Usage: node scripts/check-version-reconciliation.js [x.y.z]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(relPath) {
	return fs.readFileSync(path.join(root, relPath), "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const target = process.argv[2] || packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(target)) {
	console.error(`❌ Invalid target version "${target}" (expected x.y.z).`);
	process.exit(1);
}

const [major, minor, patch] = target.split(".").map(Number);

// Constraint A -- component ceiling. Reject before comparing anything.
if (minor > 99 || patch > 99) {
	console.error(
		`❌ Target ${target} breaches the component ceiling: minor and patch must each be <= 99, otherwise the derived build number collides or is non-monotonic (e.g. 2.0.100 -> 20100 == 2.1.0).`,
	);
	process.exit(1);
}

const expectedCode = major * 10000 + minor * 100 + patch;
const failures = [];

function check(label, ok, detail) {
	if (ok) {
		console.log(`✅ ${label}: ${detail}`);
	} else {
		failures.push(label);
		console.error(`❌ ${label}: ${detail}`);
	}
}

// package.json
check(
	"package.json version",
	packageJson.version === target,
	`${packageJson.version} (want ${target})`,
);

// app.json
const appJson = JSON.parse(read("app.json"));
check(
	"app.json version",
	appJson.version === target,
	`${appJson.version} (want ${target})`,
);

// android/app/build.gradle
const gradle = read("android/app/build.gradle");
const gradleName = gradle.match(/versionName\s+"([^"]+)"/);
check(
	"android versionName",
	gradleName !== null && gradleName[1] === target,
	`${gradleName ? gradleName[1] : "MISSING"} (want ${target})`,
);
const gradleCode = gradle.match(/versionCode\s+(\d+)/);
check(
	"android versionCode",
	gradleCode !== null && Number(gradleCode[1]) === expectedCode,
	`${gradleCode ? gradleCode[1] : "MISSING"} (want ${expectedCode})`,
);

// ios/Visara.xcodeproj/project.pbxproj -- every build configuration must agree.
const pbxproj = read("ios/Visara.xcodeproj/project.pbxproj");
const marketing = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(
	(m) => m[1].trim(),
);
check(
	"iOS MARKETING_VERSION (all configs)",
	marketing.length > 0 && marketing.every((v) => v === target),
	`[${marketing.join(", ") || "MISSING"}] (want ${target})`,
);
const projectVersion = [
	...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g),
].map((m) => m[1].trim());
check(
	"iOS CURRENT_PROJECT_VERSION (all configs)",
	projectVersion.length > 0 &&
		projectVersion.every((v) => Number(v) === expectedCode),
	`[${projectVersion.join(", ") || "MISSING"}] (want ${expectedCode})`,
);

// Non-build anchors the bump script intentionally does NOT rewrite -- surfaced
// for MANUAL reconciliation (informational; they do not fail this check).
const readmePath = path.join(root, "README.md");
if (fs.existsSync(readmePath)) {
	const readmeMatch = read("README.md").match(/v(\d+\.\d+\.\d+)/);
	if (readmeMatch && readmeMatch[1] !== target) {
		console.log(
			`ℹ️  README.md mentions v${readmeMatch[1]} (a doc string, not a build anchor) -- update it manually to v${target}.`,
		);
	}
}

if (failures.length > 0) {
	console.error(
		`\n❌ Reconciliation FAILED -- ${failures.length} anchor(s) disagree with ${target}: ${failures.join(", ")}.`,
	);
	process.exit(1);
}

console.log(
	`\n✅ Reconciliation PASSED -- all anchors read ${target}, store build number ${expectedCode}.`,
);
