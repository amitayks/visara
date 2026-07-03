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
		"react-native-worklets/plugin",
	],
};
