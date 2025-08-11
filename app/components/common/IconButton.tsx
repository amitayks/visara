import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TouchableOpacityProps,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';

interface IconButtonProps extends TouchableOpacityProps {
  name: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
  animated?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const IconButton: React.FC<IconButtonProps> = ({
  name,
  size = 24,
  color = '#333',
  backgroundColor,
  style,
  animated = true,
  onPressIn,
  onPressOut,
  ...props
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: any) => {
    if (animated) {
      scale.value = withSpring(0.9, {
        damping: 15,
        stiffness: 400,
      });
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    if (animated) {
      scale.value = withSpring(1, {
        damping: 15,
        stiffness: 400,
      });
    }
    onPressOut?.(e);
  };

  const buttonStyle = [
    styles.button,
    backgroundColor ? { backgroundColor } : null,
    style,
  ].filter(Boolean);

  if (animated) {
    return (
      <AnimatedTouchable
        activeOpacity={0.7}
        style={[buttonStyle, animatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...props}
      >
        <Icon name={name} size={size} color={color} />
      </AnimatedTouchable>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={buttonStyle}
      {...props}
    >
      <Icon name={name} size={size} color={color} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});