import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from '@/lib/store';
import { Notifications, registerForReminders, routeFromNotification } from '@/lib/notifications';
import { AuthGate } from '@/features/auth/AuthGate';
import { TeamGate } from '@/features/auth/TeamGate';
import { Button, Txt, space } from '@/components/ui';
import { usePalette } from '@/theme';

export default function RootLayout() {
  const p = usePalette();
  const router = useRouter();
  const status = useStore((state) => state.status);
  const error = useStore((state) => state.error);
  const load = useStore((state) => state.load);
  const registered = useRef(false);

  useEffect(() => {
    load();
  }, [load]);

  // 로그인하고 팀까지 붙은 뒤에 기기를 등록한다. 실패해도 앱은 그대로 쓴다.
  useEffect(() => {
    if (status !== 'ready' || registered.current) return;
    registered.current = true;
    registerForReminders();
  }, [status]);

  // 알림을 눌러서 앱이 열렸을 때 해당 화면으로 보낸다.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = routeFromNotification(response);
      if (path) router.push(path);
    });
    return () => subscription.remove();
  }, [router]);

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
