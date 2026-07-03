#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

// Get version from command line argument
const newVersion = process.argv[2];

if (!newVersion) {
	console.error("❌ Please provide a version number");
	console.log("Usage: node bump-version.js <version>");
	console.log("Example: node bump-version.js 1.2.0");
	process.exit(1);
}

// Validate version format (basic check)
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
	console.error(
		"❌ Invalid version format. Use semantic versioning (e.g., 1.2.0)",
	);
	process.exit(1);
}

/*
 * Store build-number derivation: versionCode = major*10000 + minor*100 + patch
 * (e.g. 2.0.0 -> 20000, 3.0.0 -> 30000). This single value drives BOTH the
 * Android `versionCode` and the iOS `CURRENT_PROJECT_VERSION`.
 *
 * Constraint A -- component ceiling: `minor` and `patch` MUST each stay <= 99.
 *   2.0.100 -> 20100 collides with 2.1.0, and 2.100.0 overflows the minor band.
 *   The read-only reconciliation check (scripts/check-version-reconciliation.js)
 *   rejects any target that breaches this before a bump is trusted.
 *
 * Constraint B -- one build number per marketing version (the important one):
 *   the code is derived solely from x.y.z, so two builds of the SAME marketing
 *   version get the SAME store build number. App Store Connect / TestFlight
 *   reject a duplicate CFBundleVersion for a given CFBundleShortVersionString,
 *   and Play rejects a non-increasing versionCode on a track. A second upload
 *   of one x.y.z therefore needs a MANUAL build-counter bump (increment
 *   CURRENT_PROJECT_VERSION / versionCode only) above the previous upload.
 */
const [major, minor, patch] = newVersion.split(".").map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

// Track per-section failures so a partial (fail-soft) bump exits non-zero
// instead of being silently reported as success.
let hadFailure = false;

console.log(`🚀 Bumping version to ${newVersion}...\n`);

// 1. Update package.json
try {
	const packageJsonPath = path.join(__dirname, "package.json");
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	packageJson.version = newVersion;
	fs.writeFileSync(
		packageJsonPath,
		`${JSON.stringify(packageJson, null, "\t")}\n`,
	);
	console.log("✅ Updated package.json");
} catch (error) {
	hadFailure = true;
	console.error("❌ Error updating package.json:", error.message);
}

// 2. Update app.json
try {
	const appJsonPath = path.join(__dirname, "app.json");
	const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
	appJson.version = newVersion;
	fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, "\t")}\n`);
	console.log("✅ Updated app.json");
} catch (error) {
	hadFailure = true;
	console.error("❌ Error updating app.json:", error.message);
}

// 3. Update android/app/build.gradle
try {
	const gradlePath = path.join(__dirname, "android", "app", "build.gradle");
	let gradleContent = fs.readFileSync(gradlePath, "utf8");

	// Update versionName
	gradleContent = gradleContent.replace(
		/versionName\s+"[^"]+"/,
		`versionName "${newVersion}"`,
	);

	// Update versionCode (derived from the marketing version -- see top comment)
	gradleContent = gradleContent.replace(
		/versionCode\s+\d+/,
		`versionCode ${versionCode}`,
	);

	fs.writeFileSync(gradlePath, gradleContent);
	console.log(
		`✅ Updated android/app/build.gradle (versionName: ${newVersion}, versionCode: ${versionCode})`,
	);
} catch (error) {
	hadFailure = true;
	console.error("❌ Error updating build.gradle:", error.message);
}

// 4. Update iOS project.pbxproj -- the real, shipping project is
//    ios/Visara.xcodeproj (the old ios/VisaraApp.xcodeproj husk is gone).
try {
	const pbxprojPath = path.join(
		__dirname,
		"ios",
		"Visara.xcodeproj",
		"project.pbxproj",
	);

	if (fs.existsSync(pbxprojPath)) {
		let pbxprojContent = fs.readFileSync(pbxprojPath, "utf8");

		// Update MARKETING_VERSION (user-facing version like "1.2.0").
		// The /g flag covers EVERY build configuration (Debug + Release).
		pbxprojContent = pbxprojContent.replace(
			/MARKETING_VERSION = [^;]+;/g,
			`MARKETING_VERSION = ${newVersion};`,
		);

		// Update CURRENT_PROJECT_VERSION (build number) in every configuration.
		pbxprojContent = pbxprojContent.replace(
			/CURRENT_PROJECT_VERSION = [^;]+;/g,
			`CURRENT_PROJECT_VERSION = ${versionCode};`,
		);

		fs.writeFileSync(pbxprojPath, pbxprojContent);
		console.log(
			`✅ Updated iOS project (Marketing Version: ${newVersion}, Build: ${versionCode})`,
		);
	} else {
		hadFailure = true;
		console.error(
			"❌ iOS project.pbxproj not found at ios/Visara.xcodeproj -- iOS NOT updated",
		);
	}
} catch (error) {
	hadFailure = true;
	console.error("❌ Error updating iOS project:", error.message);
}

// 5. Update iOS Info.plist (fallback only). The real ios/Visara/Info.plist
//    defers CFBundleShortVersionString/CFBundleVersion to
//    $(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION), so the guards below make
//    this a DELIBERATE no-op -- the pbxproj (§4) is the single iOS source of
//    truth. The guarded write only takes effect if a plist ever hardcodes them.
try {
	const infoPlistPaths = [path.join(__dirname, "ios", "Visara", "Info.plist")];

	for (const plistPath of infoPlistPaths) {
		if (fs.existsSync(plistPath)) {
			let plistContent = fs.readFileSync(plistPath, "utf8");

			// Update CFBundleShortVersionString only if it's hardcoded
			// (not using $(MARKETING_VERSION)).
			if (!plistContent.includes("$(MARKETING_VERSION)")) {
				plistContent = plistContent.replace(
					/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
					`$1${newVersion}$2`,
				);
			}

			// Update CFBundleVersion only if it's hardcoded
			// (not using $(CURRENT_PROJECT_VERSION)).
			if (!plistContent.includes("$(CURRENT_PROJECT_VERSION)")) {
				plistContent = plistContent.replace(
					/(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/,
					`$1${versionCode}$2`,
				);
			}

			fs.writeFileSync(plistPath, plistContent);
		}
	}

	console.log("✅ Updated iOS Info.plist files");
} catch (error) {
	hadFailure = true;
	console.error("❌ Error updating Info.plist:", error.message);
}

console.log(`\n✨ Version successfully updated to ${newVersion}!`);
console.log("\n📱 Platform-specific updates:");
console.log(
	`   Android: versionCode ${versionCode}, versionName "${newVersion}"`,
);
console.log(`   iOS: Marketing Version ${newVersion}, Build ${versionCode}`);
console.log("\n📝 Next steps:");
console.log("   1. Review the changes");
console.log("   2. Test your app on both platforms");
console.log(
	`   3. Commit: git add . && git commit -m "chore: bump version to ${newVersion}"`,
);
console.log(`   4. Tag: git tag v${newVersion}`);
console.log("   5. Push: git push && git push --tags");

// A partial (fail-soft) bump must NOT be reported as success -- exit non-zero
// so callers / CI treat it as incomplete and the reconciliation check is run.
if (hadFailure) {
	console.error(
		"\n❌ One or more sections failed -- the bump is INCOMPLETE. Fix and re-run.",
	);
	process.exit(1);
}
