import { createMMKV } from "react-native-mmkv";

// id and encryptionKey must stay byte-for-byte identical across upgrades:
// existing on-disk data (AES-128, cropped 16-byte effective key) depends on them.
export const storage = createMMKV({
	id: "visara-storage",
	encryptionKey: "visara-encryption-key-2024",
});

export const getItem = (key: string): string | undefined => {
	return storage.getString(key);
};

export const setItem = (key: string, value: string): void => {
	storage.set(key, value);
};

export const removeItem = (key: string): void => {
	storage.remove(key);
};

export const clearAll = (): void => {
	storage.clearAll();
};

export const getAllKeys = (): string[] => {
	return storage.getAllKeys();
};
