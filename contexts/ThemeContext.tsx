import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Colors, type ColorScheme, type ThemeMode } from '../constants/colors';
import { useSettingsStore } from '../stores/settingsStore';

interface ThemeContextType {
  theme: ColorScheme;
  themeMode: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const { settings, updateSetting } = useSettingsStore();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize theme based on settings or system preference
  useEffect(() => {
    if (!isInitialized) {
      // If theme is system, follow system preference
      if (settings.theme === 'system') {
        // System theme already handled by computed isDark
      }
      setIsInitialized(true);
    }
  }, [isInitialized, settings.theme, systemColorScheme]);

  const setTheme = (mode: ThemeMode) => {
    if (mode === 'system') {
      updateSetting('theme', 'system');
    } else {
      updateSetting('theme', mode);
    }
  };

  const toggleTheme = () => {
    const currentTheme = settings.theme;
    if (currentTheme === 'light') {
      updateSetting('theme', 'dark');
    } else {
      updateSetting('theme', 'light');
    }
  };

  const themeMode: ThemeMode = settings.theme === 'system' 
    ? (systemColorScheme as ThemeMode) || 'light'
    : settings.theme;
    
  const isDark = themeMode === 'dark';
  const theme = isDark ? Colors.dark : Colors.light;

  const value: ThemeContextType = {
    theme,
    themeMode,
    isDark,
    toggleTheme,
    setTheme,
  };

  // Don't render children until theme is initialized
  if (!isInitialized) {
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Utility hook for getting themed styles
export function useThemedStyles<T>(
  createStyles: (theme: ColorScheme) => T
): T {
  const { theme } = useTheme();
  return createStyles(theme);
}