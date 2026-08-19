import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { space, usePalette } from '@/theme';

function tabIcon(name: IconName) {
  return ({ color }: { color: ColorValue }) => <Icon name={name} size={22} color={String(color)} />;
}

/**
 * 탭바 높이를 직접 잡는 이유가 두 가지다.
 *
 * 1. 기본값(49)이 한글 라벨에 모자란다. 10.5px 글자에 줄높이가 10px 로 잡혀서
 *    받침 있는 글자("참석", "기록")의 아래가 깎였다.
 * 2. 아래쪽 안전영역(홈 인디케이터·제스처 바)만큼 띄워야 한다. 기본 탭바는
 *    화면 맨 아래에 딱 붙어서, 폰에서는 시스템 바가 라벨을 덮는다.
 */
const BAR_CONTENT_HEIGHT = 56;

export default function TabsLayout() {
  const p = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        // 탭 라벨은 글자를 얹으므로 진한 액센트를 쓴다.
        tabBarActiveTintColor: p.primaryStrong,
        tabBarInactiveTintColor: p.textFaint,
        tabBarStyle: {
          backgroundColor: p.surface,
          borderTopColor: p.border,
          height: BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: space.xs,
          paddingBottom: space.xs + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
        tabBarIconStyle: { height: 22 },
        headerStyle: { backgroundColor: p.bg },
        headerTitleStyle: { color: p.text, fontSize: 18, fontWeight: '500' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '오늘', tabBarIcon: tabIcon('calendar') }} />
      <Tabs.Screen name="attendance" options={{ title: '참석', tabBarIcon: tabIcon('users') }} />
      <Tabs.Screen name="lineup" options={{ title: '라인업', tabBarIcon: tabIcon('field') }} />
      <Tabs.Screen name="finance" options={{ title: '회비', tabBarIcon: tabIcon('wallet') }} />
      <Tabs.Screen name="members" options={{ title: '회원', tabBarIcon: tabIcon('person') }} />
      <Tabs.Screen name="stats" options={{ title: '기록', tabBarIcon: tabIcon('chart') }} />
    </Tabs>
  );
}
