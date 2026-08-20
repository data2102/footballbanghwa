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
      {/* 화이트보드로 짠 라인업을 옮겨 적는 화면이라 하는 일은 "누가 몇 쿼터 뛰었나"다. */}
      <Tabs.Screen name="lineup" options={{ title: '출전', tabBarIcon: tabIcon('field') }} />
      <Tabs.Screen name="finance" options={{ title: '회비', tabBarIcon: tabIcon('wallet') }} />
      <Tabs.Screen name="members" options={{ title: '회원', tabBarIcon: tabIcon('person') }} />
      <Tabs.Screen name="more" options={{ title: '더보기', tabBarIcon: tabIcon('menu') }} />
      {/*
        기록은 매주 여는 화면이 아니라 더보기 안으로 넣었다. 탭바는 여섯 개가 한계라
        자주 쓰는 쪽에 자리를 내준다. href: null 이면 주소는 살아 있고 탭바에만 안 나온다.
      */}
      <Tabs.Screen name="stats" options={{ title: '기록', href: null }} />
    </Tabs>
  );
}
