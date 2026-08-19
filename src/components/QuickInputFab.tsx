import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { font, radius, space, usePalette } from '@/theme';
import type { ParseIntent } from '@/lib/ai/contract';

/**
 * 어느 화면에서든 같은 자리에 뜨는 입력 버튼.
 * 화면당 채운 파란 버튼은 이것 하나뿐이라, 이 앱에서 가장 자주 하는 일이 무엇인지가 색으로 드러난다.
 */
export function QuickInputFab({ hint }: { hint?: Exclude<ParseIntent, 'mixed' | 'unknown'> }) {
  const p = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="문자나 사진으로 입력하기"
      onPress={() => router.push({ pathname: '/quick-input', params: hint ? { hint } : {} })}
      style={({ pressed }) => ({
        position: 'absolute',
        right: space.lg,
        bottom: insets.bottom + space.lg,
        backgroundColor: p.primaryStrong,
        borderRadius: radius.pill,
        paddingVertical: 11,
        paddingHorizontal: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      })}
    >
      <Icon name="message" size={17} color={p.onPrimary} />
      <Text style={[font.small, { color: p.onPrimary, fontWeight: '500' }]}>문자·사진 입력</Text>
    </Pressable>
  );
}
