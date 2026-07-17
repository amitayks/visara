const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
	server: {
		// Force full dev bundles: lazy/split dev bundling defers side-effect
		// modules, which breaks native-module registration that must run at
		// import time (Unistyles' Nitro hybrids registered via its TurboModule
		// init were deferred on Android — same failure class as commit 38f2dcf).
		// Release bundles are single-file and unaffected.
		rewriteRequestUrl: (url) => url.replace(/([?&])lazy=true/, "$1lazy=false"),
	},
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
