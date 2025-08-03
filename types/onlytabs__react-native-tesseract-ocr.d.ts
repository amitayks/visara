declare module '@onlytabs/react-native-tesseract-ocr' {
  export interface TesseractOptions {
    whitelist?: string | null;
    blacklist?: string | null;
  }

  export interface TesseractOcr {
    recognize(
      imageUri: string,
      language: string,
      options?: TesseractOptions
    ): Promise<string>;
  }

  const TesseractOcr: TesseractOcr;
  export default TesseractOcr;
}