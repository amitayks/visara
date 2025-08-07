import { NavigationContainer } from "@react-navigation/native";
import React from "react";
import RootLayout from "./app/_layout";

export default function App() {
	return (
		<NavigationContainer>
			<RootLayout />
		</NavigationContainer>
	);
}
