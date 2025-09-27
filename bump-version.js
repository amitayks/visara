#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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

console.log(`🚀 Bumping version to ${newVersion}...\n`);

// 1. Update package.json
try {
	const packageJsonPath = path.join(__dirname, "package.json");
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	packageJson.version = newVersion;
	fs.writeFileSync(
		packageJsonPath,
		JSON.stringify(packageJson, null, "\t") + "\n",
	);
	console.log("✅ Updated package.json");
} catch (error) {
	console.error("❌ Error updating package.json:", error.message);
}

// 2. Update app.json
try {
	const appJsonPath = path.join(__dirname, "app.json");
	const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
	appJson.version = newVersion;
	fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, "\t") + "\n");
	console.log("✅ Updated app.json");
} catch (error) {
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

	// Calculate and update versionCode (convert x.y.z to integer)
	const [major, minor, patch] = newVersion.split(".").map(Number);
	const versionCode = major * 10000 + minor * 100 + patch;
	gradleContent = gradleContent.replace(
		/versionCode\s+\d+/,
		`versionCode ${versionCode}`,
	);

	fs.writeFileSync(gradlePath, gradleContent);
	console.log(
		`✅ Updated android/app/build.gradle (versionName: ${newVersion}, versionCode: ${versionCode})`,
	);
} catch (error) {
	console.error("❌ Error updating build.gradle:", error.message);
}

// 4. Update iOS project.pbxproj
try {
	const pbxprojPath = path.join(
		__dirname,
		"ios",
		"VisaraApp.xcodeproj",
		"project.pbxproj",
	);

	if (fs.existsSync(pbxprojPath)) {
		let pbxprojContent = fs.readFileSync(pbxprojPath, "utf8");

		// Calculate build number from version (same as Android versionCode)
		const [major, minor, patch] = newVersion.split(".").map(Number);
		const buildNumber = major * 10000 + minor * 100 + patch;

		// Update MARKETING_VERSION (user-facing version like "1.2.0")
		pbxprojContent = pbxprojContent.replace(
			/MARKETING_VERSION = [^;]+;/g,
			`MARKETING_VERSION = ${newVersion};`,
		);

		// Update CURRENT_PROJECT_VERSION (build number)
		pbxprojContent = pbxprojContent.replace(
			/CURRENT_PROJECT_VERSION = [^;]+;/g,
			`CURRENT_PROJECT_VERSION = ${buildNumber};`,
		);

		fs.writeFileSync(pbxprojPath, pbxprojContent);
		console.log(
			`✅ Updated iOS project (Marketing Version: ${newVersion}, Build: ${buildNumber})`,
		);
	} else {
		console.log("⚠️  iOS project.pbxproj not found, skipping iOS update");
	}
} catch (error) {
	console.error("❌ Error updating iOS project:", error.message);
}

// 5. Update iOS Info.plist files (fallback if not using Xcode variables)
try {
	const infoPlistPaths = [
		path.join(__dirname, "ios", "VisaraApp", "Info.plist"),
		path.join(__dirname, "ios", "VisaraAppTests", "Info.plist"),
	];

	const [major, minor, patch] = newVersion.split(".").map(Number);
	const buildNumber = major * 10000 + minor * 100 + patch;

	infoPlistPaths.forEach((plistPath) => {
		if (fs.existsSync(plistPath)) {
			let plistContent = fs.readFileSync(plistPath, "utf8");

			// Update CFBundleShortVersionString if it's hardcoded (not using $(MARKETING_VERSION))
			if (!plistContent.includes("$(MARKETING_VERSION)")) {
				plistContent = plistContent.replace(
					/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/,
					`$1${newVersion}$2`,
				);
			}

			// Update CFBundleVersion if it's hardcoded (not using $(CURRENT_PROJECT_VERSION))
			if (!plistContent.includes("$(CURRENT_PROJECT_VERSION)")) {
				plistContent = plistContent.replace(
					/(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/,
					`$1${buildNumber}$2`,
				);
			}

			fs.writeFileSync(plistPath, plistContent);
		}
	});

	console.log("✅ Updated iOS Info.plist files");
} catch (error) {
	console.error("❌ Error updating Info.plist:", error.message);
}

console.log(`\n✨ Version successfully updated to ${newVersion}!`);
console.log("\n📱 Platform-specific updates:");
console.log(
	`   Android: versionCode ${major * 10000 + minor * 100 + patch}, versionName "${newVersion}"`,
);
console.log(
	`   iOS: Marketing Version ${newVersion}, Build ${major * 10000 + minor * 100 + patch}`,
);
console.log("\n📝 Next steps:");
console.log("   1. Review the changes");
console.log("   2. Test your app on both platforms");
console.log(
	'   3. Commit: git add . && git commit -m "chore: bump version to ' +
		newVersion +
		'"',
);
console.log("   4. Tag: git tag v" + newVersion);
console.log("   5. Push: git push && git push --tags");
