import {
	CameraRoll,
	iosReadGalleryPermission,
} from "@react-native-camera-roll/camera-roll";
import { PermissionsAndroid, Platform } from "react-native";

export type MediaPermissionResult = "granted" | "limited" | "denied";

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	fallback: T,
): Promise<T> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(fallback), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			() => {
				clearTimeout(timer);
				resolve(fallback);
			},
		);
	});
}

/**
 * Real media permission request (onboarding-experience spec; replaces the
 * always-true stub the old UI relied on).
 *
 * iOS note: the camera-roll REQUEST API can hang on bridgeless RN, so we
 * check status and, when undetermined, trigger the OS prompt implicitly via
 * a minimal getPhotos call (the pre-rebuild behavior), then re-check. Every
 * native await is timeout-raced so the app boot can never wedge on it.
 */
export async function requestMediaPermissions(): Promise<MediaPermissionResult> {
	if (Platform.OS === "android") {
		const results = await PermissionsAndroid.requestMultiple([
			PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
			PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
		]);
		const images =
			results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES] ?? "denied";
		const video =
			results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO] ?? "denied";
		if (images === "granted" || video === "granted") return "granted";
		return "denied";
	}

	const toResult = (status: string): MediaPermissionResult | null => {
		if (status === "granted") return "granted";
		if (status === "limited") return "limited";
		if (status === "denied" || status === "blocked" || status === "unavailable")
			return "denied";
		return null; // not-determined
	};

	const status = await withTimeout(
		iosReadGalleryPermission("readWrite"),
		4000,
		"not-determined",
	);
	const initial = toResult(status);
	if (initial) return initial;

	// Undetermined: a minimal library read triggers the system prompt and
	// resolves once the user answers (or immediately if pre-granted). The
	// timeout only caps how long boot waits — the OS prompt itself stays up,
	// and a late grant is picked up by discovery on its next pass.
	await withTimeout(
		CameraRoll.getPhotos({ first: 1 }).then(() => undefined),
		8000,
		undefined,
	);

	const after = await withTimeout(
		iosReadGalleryPermission("readWrite"),
		4000,
		// If even the status check wedges, do not block the pipeline: proceed
		// as granted and let discovery surface the real state (empty results).
		"granted",
	);
	return toResult(after) ?? "granted";
}
