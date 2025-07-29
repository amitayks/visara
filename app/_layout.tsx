import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TabLayout from './(tabs)/_layout';
import DocumentDetailScreen from './document/[id]';

const queryClient = new QueryClient();
const Stack = createStackNavigator();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer>
            <Stack.Navigator>
              <Stack.Screen 
                name="(tabs)" 
                component={TabLayout}
                options={{ headerShown: false }} 
              />
              <Stack.Screen 
                name="document/[id]" 
                component={DocumentDetailScreen}
                options={{
                  presentation: 'modal',
                  headerTitle: 'Document',
                  headerStyle: {
                    backgroundColor: '#FAFAFA',
                  },
                  headerTintColor: '#000000',
                }} 
              />
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}