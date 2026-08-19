import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, usePalette } from '@/theme';
import type { ParseIntent } from '@/lib/ai/contract';

/**
 * 어느 화면에서든 같은 자리에 뜨는 "문자로 입력" 버튼.
 * 화면마다 hint를 넘겨서 AI가 무엇을 읽어야 하는지 알려준다.
 */
export function QuickInputFab({ hint }: { hint?: Exclude<ParseIntent, 'mixed' | 'unknown'> }) {
  const p = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="문자로 입력하기"
      onPress={() => router.push({ pathname: '/quick-input', params: hint ? { hint } : {} })}
      style={({ pressed }) => ({
        position: 'absolute',
        right: space.lg,
        bottom: insets.bottom + space.lg,
        backgroundColor: p.primary,
        borderRadius: radius.pill,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        opacity: pressed ? 0.85 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      })}
    >
      <Text style={{ fontSize: 16 }}>✨</Text>
      <Text style={{ color: p.onPrimary, fontWeight: '700', fontSize: 14 }}>문자로 입력</Text>
    </Pressable>
  );
}
