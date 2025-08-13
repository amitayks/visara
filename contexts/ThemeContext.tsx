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
  const { settings, updateSetting, isLoading } = useSettingsStore();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize theme based on settings or system preference
  useEffect(() => {
    if (!isLoading && !isInitialized) {
      // If no dark mode setting exists, default to system theme
      if (settings.darkMode === false && systemColorScheme === 'dark') {
        // Only update if the system is dark and setting is explicitly false
        // This allows us to respect the system theme on first load
        const isFirstLoad = settings.darkMode === false; // Check if this is default
        if (isFirstLoad) {
          updateSetting('darkMode', systemColorScheme === 'dark');
        }
      }
      setIsInitialized(true);
    }
  }, [isLoading, isInitialized, settings.darkMode, systemColorScheme, updateSetting]);

  const setTheme = (mode: ThemeMode) => {
    updateSetting('darkMode', mode === 'dark');
  };

  const toggleTheme = () => {
    updateSetting('darkMode', !settings.darkMode);
  };

  const themeMode: ThemeMode = settings.darkMode ? 'dark' : 'light';
  const isDark = settings.darkMode;
  const theme = isDark ? Colors.dark : Colors.light;

  const value: ThemeContextType = {
    theme,
    themeMode,
    isDark,
    toggleTheme,
    setTheme,
  };

  // Don't render children until settings are loaded and theme is initialized
  if (isLoading || !isInitialized) {
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