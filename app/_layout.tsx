import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@onsite/auth';
import { colors } from '@onsite/tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../src/lib/supabase';
import { useOperatorStore } from '../src/store/operator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 2 },
  },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider supabase={supabase as never}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <AppContent />
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const hydrate = useOperatorStore((s) => s.hydrate);

  // Hydrate persisted operator state on mount
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [loading, user, segments]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
