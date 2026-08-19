import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

/**
 * 경기 전날 알림을 받기 위한 기기 등록.
 *
 * 보내는 쪽은 supabase/functions/send-reminders 다. 여기서는 토큰만 넘긴다.
 * 알림을 끄고 싶으면 OS 설정에서 권한을 빼면 되고, 팀 전체는 설정 화면에서 끈다.
 */

/**
 * 앱이 떠 있을 때도 배너를 띄운다. 조기축구 알림은 놓치면 의미가 없다.
 *
 * Expo Go 는 SDK 53 부터 알림 기능을 뺐다(안드로이드는 아예 없다).
 * 이 호출은 모듈을 불러오는 순간 실행되므로, 여기서 터지면 앱이 시작조차 못 한다.
 * 알림은 없어도 되는 기능이라 실패를 삼킨다.
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Expo Go 등 알림을 지원하지 않는 환경.
}

/** 안드로이드는 채널이 없으면 알림이 조용히 사라진다. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: '경기 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3182F6',
  });
}

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  );
}

/**
 * 권한을 묻고 Expo 푸시 토큰을 받아 저장한다.
 * 조용히 실패해도 되는 기능이라, 안 되는 이유를 돌려주고 앱 흐름은 막지 않는다.
 */
export async function registerForReminders(): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: '데모 모드에서는 알림을 보내지 않아요.' };
  // 웹 푸시는 서비스워커와 VAPID 키가 따로 필요하다. 지금은 네이티브만 받는다.
  if (Platform.OS === 'web') return { ok: false, reason: '알림은 앱에서만 받을 수 있어요.' };
  if (!Device.isDevice) return { ok: false, reason: '시뮬레이터에서는 푸시 토큰이 나오지 않아요.' };

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  const granted =
    existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { ok: false, reason: '알림 권한이 꺼져 있어요. 설정에서 켜주세요.' };

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    token = result.data;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : '푸시 토큰을 받지 못했어요.',
    };
  }

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { ok: false, reason: '로그인이 필요해요.' };

  const { error } = await supabase.from('push_tokens').upsert(
    { token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
    { onConflict: 'token' },
  );
  if (error) return { ok: false, reason: error.message };

  return { ok: true };
}

/** 이 기기에서만 알림을 끊는다. 팀 전체를 끄는 건 설정 화면의 스위치다. */
export async function unregisterFromReminders(): Promise<void> {
  if (!supabase || Platform.OS === 'web' || !Device.isDevice) return;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await supabase.from('push_tokens').delete().eq('token', data);
  } catch {
    // 토큰을 못 받으면 지울 것도 없다.
  }
}

/** 알림을 눌렀을 때 어디로 보낼지. 지금은 참석 화면 하나뿐이다. */
export function routeFromNotification(
  response: Notifications.NotificationResponse,
): '/attendance' | null {
  const data = response.notification.request.content.data as { screen?: string } | undefined;
  return data?.screen === 'attendance' ? '/attendance' : null;
}

/**
 * 알림 탭을 듣는다. 지원하지 않는 환경에서는 아무것도 하지 않는 해제 함수를 돌려준다.
 * 화면 쪽에서 매번 try/catch 를 쓰지 않게 여기서 감싼다.
 */
export function onNotificationTap(handler: (path: '/attendance') => void): () => void {
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = routeFromNotification(response);
      if (path) handler(path);
    });
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

export { Notifications };
