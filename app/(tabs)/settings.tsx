import React from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet,
  Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface SettingItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  type: 'toggle' | 'link' | 'info';
  value?: boolean;
}

export default function SettingsScreen() {
  const [autoScan, setAutoScan] = React.useState(true);
  const [notifications, setNotifications] = React.useState(false);
  const [biometric, setBiometric] = React.useState(false);

  const settingSections = [
    {
      title: 'Document Processing',
      items: [
        {
          id: 'auto-scan',
          title: 'Auto-scan Gallery',
          subtitle: 'Automatically scan new photos for documents',
          icon: 'scan-outline',
          type: 'toggle' as const,
          value: autoScan,
          onValueChange: setAutoScan,
        },
        {
          id: 'scan-quality',
          title: 'Scan Quality',
          subtitle: 'High quality (uses more battery)',
          icon: 'options-outline',
          type: 'link' as const,
        },
      ],
    },
    {
      title: 'Privacy & Security',
      items: [
        {
          id: 'biometric',
          title: 'Biometric Lock',
          subtitle: 'Require Face ID or Touch ID to open app',
          icon: 'finger-print-outline',
          type: 'toggle' as const,
          value: biometric,
          onValueChange: setBiometric,
        },
        {
          id: 'encryption',
          title: 'Document Encryption',
          subtitle: 'Encrypt sensitive documents',
          icon: 'lock-closed-outline',
          type: 'link' as const,
        },
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          id: 'notifications',
          title: 'Push Notifications',
          subtitle: 'Get notified about new documents',
          icon: 'notifications-outline',
          type: 'toggle' as const,
          value: notifications,
          onValueChange: setNotifications,
        },
      ],
    },
    {
      title: 'Storage',
      items: [
        {
          id: 'storage',
          title: 'Storage Used',
          subtitle: '1.2 GB of 5 GB',
          icon: 'server-outline',
          type: 'info' as const,
        },
        {
          id: 'clear-cache',
          title: 'Clear Cache',
          subtitle: 'Free up space by clearing temporary files',
          icon: 'trash-outline',
          type: 'link' as const,
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          id: 'version',
          title: 'Version',
          subtitle: '1.0.0',
          icon: 'information-circle-outline',
          type: 'info' as const,
        },
        {
          id: 'privacy',
          title: 'Privacy Policy',
          icon: 'shield-checkmark-outline',
          type: 'link' as const,
        },
        {
          id: 'terms',
          title: 'Terms of Service',
          icon: 'document-text-outline',
          type: 'link' as const,
        },
      ],
    },
  ];

  const renderSettingItem = (item: any) => {
    if (item.type === 'toggle') {
      return (
        <View style={styles.settingItem}>
          <View style={styles.settingItemLeft}>
            <Ionicons name={item.icon} size={24} color="#666666" />
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              {item.subtitle && <Text style={styles.settingSubtitle}>{item.subtitle}</Text>}
            </View>
          </View>
          <Switch
            value={item.value}
            onValueChange={item.onValueChange}
            trackColor={{ false: '#E5E5E7', true: '#0066FF' }}
            thumbColor="#FFFFFF"
          />
        </View>
      );
    }

    return (
      <TouchableOpacity style={styles.settingItem}>
        <View style={styles.settingItemLeft}>
          <Ionicons name={item.icon} size={24} color="#666666" />
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>{item.title}</Text>
            {item.subtitle && <Text style={styles.settingSubtitle}>{item.subtitle}</Text>}
          </View>
        </View>
        {item.type === 'link' && (
          <Ionicons name="chevron-forward" size={20} color="#CCCCCC" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {settingSections.map((section, sectionIndex) => (
          <View key={section.title} style={[styles.section, sectionIndex === 0 && styles.firstSection]}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, index) => (
                <View key={item.id}>
                  {renderSettingItem(item)}
                  {index < section.items.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 32,
  },
  firstSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999999',
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  sectionContent: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5E7',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: '#000000',
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#999999',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E5E7',
    marginLeft: 52,
  },
});