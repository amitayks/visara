import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({
	id: 'visara-storage',
	encryptionKey: 'visara-encryption-key-2024',
});

export const getItem = (key: string): string | undefined => {
	return storage.getString(key);
};

export const setItem = (key: string, value: string): void => {
	storage.set(key, value);
};

export const removeItem = (key: string): void => {
	storage.delete(key);
};

export const clearAll = (): void => {
	storage.clearAll();
};

export const getAllKeys = (): string[] => {
	return storage.getAllKeys();
};
