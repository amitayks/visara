import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { galleryPermissions } from '../services/permissions/galleryPermissions';
import { settingsStore } from '../stores/settingsStore';
import { backgroundScanner } from '../services/gallery/backgroundScanner';

export class PermissionChangeHandler {
    private static instance: PermissionChangeHandler;
    private appStateSubscription: any;
    private lastPermissionStatus: string | null = null;
    
    static getInstance() {
        if (!this.instance) {
            this.instance = new PermissionChangeHandler();
        }
        return this.instance;
    }
    
    async initialize() {
        console.log('[PermissionChangeHandler] Initializing');
        
        // Listen for app state changes
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
        
        // On Android, permission changes can cause app restart
        if (Platform.OS === 'android') {
            await this.checkForPermissionRestart();
        }
        
        // Load last permission status
        this.lastPermissionStatus = await AsyncStorage.getItem('last_permission_status');
    }
    
    private handleAppStateChange = async (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
            console.log('[PermissionChangeHandler] App became active, checking permissions');
            
            try {
                // App came to foreground, check if permissions changed
                const currentPerms = await galleryPermissions.checkPermission();
                const storedPerms = await AsyncStorage.getItem('last_permission_status');
                
                if (storedPerms && storedPerms !== currentPerms.status) {
                    console.log(`[PermissionChangeHandler] Permissions changed: ${storedPerms} -> ${currentPerms.status}`);
                    // Handle permission change
                    await this.handlePermissionChange(currentPerms.status);
                }
                
                await AsyncStorage.setItem('last_permission_status', currentPerms.status);
                this.lastPermissionStatus = currentPerms.status;
            } catch (error) {
                console.error('[PermissionChangeHandler] Error checking permissions:', error);
            }
        }
    };
    
    private async checkForPermissionRestart() {
        try {
            // Check if app was restarted due to permission change
            const lastCrashReason = await AsyncStorage.getItem('last_crash_reason');
            if (lastCrashReason === 'permission_change') {
                console.log('[PermissionChangeHandler] App restarted due to permission change');
                await AsyncStorage.removeItem('last_crash_reason');
                
                // Delay any background service starts
                setTimeout(() => {
                    this.reinitializeServices();
                }, 3000);
            }
        } catch (error) {
            console.error('[PermissionChangeHandler] Error checking for restart:', error);
        }
    }
    
    private async handlePermissionChange(newStatus: string) {
        console.log(`[PermissionChangeHandler] Handling permission change to: ${newStatus}`);
        
        if (newStatus === 'granted') {
            // Permission was granted, check if we should start services
            const settings = settingsStore.getState().settings;
            if (settings.autoScan) {
                console.log('[PermissionChangeHandler] Permission granted, will restart services after delay');
                // Delay to ensure app is stable
                setTimeout(() => {
                    this.reinitializeServices();
                }, 3000);
            }
        } else {
            // Permission was revoked, stop services
            console.log('[PermissionChangeHandler] Permission revoked, stopping services');
            try {
                await backgroundScanner.stopPeriodicScan();
            } catch (error) {
                console.error('[PermissionChangeHandler] Error stopping services:', error);
            }
        }
    }
    
    private async reinitializeServices() {
        console.log('[PermissionChangeHandler] Reinitializing services');
        
        try {
            // Safely reinitialize services after permission change
            const settings = settingsStore.getState().settings;
            if (settings.autoScan) {
                console.log('[PermissionChangeHandler] Restarting background scanner');
                // Stop first to ensure clean state
                await backgroundScanner.stopPeriodicScan();
                
                // Wait a bit
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Start again
                await backgroundScanner.startPeriodicScan();
            }
        } catch (error) {
            console.error('[PermissionChangeHandler] Failed to restart background scanner:', error);
        }
    }
    
    async savePermissionCrash() {
        try {
            await AsyncStorage.setItem('last_crash_reason', 'permission_change');
        } catch (error) {
            console.error('[PermissionChangeHandler] Error saving crash reason:', error);
        }
    }
    
    cleanup() {
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
        }
    }
}

export const permissionChangeHandler = PermissionChangeHandler.getInstance();