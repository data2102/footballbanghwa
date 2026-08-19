import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { usePalette } from '@/theme';

/** 아이콘은 이모지로 둔다. 아이콘 폰트 의존성 없이 웹/네이티브에서 똑같이 보인다. */
function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ fontSize: 20, color, lineHeight: 24 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: p.primary,
        tabBarInactiveTintColor: p.textMuted,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: p.bg },
        headerTitleStyle: { color: p.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '오늘', tabBarIcon: icon('🏟️') }} />
      <Tabs.Screen name="attendance" options={{ title: '참석', tabBarIcon: icon('🙋') }} />
      <Tabs.Screen name="lineup" options={{ title: '라인업', tabBarIcon: icon('⚽') }} />
      <Tabs.Screen name="finance" options={{ title: '회비', tabBarIcon: icon('💰') }} />
      <Tabs.Screen name="stats" options={{ title: '기록', tabBarIcon: icon('📊') }} />
    </Tabs>
  );
}
