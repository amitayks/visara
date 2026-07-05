/**
 * Jest environment for the rebuilt UI (rebuild-ui-foundation task 1.4):
 * native modules are mocked so store/facade/gesture logic runs pure-JS.
 */
require("react-native-gesture-handler/jestSetup");
require("react-native-unistyles/mocks");

// Reanimated 4's bundled mock drags in react-native-worklets' native init,
// which explodes off-device — a minimal hand mock covers what our code uses.
jest.mock("react-native-reanimated", () => {
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
		withRepeat: (v) => v,
		withSequence: (...v) => v[v.length - 1],
		cancelAnimation: () => {},
		clamp: (v, min, max) => Math.min(Math.max(v, min), max),
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

// MDI package requires its .ttf at module scope — no ttf transform in the
// RN jest preset, so mock the whole icon package to a plain Text.
jest.mock("@react-native-vector-icons/material-design-icons", () => {
	const React = require("react");
	const { Text } = require("react-native");
	const MockIcon = (props) =>
		React.createElement(Text, { testID: props.testID }, props.name);
	return { __esModule: true, default: MockIcon };
});

jest.mock("@lodev09/react-native-true-sheet", () => {
	const React = require("react");
	const { View } = require("react-native");
	const TrueSheet = React.forwardRef((props, ref) => {
		React.useImperativeHandle(ref, () => ({
			present: async () => {},
			dismiss: async () => {},
		}));
		return React.createElement(View, null, props.children);
	});
	return { TrueSheet };
});

jest.mock("sonner-native", () => ({
	Toaster: () => null,
	toast: Object.assign(jest.fn(), {
		success: jest.fn(),
		error: jest.fn(),
	}),
}));

// --- v2 backend native deps (rebuild-backend-gemma): benign stubs so any
// transitive import of backend modules stays pure-JS under jest. Backend unit
// tests themselves import only dependency-free pure modules.
jest.mock("@op-engineering/op-sqlite", () => ({
	open: jest.fn(() => {
		throw new Error("op-sqlite is not available under jest");
	}),
}));

jest.mock("llama.rn", () => ({
	initLlama: jest.fn(async () => {
		throw new Error("llama.rn is not available under jest");
	}),
	releaseAllLlama: jest.fn(async () => {}),
}));

jest.mock("@kesha-antonov/react-native-background-downloader", () => {
	const task = () => {
		const t = {
			begin: () => t,
			progress: () => t,
			done: () => t,
			error: () => t,
			pause: () => {},
			resume: () => {},
			stop: () => {},
		};
		return t;
	};
	return {
		directories: { documents: "/tmp/jest-documents" },
		createDownloadTask: jest.fn(task),
		getExistingDownloadTasks: jest.fn(async () => []),
		setConfig: jest.fn(),
		completeHandler: jest.fn(),
	};
});

jest.mock("react-native-background-actions", () => ({
	__esModule: true,
	default: {
		start: jest.fn(async () => {}),
		stop: jest.fn(async () => {}),
		updateNotification: jest.fn(async () => {}),
		isRunning: jest.fn(() => false),
	},
}));

jest.mock("expo-keep-awake", () => ({
	activateKeepAwakeAsync: jest.fn(async () => {}),
	deactivateKeepAwake: jest.fn(async () => {}),
}));

jest.mock("react-native-device-info", () => ({
	getTotalMemory: jest.fn(async () => 8 * 1024 * 1024 * 1024),
	getFreeDiskStorage: jest.fn(async () => 64 * 1024 * 1024 * 1024),
	getPowerState: jest.fn(async () => ({
		batteryLevel: 0.9,
		batteryState: "unplugged",
	})),
	isBatteryCharging: jest.fn(async () => false),
}));

jest.mock("@dr.pogodin/react-native-fs", () => ({
	DocumentDirectoryPath: "/tmp/jest-documents",
	CachesDirectoryPath: "/tmp/jest-caches",
	exists: jest.fn(async () => false),
	mkdir: jest.fn(async () => {}),
	unlink: jest.fn(async () => {}),
	stat: jest.fn(async () => ({ size: 0 })),
	hash: jest.fn(async () => "deadbeef"),
	readDir: jest.fn(async () => []),
}));

jest.mock("@bam.tech/react-native-image-resizer", () => ({
	__esModule: true,
	default: {
		createResizedImage: jest.fn(async () => ({
			uri: "file:///tmp/jest-caches/resized.jpg",
			path: "/tmp/jest-caches/resized.jpg",
		})),
	},
}));
