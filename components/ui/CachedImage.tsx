import React, { useState, useEffect, useCallback } from 'react';
import {
  Image,
  ImageProps,
  ImageStyle,
  StyleProp,
  View,
  ActivityIndicator,
} from 'react-native';
import { imageCache } from '../../services/imageCache';

interface CachedImageProps extends Omit<ImageProps, 'source'> {
  uri: string;
  style?: StyleProp<ImageStyle>;
  placeholder?: React.ReactNode;
  fallback?: React.ReactNode;
}

export function CachedImage({
  uri,
  style,
  placeholder,
  fallback,
  onLoad,
  onError,
  ...imageProps
}: CachedImageProps) {
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadCachedUri = async () => {
      try {
        setIsLoading(true);
        setHasError(false);
        
        const cached = await imageCache.getCachedImageUri(uri);
        
        if (mounted) {
          setCachedUri(cached);
        }
      } catch (error) {
        console.error('Error loading cached image:', error);
        if (mounted) {
          setHasError(true);
          setCachedUri(uri); // Fallback to original URI
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    if (uri) {
      loadCachedUri();
    }

    return () => {
      mounted = false;
    };
  }, [uri]);

  const handleLoad = useCallback((event: any) => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.(event);
  }, [onLoad]);

  const handleError = useCallback((event: any) => {
    setIsLoading(false);
    setHasError(true);
    onError?.(event);
  }, [onError]);

  // Show placeholder while loading or if no URI
  if (isLoading || !cachedUri) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
        {placeholder || (
          <ActivityIndicator size="small" color="#CCCCCC" />
        )}
      </View>
    );
  }

  // Show fallback if error occurred
  if (hasError) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center' }]}>
        {fallback || placeholder || (
          <View style={{ backgroundColor: '#F5F5F5', flex: 1 }} />
        )}
      </View>
    );
  }

  // Render the cached image
  return (
    <Image
      {...imageProps}
      source={{ uri: cachedUri }}
      style={style}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}