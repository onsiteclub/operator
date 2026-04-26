/**
 * Tabs Layout - OnSite Operator 2
 *
 * 3 tabs matching mockups: Requests (main), Machine, Reports
 * Operator lives on Requests 95% of the time.
 */

import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@onsite/tokens';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Bottom inset covers the Android gesture pill / 3-button nav bar.
  // Fall back to a sensible minimum so the tab bar still has breathing room
  // on devices with no inset.
  const bottomInset = insets.bottom > 0
    ? insets.bottom
    : (Platform.OS === 'android' ? 8 : 24);
  const tabBarHeight = (Platform.OS === 'android' ? 56 : 60) + bottomInset;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomInset,
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
          title: 'Invoice',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
