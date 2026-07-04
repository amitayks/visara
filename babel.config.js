module.exports = {
	presets: ["module:@react-native/babel-preset"],
	plugins: [
		["@babel/plugin-proposal-decorators", { legacy: true }],
		"@babel/plugin-transform-class-static-block",
		[
			"module-resolver",
			{
				root: ["./src"],
				extensions: [
					".ios.ts",
					".android.ts",
					".ts",
					".ios.tsx",
					".android.tsx",
					".tsx",
					".jsx",
					".js",
					".json",
				],
				alias: {
					"@ui": "./src/ui",
					"@state": "./src/state",
					"@app": "./src/app",
					"@features": "./src/features",
					"@components": "./src/components",
					"@screens": "./src/screens",
					"@services": "./src/services",
					"@contexts": "./src/contexts",
					"@models": "./src/models",
					"@hooks": "./src/hooks",
					"@utils": "./src/utils",
					"@shared-types": "./src/shared-types",
					"@native-modules": "./src/native-modules",
					"@theme": "./src/theme",
					"@navigation": "./src/navigation",
				},
			},
		],
		["react-native-unistyles/plugin", { root: "src" }],
		// Worklets plugin must stay LAST (reanimated-4-animation-stack spec).
		"react-native-worklets/plugin",
	],
};
