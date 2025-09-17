import { Platform } from 'react-native';
import {
	check,
	request,
	PERMISSIONS,
	RESULTS,
	Permission,
} from 'react-native-permissions';

export const requestCameraPermission = async (): Promise<boolean> => {
	if (Platform.OS === 'android') {
		try {
			const permission = PERMISSIONS.ANDROID.CAMERA;
			const result = await check(permission);

			console.log('[Permissions] Camera permission status:', result);

			if (result === RESULTS.GRANTED) {
				return true;
			}

			if (result === RESULTS.DENIED) {
				const requestResult = await request(permission);
				console.log('[Permissions] Camera permission request result:', requestResult);
				return requestResult === RESULTS.GRANTED;
			}

			// If blocked or unavailable
			return false;
		} catch (error) {
			console.error('[Permissions] Camera permission error:', error);
			return false;
		}
	}

	if (Platform.OS === 'ios') {
		try {
			const permission = PERMISSIONS.IOS.CAMERA;
			const result = await check(permission);

			if (result === RESULTS.GRANTED) {
				return true;
			}

			if (result === RESULTS.DENIED) {
				const requestResult = await request(permission);
				return requestResult === RESULTS.GRANTED;
			}

			return false;
		} catch (error) {
			console.error('[Permissions] Camera permission error:', error);
			return false;
		}
	}

	return false;
};

export const checkCameraPermission = async (): Promise<boolean> => {
	const permission = Platform.OS === 'android' 
		? PERMISSIONS.ANDROID.CAMERA 
		: PERMISSIONS.IOS.CAMERA;

	try {
		const result = await check(permission);
		return result === RESULTS.GRANTED;
	} catch (error) {
		console.error('[Permissions] Check camera permission error:', error);
		return false;
	}
};