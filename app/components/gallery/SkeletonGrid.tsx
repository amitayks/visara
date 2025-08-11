import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SkeletonGridProps {
  columns: number;
  count: number;
}

const SkeletonCard: React.FC<{ width: number }> = ({ width }) => {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      shimmer.value,
      [0, 0.5, 1],
      [0.3, 0.6, 0.3]
    );
    return { opacity };
  });

  return (
    <View style={[styles.card, { width }]}>
      <Animated.View style={[styles.image, shimmerStyle, { width, height: width * 1.4 }]} />
      <View style={styles.content}>
        <Animated.View style={[styles.title, shimmerStyle]} />
        <View style={styles.metaRow}>
          <Animated.View style={[styles.date, shimmerStyle]} />
          <Animated.View style={[styles.amount, shimmerStyle]} />
        </View>
      </View>
    </View>
  );
};

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ columns, count }) => {
  const spacing = 8;
  const containerPadding = 16;
  const itemWidth = (SCREEN_WIDTH - (containerPadding * 2) - spacing) / columns;

  const items = Array.from({ length: count }, (_, i) => i);
  
  return (
    <View style={styles.container}>
      {items.map((index) => {
        const isLeft = index % 2 === 0;
        return (
          <View
            key={index}
            style={[
              styles.itemContainer,
              { width: itemWidth },
              isLeft ? styles.leftItem : styles.rightItem,
            ]}
          >
            <SkeletonCard width={itemWidth} />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  itemContainer: {
    marginBottom: 8,
  },
  leftItem: {
    marginRight: 4,
  },
  rightItem: {
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  image: {
    backgroundColor: '#F0F0F0',
  },
  content: {
    padding: 12,
  },
  title: {
    height: 14,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    marginBottom: 8,
    width: '70%',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  date: {
    height: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    width: '40%',
  },
  amount: {
    height: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    width: '30%',
  },
});