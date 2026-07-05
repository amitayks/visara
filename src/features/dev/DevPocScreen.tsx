/**
 * DevPocScreen — route component for the `DevPoc` native-stack route,
 * registered only when `__DEV__`. Wraps the Gemma backend smoke harness
 * (rebuild-backend-gemma) with navigation-based dismissal.
 */
import { useNavigation } from "@react-navigation/native";
import { GemmaPocScreen } from "./GemmaPocScreen";

export function DevPocScreen() {
	const navigation = useNavigation();

	// Defense in depth on top of the route-level `__DEV__` gate.
	if (!__DEV__) {
		return null;
	}

	return <GemmaPocScreen onClose={() => navigation.goBack()} />;
}
