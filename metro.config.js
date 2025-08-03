/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const { getDefaultConfig } = require("@react-native/metro-config");
const path = require("path");

const defaultConfig = getDefaultConfig(__dirname);

module.exports = {
  ...defaultConfig,
  transformer: {
    ...defaultConfig.transformer,
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    ...defaultConfig.resolver,
    assetExts: [
      ...defaultConfig.resolver.assetExts,
      "png",
      "jpg",
      "jpeg",
      "svg", 
      "gif",
      "bmp",
      "webp",
    ],
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      "js",
      "jsx", 
      "ts",
      "tsx",
      "json",
    ],
    resolverMainFields: ['react-native', 'browser', 'main'],
    platforms: ['ios', 'android', 'native', 'web'],
  },
};