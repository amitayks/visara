import { StyleSheet } from 'react-native';
import type { ColorScheme } from '../../../constants/colors';

export const createStyles = (theme: ColorScheme) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: 'transparent',
		},
		backdrop: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: 'rgba(0, 0, 0, 0.9)',
		},
		image: {
			flex: 1,
			width: '100%',
			height: '100%',
		},
		closeButton: {
			position: 'absolute',
			top: 60,
			right: 20,
			width: 40,
			height: 40,
			borderRadius: 20,
			backgroundColor: 'rgba(0, 0, 0, 0.5)',
			justifyContent: 'center',
			alignItems: 'center',
			zIndex: 1000,
		},
		bottomSheetBackground: {
			borderTopLeftRadius: 20,
			borderTopRightRadius: 20,
			shadowColor: '#000',
			shadowOffset: {
				width: 0,
				height: -2,
			},
			shadowOpacity: 0.25,
			shadowRadius: 3.84,
			elevation: 5,
		},
		bottomSheetHandle: {
			width: 40,
			height: 4,
			borderRadius: 2,
			opacity: 0.3,
		},
		bottomSheetContent: {
			flex: 1,
			padding: 20,
		},
		documentInfo: {
			marginBottom: 20,
		},
		documentTitle: {
			fontSize: 18,
			fontWeight: '600',
			marginBottom: 16,
		},
		textPreview: {
			marginTop: 16,
			padding: 12,
			backgroundColor: theme.background,
			borderRadius: 8,
			borderWidth: 1,
			borderColor: theme.border,
		},
		textPreviewLabel: {
			fontSize: 14,
			fontWeight: '500',
			marginBottom: 8,
			opacity: 0.7,
		},
		textPreviewContent: {
			fontSize: 14,
			lineHeight: 20,
		},
		actionButtons: {
			flexDirection: 'row',
			justifyContent: 'space-around',
			flexWrap: 'wrap',
			gap: 12,
		},
		actionButton: {
			minWidth: '20%',
			maxWidth: '25%',
		},
	});