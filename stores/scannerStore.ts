import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScanProgress } from '../services/gallery/GalleryScanner';

interface ScannerData {
  scanProgress: ScanProgress;
  lastNotificationTime: Date | null;
  isBackgroundScanEnabled: boolean;
}

interface ScannerActions {
  setScanProgress: (progress: ScanProgress) => void;
  setLastNotificationTime: (time: Date) => void;
  setBackgroundScanEnabled: (enabled: boolean) => void;
  reset: () => void;
}

type ScannerState = ScannerData & ScannerActions;

const initialProgress: ScanProgress = {
  totalImages: 0,
  processedImages: 0,
  lastScanDate: null,
  lastProcessedAssetId: null,
  isScanning: false,
};

export const useScannerStore = create<ScannerState, [['zustand/persist', ScannerData]]>(
  persist(
    (set) => ({
      scanProgress: initialProgress,
      lastNotificationTime: null,
      isBackgroundScanEnabled: false,
      
      setScanProgress: (progress) => set({ scanProgress: progress }),
      
      setLastNotificationTime: (time) => set({ lastNotificationTime: time }),
      
      setBackgroundScanEnabled: (enabled) => set({ isBackgroundScanEnabled: enabled }),
      
      reset: () => set({
        scanProgress: initialProgress,
        lastNotificationTime: null,
        isBackgroundScanEnabled: false,
      }),
    }),
    {
      name: 'scanner-storage',
      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          await AsyncStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        scanProgress: state.scanProgress,
        lastNotificationTime: state.lastNotificationTime,
        isBackgroundScanEnabled: state.isBackgroundScanEnabled,
      }),
    }
  )
);