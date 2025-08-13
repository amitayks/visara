import { useTheme } from '../contexts/ThemeContext';

export const useIconColors = () => {
  const { theme } = useTheme();

  return {
    // Primary icon colors
    primary: theme.text,
    secondary: theme.textSecondary,
    tertiary: theme.textTertiary,
    inverse: theme.textInverse,
    
    // Accent and action colors
    accent: theme.accent,
    success: theme.success,
    error: theme.error,
    warning: theme.warning,
    info: theme.info,
    
    // Specific icon contexts
    navigation: theme.text,
    action: theme.accent,
    disabled: theme.textTertiary,
    placeholder: theme.textSecondary,
    
    // Status indicators
    online: theme.success,
    offline: theme.textTertiary,
    processing: theme.accent,
  };
};

// Static icon color getter for non-hook contexts
export const getIconColors = (theme: any) => ({
  primary: theme.text,
  secondary: theme.textSecondary,
  tertiary: theme.textTertiary,
  inverse: theme.textInverse,
  accent: theme.accent,
  success: theme.success,
  error: theme.error,
  warning: theme.warning,
  info: theme.info,
  navigation: theme.text,
  action: theme.accent,
  disabled: theme.textTertiary,
  placeholder: theme.textSecondary,
  online: theme.success,
  offline: theme.textTertiary,
  processing: theme.accent,
});