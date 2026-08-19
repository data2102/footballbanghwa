import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Icon, type IconName } from '@/components/icons';
import { usePalette } from '@/theme';

function tabIcon(name: IconName) {
  return ({ color }: { color: ColorValue }) => <Icon name={name} size={22} color={String(color)} />;
}

export default function TabsLayout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        // 탭 라벨은 글자를 얹으므로 진한 액센트를 쓴다.
        tabBarActiveTintColor: p.primaryStrong,
        tabBarInactiveTintColor: p.textFaint,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.border },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '500' },
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
