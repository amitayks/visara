module.exports = {
	preset: "@react-native/jest-preset",
	setupFiles: ["<rootDir>/jest/setup.js"],
	transformIgnorePatterns: [
		"node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-.*|react-native-.*|@react-navigation/.*|@shopify/flash-list|@nozbe/.*|@lodev09/.*|@react-native-camera-roll/.*|@react-native-vector-icons/.*|@kesha-antonov/.*|@bam.tech/.*|@notifee/.*|sonner-native|zustand)/)",
	],
	passWithNoTests: true,
};
