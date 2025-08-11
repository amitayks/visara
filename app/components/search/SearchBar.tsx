import React, { useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  showSendButton: boolean;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  onSubmit,
  placeholder = "Search documents...",
  showSendButton,
  autoFocus = false,
}) => {
  const inputRef = useRef<TextInput>(null);
  const buttonScale = useSharedValue(showSendButton ? 1 : 0);
  const buttonWidth = useSharedValue(showSendButton ? 56 : 0);
  
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{
      scale: withSpring(buttonScale.value, {
        damping: 15,
        stiffness: 300
      })
    }],
    opacity: buttonScale.value,
    width: withSpring(buttonWidth.value, {
      damping: 15,
      stiffness: 300
    }),
  }));
  
  useEffect(() => {
    buttonScale.value = showSendButton ? 1 : 0;
    buttonWidth.value = showSendButton ? 56 : 0;
  }, [showSendButton]);

  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit();
      Keyboard.dismiss();
    }
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <Icon name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
          placeholderTextColor="#999"
          autoFocus={autoFocus}
          selectionColor="#6366F1"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            style={styles.clearButton}
            activeOpacity={0.7}
          >
            <Icon name="close-circle" size={18} color="#BBB" />
          </TouchableOpacity>
        )}
      </View>
      
      <Animated.View style={[styles.sendButtonContainer, buttonStyle]}>
        <TouchableOpacity
          onPress={handleSubmit}
          activeOpacity={0.7}
          disabled={!showSendButton}
          style={styles.sendButton}
        >
          <Icon name="send" size={22} color="#6366F1" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  sendButtonContainer: {
    marginLeft: 12,
    overflow: 'hidden',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  }
});