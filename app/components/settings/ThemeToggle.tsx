import React from "react";
import { useTheme } from "../../../contexts/ThemeContext";
import { ToggleBar } from "../ToggleBar/ToggleBar";

export const ThemeToggle: React.FC = () => {
	const { isDark, toggleTheme } = useTheme();

	return (
		<ToggleBar
			onPress={toggleTheme}
			isChange={isDark}
			title={["Dark Mode", "Light Mode"]}
			subtitle={["Switch to light theme", "Switch to dark theme"]}
			iconsName={["moon", "sunny"]}
		/>
	);
};
