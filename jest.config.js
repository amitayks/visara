module.exports = {
	preset: "@react-native/jest-preset",
	setupFiles: ["<rootDir>/jest/setup.js"],
	moduleNameMapper: {
		"^@backend/(.*)$": "<rootDir>/src/backend/$1",
	},
	transformIgnorePatterns: [
		"node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|react-native-.*|@react-navigation/.*|@shopify/flash-list|@lodev09/.*|@react-native-vector-icons/.*|@kesha-antonov/.*|@bam.tech/.*|sonner-native|zustand)/)",
	],
	passWithNoTests: true,
};
