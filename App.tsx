import { NavigationContainer } from "@react-navigation/native";
import React, { useEffect } from "react";
import RootLayout from "./app/_layout";
import { initializeMemoryManagement } from './services/memory/initializeMemoryManagement';

export default function App() {
	useEffect(() => {
		initializeMemoryManagement();
	}, []);

	return (
		<NavigationContainer>
			<RootLayout />
		</NavigationContainer>
	);
}
