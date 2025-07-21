import { Alert } from 'react-native';

// Temporary clipboard implementation until we can properly install a clipboard package
class ClipboardService {
  private clipboardData: string = '';

  async setStringAsync(text: string): Promise<void> {
    // For now, we'll store it in memory
    // In production, you'd want to use @react-native-clipboard/clipboard
    this.clipboardData = text;
    
    // On web, we can use the browser's clipboard API
    if (typeof window !== 'undefined' && window.navigator && window.navigator.clipboard) {
      try {
        await window.navigator.clipboard.writeText(text);
      } catch (error) {
        console.warn('Failed to copy to clipboard:', error);
      }
    }
  }

  async getStringAsync(): Promise<string> {
    // On web, try to read from browser clipboard
    if (typeof window !== 'undefined' && window.navigator && window.navigator.clipboard) {
      try {
        return await window.navigator.clipboard.readText();
      } catch (error) {
        console.warn('Failed to read from clipboard:', error);
      }
    }
    return this.clipboardData;
  }
}

export const Clipboard = new ClipboardService();

export const copyToClipboard = async (text: string, label: string = 'Text') => {
  try {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    Alert.alert('Error', 'Failed to copy to clipboard');
  }
};