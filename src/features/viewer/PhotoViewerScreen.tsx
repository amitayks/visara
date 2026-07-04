/**
 * PhotoViewerScreen — transparent-modal photo viewer over the shell.
 *
 * Paging: horizontal FlatList with pagingEnabled + getItemLayout. Every page
 * settle writes viewerStore.index synchronously (momentum-end + viewability
 * fallback), so title/date, the Info sheet, and all actions target the
 * CURRENTLY displayed photo — the old stale-metadata bug is structurally
 * impossible (surfaces read items[index] from the store, never mount props).
 *
 * Dismissal is owned here (route registers gestureEnabled: false): swipe-down
 * (per-page pan) fades the backdrop via a shared dismiss progress, then
 * goBack(); viewerStore closes on unmount so every exit path (chrome back,
 * Android back, label-tap, delete-to-empty) resolves identically without a
 * blank frame during the route's fade-out.
 */

import type { MediaFile } from "@models/MediaFile";
import { useNavigation } from "@react-navigation/native";
import { removeMedia } from "@services/facade";
import { useViewerStore } from "@state/viewerStore";
import { Button, Dialog, IconButton, Text, toast } from "@ui/components";
import { motion, StyleSheet } from "@ui/theme";
import { sharePhoto } from "@utils/photoActions";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	FlatList,
	type FlatListProps,
	type ListRenderItemInfo,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	useWindowDimensions,
	View,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { formatViewerDate } from "./formatDate";
import { InfoSheet, type InfoSheetRef } from "./InfoSheet";
import { ViewerPage } from "./ViewerPage";

export function PhotoViewerScreen() {
	const navigation = useNavigation();
	const items = useViewerStore((s) => s.items);
	const index = useViewerStore((s) => s.index);
	const { width, height } = useWindowDimensions();

	const [scrollEnabled, setScrollEnabled] = useState(true);
	const [chromeVisible, setChromeVisible] = useState(true);
	const [deleteVisible, setDeleteVisible] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const listRef = useRef<FlatList<MediaFile>>(null);
	const infoRef = useRef<InfoSheetRef>(null);
	const initialIndexRef = useRef(index);
	const dismissedRef = useRef(false);
	const pendingScrollIndexRef = useRef<number | null>(null);

	const dismissProgress = useSharedValue(0);
	const mountProgress = useSharedValue(0);
	const chromeOpacity = useSharedValue(1);

	const media: MediaFile | undefined = items[index];

	// Fade-scale entrance (simple stand-in for the deferred shared-bounds
	// transition, design D3).
	useEffect(() => {
		mountProgress.value = withTiming(1, {
			duration: motion.duration.base,
			easing: Easing.bezier(...motion.morphBezier),
		});
	}, [mountProgress]);

	// Single close path for every exit; idempotent so delete-to-empty plus the
	// empty-items effect can't double-pop.
	const closeViewer = useCallback(() => {
		if (dismissedRef.current) return;
		dismissedRef.current = true;
		navigation.goBack();
	}, [navigation]);

	// The store closes when the route actually unmounts (covers Android back
	// and avoids a blank viewer during the fade-out that closing-before-goBack
	// would cause).
	useEffect(() => {
		return () => {
			const store = useViewerStore.getState();
			if (store.isOpen) store.close();
		};
	}, []);

	// Never present an empty viewer.
	useEffect(() => {
		if (items.length === 0) closeViewer();
	}, [items, closeViewer]);

	// Chrome fade (GPU opacity only; pointerEvents driven from React state).
	useEffect(() => {
		chromeOpacity.value = withTiming(chromeVisible ? 1 : 0, {
			duration: motion.duration.fast,
		});
	}, [chromeVisible, chromeOpacity]);

	// Keep the page under the finger on rotation / width change.
	useEffect(() => {
		const store = useViewerStore.getState();
		if (store.items.length > 0) {
			listRef.current?.scrollToIndex({ index: store.index, animated: false });
		}
	}, [width]);

	// After a delete re-snapshot, land exactly on the adjusted index.
	useEffect(() => {
		if (pendingScrollIndexRef.current != null) {
			listRef.current?.scrollToIndex({
				index: pendingScrollIndexRef.current,
				animated: false,
			});
			pendingScrollIndexRef.current = null;
		}
	}, [items]);

	// --- paging → store index (synchronous on settle) ---

	const handleMomentumEnd = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const page = Math.round(event.nativeEvent.contentOffset.x / width);
			const store = useViewerStore.getState();
			if (page !== store.index) store.setIndex(page);
		},
		[width],
	);

	const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60 });
	const onViewableItemsChangedRef = useRef<
		NonNullable<FlatListProps<MediaFile>["onViewableItemsChanged"]>
	>((info) => {
		const first = info.viewableItems.find((token) => token.isViewable);
		if (first && first.index != null) {
			const store = useViewerStore.getState();
			if (first.index !== store.index) store.setIndex(first.index);
		}
	});

	// --- actions (always resolved against the CURRENT store index) ---

	const handleShare = useCallback(async () => {
		const store = useViewerStore.getState();
		const target = store.items[store.index];
		if (!target) return;
		try {
			await sharePhoto(target);
		} catch {
			toast.error("Couldn't share photo");
		}
	}, []);

	const openInfo = useCallback(() => {
		infoRef.current?.present();
	}, []);

	const requestDeleteFromSheet = useCallback(async () => {
		// The confirm dialog lives at screen level; dismiss the native sheet
		// first so the RN Modal stacks cleanly above the viewer.
		await infoRef.current?.dismiss();
		setDeleteVisible(true);
	}, []);

	const performDelete = useCallback(
		async (permanent: boolean) => {
			const store = useViewerStore.getState();
			const target = store.items[store.index];
			if (!target || deleting) return;
			setDeleting(true);
			try {
				await removeMedia(target, { permanent });
				toast.success(
					permanent ? "Deleted from device" : "Removed from Visara",
				);
				const remaining = store.items.filter((m) => m.id !== target.id);
				if (remaining.length === 0) {
					closeViewer();
				} else {
					const nextIndex = Math.min(store.index, remaining.length - 1);
					pendingScrollIndexRef.current = nextIndex;
					store.open(remaining, nextIndex);
					// A page deleted while zoomed unmounts without unzooming.
					setScrollEnabled(true);
				}
			} catch {
				toast.error("Couldn't delete photo");
			} finally {
				setDeleting(false);
				setDeleteVisible(false);
			}
		},
		[closeViewer, deleting],
	);

	const handleZoomChange = useCallback((zoomed: boolean) => {
		setScrollEnabled(!zoomed);
	}, []);

	const toggleChrome = useCallback(() => {
		setChromeVisible((visible) => !visible);
	}, []);

	// --- rendering ---

	const getItemLayout = useCallback(
		(_data: ArrayLike<MediaFile> | null | undefined, itemIndex: number) => ({
			length: width,
			offset: width * itemIndex,
			index: itemIndex,
		}),
		[width],
	);

	const renderItem = useCallback(
		({ item, index: itemIndex }: ListRenderItemInfo<MediaFile>) => (
			<ViewerPage
				item={item}
				width={width}
				height={height}
				isActive={itemIndex === index}
				dismissProgress={dismissProgress}
				onZoomChange={handleZoomChange}
				onDismiss={closeViewer}
				onShowInfo={openInfo}
				onToggleChrome={toggleChrome}
			/>
		),
		[
			width,
			height,
			index,
			dismissProgress,
			handleZoomChange,
			closeViewer,
			openInfo,
			toggleChrome,
		],
	);

	const backdropAnimatedStyle = useAnimatedStyle(() => ({
		opacity: mountProgress.value * (1 - dismissProgress.value),
	}));
	const contentAnimatedStyle = useAnimatedStyle(() => ({
		opacity: mountProgress.value,
		transform: [{ scale: 0.94 + 0.06 * mountProgress.value }],
	}));
	const topChromeAnimatedStyle = useAnimatedStyle(() => ({
		opacity: chromeOpacity.value * (1 - dismissProgress.value),
	}));
	const bottomChromeAnimatedStyle = useAnimatedStyle(() => ({
		opacity: chromeOpacity.value * (1 - dismissProgress.value),
	}));

	if (!media) {
		return <View style={styles.root} />;
	}

	return (
		<View style={styles.root} testID="photo-viewer">
			<Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />

			<Animated.View style={[styles.content, contentAnimatedStyle]}>
				<FlatList<MediaFile>
					ref={listRef}
					data={items}
					renderItem={renderItem}
					keyExtractor={(item) => item.id}
					horizontal
					pagingEnabled
					showsHorizontalScrollIndicator={false}
					scrollEnabled={scrollEnabled}
					getItemLayout={getItemLayout}
					initialScrollIndex={initialIndexRef.current}
					initialNumToRender={1}
					maxToRenderPerBatch={2}
					windowSize={5}
					onMomentumScrollEnd={handleMomentumEnd}
					onViewableItemsChanged={onViewableItemsChangedRef.current}
					viewabilityConfig={viewabilityConfigRef.current}
					testID="photo-viewer-pager"
				/>
			</Animated.View>

			<Animated.View
				style={[styles.topChrome, topChromeAnimatedStyle]}
				pointerEvents={chromeVisible ? "box-none" : "none"}
			>
				<IconButton
					icon="arrow-left"
					onPress={closeViewer}
					accessibilityLabel="Close photo"
					testID="viewer-back"
				/>
				<View style={styles.titleBlock}>
					<Text variant="headline" numberOfLines={1}>
						{media.filename}
					</Text>
					<Text variant="caption" color="textSecondary">
						{formatViewerDate(media.creationDate)}
					</Text>
				</View>
			</Animated.View>

			<Animated.View
				style={[styles.bottomChrome, bottomChromeAnimatedStyle]}
				pointerEvents={chromeVisible ? "box-none" : "none"}
			>
				<IconButton
					icon="share-variant"
					onPress={() => {
						void handleShare();
					}}
					accessibilityLabel="Share photo"
					testID="viewer-share"
				/>
				<IconButton
					icon="information-outline"
					onPress={openInfo}
					accessibilityLabel="Photo info"
					testID="viewer-info"
				/>
				<IconButton
					icon="delete-outline"
					onPress={() => setDeleteVisible(true)}
					accessibilityLabel="Delete photo"
					testID="viewer-delete"
				/>
			</Animated.View>

			<InfoSheet
				ref={infoRef}
				onRequestDelete={() => {
					void requestDeleteFromSheet();
				}}
				onRequestClose={closeViewer}
			/>

			<Dialog
				visible={deleteVisible}
				title="Delete photo?"
				message="Remove this photo from Visara only, or delete the original file from this device."
				confirmLabel="Delete from device"
				cancelLabel="Cancel"
				destructive
				onConfirm={() => {
					void performDelete(true);
				}}
				onCancel={() => {
					if (!deleting) setDeleteVisible(false);
				}}
			>
				<Button
					title="Remove from Visara"
					variant="secondary"
					loading={deleting}
					onPress={() => {
						void performDelete(false);
					}}
					testID="viewer-delete-app-only"
				/>
			</Dialog>
		</View>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	root: {
		flex: 1,
	},
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: theme.colors.background,
	},
	content: {
		flex: 1,
	},
	topChrome: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
		paddingTop: rt.insets.top + theme.spacing.sm,
		paddingBottom: theme.spacing.md,
		paddingHorizontal: theme.spacing.lg,
		backgroundColor: theme.colors.barBackground,
	},
	titleBlock: {
		flex: 1,
		gap: theme.spacing.xxs,
	},
	bottomChrome: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-evenly",
		paddingTop: theme.spacing.md,
		paddingBottom: rt.insets.bottom + theme.spacing.md,
		paddingHorizontal: theme.spacing.xl,
		backgroundColor: theme.colors.barBackground,
	},
}));
