import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import ChatScreen from './index';
import DocumentsScreen from './documents';
import SettingsScreen from './settings';
import TestScreen from './test';
import OCRTestScreen from './ocrtest';

const Tab = createBottomTabNavigator();

export default function TabLayout() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#0066FF',
        tabBarInactiveTintColor: '#666666',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E5E7',
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: '#FAFAFA',
        },
        headerTintColor: '#000000',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="index"
        component={ChatScreen}
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <Icon name="chatbubble-outline" size={size} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="documents"
        component={DocumentsScreen}
        options={{
          title: 'Documents',
          tabBarIcon: ({ color, size }) => (
            <Icon name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Icon name="settings-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="test"
        component={TestScreen}
        options={{
          title: 'Test OCR',
          tabBarIcon: ({ color, size }) => (
            <Icon name="flask-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ocrtest"
        component={OCRTestScreen}
        options={{
          title: 'OCR Compare',
          tabBarIcon: ({ color, size }) => (
            <Icon name="git-compare-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}