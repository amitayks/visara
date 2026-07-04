import { iosRequestReadWriteGalleryPermission } from "@react-native-camera-roll/camera-roll";
import { PermissionsAndroid, Platform } from "react-native";

export type MediaPermissionResult = "granted" | "limited" | "denied";

/**
 * Real media permission request (onboarding-experience spec; replaces the
 * always-true stub the UI used to rely on). Android 13+ scoped media
 * permissions; iOS photo library incl. limited-library selection.
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

	const status = await iosRequestReadWriteGalleryPermission();
	if (status === "granted") return "granted";
	if (status === "limited") return "limited";
	return "denied";
}
