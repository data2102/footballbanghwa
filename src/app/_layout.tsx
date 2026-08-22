import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from '@/lib/store';
import { onNotificationTap, registerForReminders } from '@/lib/notifications';
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
  const clearError = useStore((state) => state.clearError);
  const watchAuth = useStore((state) => state.watchAuth);
  const registered = useRef(false);
  const segments = useSegments();

  /**
   * 참석 링크는 로그인 문을 지나지 않는다.
   * 링크를 누르는 사람은 팀원이지 이 앱의 사용자가 아니라서, 여기서 로그인을 요구하면
   * 링크를 만든 이유가 없어진다. 이 화면은 자기 데이터를 따로 읽는다(src/lib/vote.ts).
   */
  const isPublicRoute = segments[0] === 'vote';

  useEffect(() => {
    load();
  }, [load]);

  // 메일 링크로 로그인하고 돌아오는 경로. 세션이 늦게 잡혀도 화면이 따라간다.
  useEffect(() => watchAuth(), [watchAuth]);

  // 로그인하고 팀까지 붙은 뒤에 기기를 등록한다. 실패해도 앱은 그대로 쓴다.
  useEffect(() => {
    if (status !== 'ready' || registered.current) return;
    registered.current = true;
    // Expo Go 에는 원격 푸시가 없어서 여기서 실패한다. 알림은 없어도 되는 기능이라 조용히 넘긴다.
    registerForReminders().catch(() => {});
  }, [status]);

  // 알림을 눌러서 앱이 열렸을 때 해당 화면으로 보낸다.
  useEffect(() => onNotificationTap((path) => router.push(path)), [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {/*
          저장 실패는 반드시 눈에 띄어야 한다. 낙관적 갱신이라 화면은 이미 바뀐 뒤여서,
          안 띄우면 총무는 저장된 줄 알고 앱을 닫고 다음에 열면 사라져 있다.
          불러오기 실패(status === 'error')는 아래 큰 화면이 따로 맡는다.
        */}
        {error && status === 'ready' ? <SaveError message={error} onClose={clearError} /> : null}
        {isPublicRoute ? (
          <PublicStack palette={p} />
        ) : status === 'signed-out' ? (
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
            <Stack.Screen
              name="attendance-photo"
              options={{ presentation: 'modal', title: '투표 사진 올리기' }}
            />
            <Stack.Screen
              name="lineup-photo"
              options={{ presentation: 'modal', title: '화이트보드 올리기' }}
            />
            <Stack.Screen name="settings" options={{ title: '팀 설정' }} />
            <Stack.Screen name="member/[id]" options={{ title: '회원' }} />
            <Stack.Screen name="analysis" options={{ title: '출결 분석' }} />
            <Stack.Screen name="rules" options={{ title: '회칙' }} />
            <Stack.Screen name="inventory" options={{ title: '물품 재고' }} />
            <Stack.Screen name="notice" options={{ title: '공지 만들기' }} />
            <Stack.Screen name="templates" options={{ title: '문구 보관함' }} />
            <Stack.Screen name="vote" options={{ title: '참석 확인하기' }} />
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

/** 저장이 실패했을 때 화면 위에 붙는 띠. 누르면 닫힌다. */
function SaveError({ message, onClose }: { message: string; onClose: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="저장 실패 안내 닫기"
      onPress={onClose}
      style={{ backgroundColor: p.dangerSoft, paddingHorizontal: space.lg, paddingVertical: space.md }}
    >
      <Txt variant="small" color={p.danger}>
        저장하지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.
      </Txt>
      <Txt variant="tiny" color={p.danger} numberOfLines={2}>
        {message}
      </Txt>
    </Pressable>
  );
}

/** 로그인 없이 열리는 화면만 담는 스택. */
function PublicStack({ palette }: { palette: ReturnType<typeof usePalette> }) {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg },
        headerTitleStyle: { color: palette.text },
        headerTintColor: palette.primary,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Screen name="vote" options={{ title: '참석 확인하기' }} />
    </Stack>
  );
}
