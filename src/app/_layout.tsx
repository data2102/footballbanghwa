import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from '@/lib/store';
import { AuthGate } from '@/features/auth/AuthGate';
import { TeamGate } from '@/features/auth/TeamGate';
import { Button, Txt, space } from '@/components/ui';
import { usePalette } from '@/theme';

export default function RootLayout() {
  const p = usePalette();
  const status = useStore((state) => state.status);
  const error = useStore((state) => state.error);
  const load = useStore((state) => state.load);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {status === 'signed-out' ? (
          <AuthGate />
        ) : status === 'no-team' ? (
          <TeamGate />
        ) : status === 'ready' ? (
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: p.bg },
              headerTitleStyle: { color: p.text },
              headerTintColor: p.primary,
              contentStyle: { backgroundColor: p.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="quick-input"
              options={{ presentation: 'modal', title: '문자·사진으로 입력하기' }}
            />
            <Stack.Screen name="settings" options={{ title: '팀 설정' }} />
            <Stack.Screen name="member/[id]" options={{ title: '회원' }} />
          </Stack>
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: p.bg,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.md,
              padding: space.xl,
            }}
          >
            {status === 'error' ? (
              <>
                <Txt variant="h2">데이터를 불러오지 못했어요</Txt>
                <Txt variant="small" muted style={{ textAlign: 'center' }}>
                  {error}
                </Txt>
                <Button label="다시 시도하기" onPress={load} />
              </>
            ) : (
              <ActivityIndicator color={p.primary} size="large" />
            )}
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
