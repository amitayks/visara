import { type PageIndex, useNavigation } from "@contexts/NavigationContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import PagerView, {
	type PagerViewOnPageSelectedEventData,
} from "react-native-pager-view";

interface HorizontalPageContainerProps {
	/** Content for page 0 (Main) */
	mainPage: React.ReactNode;
	/** Content for page 1 (Albums) */
	albumsPage: React.ReactNode;
	style?: ViewStyle;
	testID?: string;
}

export function HorizontalPageContainer({
	mainPage,
	albumsPage,
	style,
	testID,
}: HorizontalPageContainerProps) {
	const { state, dispatch } = useNavigation();
	const pagerRef = useRef<PagerView>(null);
	const [currentPageLocal, setCurrentPageLocal] = useState(state.currentPage);

	// Sync external navigation state with pager
	useEffect(() => {
		if (pagerRef.current && state.currentPage !== currentPageLocal) {
			pagerRef.current.setPage(state.currentPage);
			setCurrentPageLocal(state.currentPage);
		}
	}, [state.currentPage, currentPageLocal]);

	// Handle page selection from PagerView
	const handlePageSelected = useCallback(
		(event: { nativeEvent: PagerViewOnPageSelectedEventData }) => {
			const newPage = event.nativeEvent.position as PageIndex;
			setCurrentPageLocal(newPage);

			// Update navigation state if page changed
			if (newPage !== state.currentPage) {
				dispatch({ type: "SET_PAGE", payload: newPage });
			}
		},
		[state.currentPage, dispatch],
	);

	return (
		<View style={[styles.container, style]} testID={testID}>
			{/* Native PagerView for optimal performance */}
			<PagerView
				ref={pagerRef}
				style={styles.pagerView}
				initialPage={state.currentPage}
				onPageSelected={handlePageSelected}
				orientation="horizontal"
				overdrag={Platform.OS === "ios"}
				overScrollMode={Platform.OS === "android" ? "always" : "never"}
				offscreenPageLimit={1}
				pageMargin={0}
				scrollEnabled={true}
			>
				{/* Page 0: Main */}
				<View key="main" style={styles.page} collapsable={false}>
					{mainPage}
				</View>

				{/* Page 1: Albums */}
				<View key="albums" style={styles.page} collapsable={false}>
					{albumsPage}
				</View>
			</PagerView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	pagerView: {
		flex: 1,
	},
	page: {
		flex: 1,
		width: "100%",
	},
});
