/**
 * Jest environment for the rebuilt UI (rebuild-ui-foundation task 1.4):
 * native modules are mocked so store/facade/gesture logic runs pure-JS.
 */
require("react-native-gesture-handler/jestSetup");
require("react-native-unistyles/mocks");

// Reanimated 4's bundled mock drags in react-native-worklets' native init,
// which explodes off-device — a minimal hand mock covers what our code uses.
jest.mock("react-native-reanimated", () => {
	const React = require("react");
	const { View, Text, ScrollView, Image } = require("react-native");
	const shared = (value) => ({ value });
	return {
		__esModule: true,
		default: {
			View,
			Text,
			ScrollView,
			Image,
			createAnimatedComponent: (c) => c,
		},
		makeMutable: shared,
		useSharedValue: shared,
		useAnimatedStyle: (factory) => (factory ? factory() : {}),
		useAnimatedKeyboard: () => ({ height: shared(0), state: shared(0) }),
		withSpring: (v) => v,
		withTiming: (v) => v,
		withDelay: (_d, v) => v,
		runOnJS: (fn) => fn,
		runOnUI: (fn) => fn,
		interpolate: () => 0,
		Extrapolation: { CLAMP: "clamp", EXTEND: "extend" },
		Easing: { bezier: () => (t) => t, linear: (t) => t },
		FadeIn: { duration: () => ({}) },
		FadeOut: { duration: () => ({}) },
		createAnimatedComponent: (c) => c,
	};
});

jest.mock("react-native-worklets", () => ({
	scheduleOnUI: (fn) => fn,
	createWorkletRuntime: () => ({}),
}));

// In-memory MMKV: preserves the typed get/set semantics the settings
// migration depends on (string vs boolean keys never interconvert).
jest.mock("react-native-mmkv", () => {
	class MemoryMMKV {
		store = new Map();
		set(key, value) {
			this.store.set(key, value);
		}
		getString(key) {
			const v = this.store.get(key);
			return typeof v === "string" ? v : undefined;
		}
		getBoolean(key) {
			const v = this.store.get(key);
			return typeof v === "boolean" ? v : undefined;
		}
		getNumber(key) {
			const v = this.store.get(key);
			return typeof v === "number" ? v : undefined;
		}
		contains(key) {
			return this.store.has(key);
		}
		remove(key) {
			this.store.delete(key);
		}
		clearAll() {
			this.store.clear();
		}
		getAllKeys() {
			return [...this.store.keys()];
		}
	}
	return { createMMKV: () => new MemoryMMKV(), MMKV: MemoryMMKV };
});

jest.mock("@lodev09/react-native-true-sheet", () => ({
	TrueSheet: () => null,
}));

jest.mock("sonner-native", () => ({
	Toaster: () => null,
	toast: Object.assign(jest.fn(), {
		success: jest.fn(),
		error: jest.fn(),
	}),
}));

jest.mock("@react-native-camera-roll/camera-roll", () => ({
	iosRequestReadWriteGalleryPermission: jest.fn(async () => "granted"),
	CameraRoll: {},
}));
