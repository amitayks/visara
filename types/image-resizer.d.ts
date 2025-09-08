declare module '@bam.tech/react-native-image-resizer' {
	interface ResizeResult {
		uri: string;
		width: number;
		height: number;
		size: number;
	}

	interface ImageResizer {
		createResizedImage(
			uri: string,
			width: number,
			height: number,
			format: 'JPEG' | 'PNG',
			quality: number,
			rotation?: number,
			outputPath?: string,
			keepMeta?: boolean
		): Promise<ResizeResult>;
	}

	const ImageResizer: ImageResizer;
	export default ImageResizer;
}