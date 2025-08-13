export const Colors = {
  light: {
    // Primary colors
    primary: '#000000',
    secondary: '#666666',
    accent: '#0066FF',
    
    // Background colors
    background: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceSecondary: '#F8F8FA',
    overlay: 'rgba(0, 0, 0, 0.5)',
    
    // Text colors
    text: '#333333',
    textSecondary: '#666666',
    textTertiary: '#999999',
    textInverse: '#FFFFFF',
    
    // Border colors
    border: '#E5E5E7',
    borderLight: '#F0F0F0',
    
    // Status colors
    success: '#34C759',
    error: '#FF3B30',
    warning: '#FF9500',
    info: '#0066FF',
    
    // Chat specific
    userMessage: '#007AFF',
    aiMessage: '#F2F2F7',
    
    // Component specific
    skeleton: '#F0F0F0',
    shadow: '#000000',
  },
  
  dark: {
    // Primary colors
    primary: '#FFFFFF',
    secondary: '#AAAAAA',
    accent: '#0A84FF',
    
    // Background colors
    background: '#000000',
    surface: '#1C1C1E',
    surfaceSecondary: '#2C2C2E',
    overlay: 'rgba(0, 0, 0, 0.8)',
    
    // Text colors
    text: '#FFFFFF',
    textSecondary: '#AAAAAAB3', // 70% opacity
    textTertiary: '#AAAAAA66', // 40% opacity
    textInverse: '#000000',
    
    // Border colors
    border: '#38383A',
    borderLight: '#48484A',
    
    // Status colors
    success: '#30D158',
    error: '#FF453A',
    warning: '#FF9F0A',
    info: '#0A84FF',
    
    // Chat specific
    userMessage: '#0A84FF',
    aiMessage: '#2C2C2E',
    
    // Component specific
    skeleton: '#2C2C2E',
    shadow: '#000000',
  },
};

export type ColorScheme = typeof Colors.light;
export type ThemeMode = 'light' | 'dark';