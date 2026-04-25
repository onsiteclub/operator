/**
 * Tabs Layout - OnSite Operator 2
 *
 * 3 tabs matching mockups: Requests (main), Machine, Reports
 * Operator lives on Requests 95% of the time.
 */

import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@onsite/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'android' ? 64 : 84,
          paddingBottom: Platform.OS === 'android' ? 8 : 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.iconMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="machine"
        options={{
          title: 'Machine',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
