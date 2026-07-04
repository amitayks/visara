/**
 * DevPocScreen — route component for the `DevPoc` native-stack route, which
 * the nav-app agent registers only when `__DEV__` (rebuild-ui-foundation).
 * Wraps ExecutorchPocScreen with navigation-based dismissal.
 *
 * POC rules preserved (executorch-runtime-bootstrap spec): `__DEV__` only,
 * `useLLM` direct, `file://` inputs only, iPad-operable layout.
 */
import { useNavigation } from "@react-navigation/native";
import { ExecutorchPocScreen } from "./ExecutorchPocScreen";

export function DevPocScreen() {
	const navigation = useNavigation();

	// Defense in depth on top of the route-level `__DEV__` gate.
	if (!__DEV__) {
		return null;
	}

	return <ExecutorchPocScreen onClose={() => navigation.goBack()} />;
}
