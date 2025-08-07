import React, { useEffect, useCallback } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import FastImage from "react-native-fast-image";
import type Document from "../../services/database/models/Document";

const { width: screenWidth } = Dimensions.get('window');
const COLUMN_WIDTH = (screenWidth - 24) / 2; // 24 = padding (16 left + 16 right - 8 gap)

interface AnimatedDocumentCardProps {
  document: Document;
  index: number;
  onPress: (documentId: string) => void;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function AnimatedDocumentCard({
  document,
  index,
  onPress,
}: AnimatedDocumentCardProps) {
  // Calculate height based on image dimensions with fallback
  const aspectRatio = document.imageHeight && document.imageWidth 
    ? document.imageHeight / document.imageWidth 
    : 1.3; // Default aspect ratio
  const imageHeight = COLUMN_WIDTH * aspectRatio;

  // Animation values
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);
  const pressScale = useSharedValue(1);

  // Animate in on mount
  useEffect(() => {
    const delay = index * 50; // Reduced delay for faster loading
    
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 200 }));
  }, [index, opacity, translateY]);

  // Extract document ID outside of animations to avoid Reanimated serialization issues
  const documentId = document?.id || '';
  
  // Handle press
  const handlePress = useCallback(() => {
    // Log outside of the animation context
    console.log('Document ID being pressed:', documentId);
    
    // Scale animation
    pressScale.value = withTiming(0.95, { duration: 100 }, () => {
      pressScale.value = withSpring(1, { damping: 15, stiffness: 300 });
      // Pass just the document ID to avoid serialization issues
      runOnJS(onPress)(documentId);
    });
  }, [documentId, onPress, pressScale]);

  // Animated styles
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: pressScale.value },
    ],
  }));

  return (
    <AnimatedTouchableOpacity
      style={[
        {
          marginBottom: 8,
        },
        cardAnimatedStyle,
      ]}
      onPress={handlePress}
      activeOpacity={0.9}
    >
      <FastImage
        source={{ 
          uri: document.imageUri,
          priority: FastImage.priority.normal,
        }}
        style={{
          width: COLUMN_WIDTH,
          height: imageHeight,
          borderRadius: 8,
        }}
        resizeMode={FastImage.resizeMode.cover}
        onError={() => {
          console.log('Image load error for URI:', document.imageUri);
        }}
        onLoad={() => {
          console.log('Image loaded successfully:', document.imageUri);
        }}
      />
    </AnimatedTouchableOpacity>
  );
}

// No styles needed - all styling is inline for simplicity