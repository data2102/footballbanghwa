import { Pressable, StyleSheet, View } from 'react-native';
import { Txt, radius } from '@/components/ui';
import { numeric, usePalette } from '@/theme';
import type { LineupSlot, Member } from '@/lib/types';

/**
 * 세로 방향 전술판. 아래가 우리 골문, 위가 상대 골문이다.
 *
 * 잔디 초록을 쓰지 않는다. 디자인 시스템이 "색은 신호지 장식이 아니다"를 못 박고 있어서,
 * 필드를 무채색으로 두면 화면에 남는 유일한 색이 "지금 고른 자리"가 된다.
 * 햇빛 아래에서 흘끗 봐도 어디를 만지는 중인지 보이는 쪽이 실제로 더 쓸모 있다.
 */
export function Pitch({
  slots,
  members,
  selectedKey,
  onSelectSlot,
}: {
  slots: LineupSlot[];
  members: Map<string, Member>;
  selectedKey: string | null;
  onSelectSlot: (key: string) => void;
}) {
  const p = usePalette();
  const line = { borderColor: p.borderStrong, borderWidth: StyleSheet.hairlineWidth * 2 };

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 0.74,
        backgroundColor: p.surfaceAlt,
        borderColor: p.border,
        borderWidth: 1,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    >
      {/* 터치라인 */}
      <View style={[styles.outline, line, { borderRadius: 3 }]} />
      {/* 하프라인 */}
      <View style={[styles.half, { backgroundColor: p.borderStrong }]} />
      {/* 센터서클 */}
      <View style={[styles.circle, line, { borderRadius: 999 }]} />
      {/* 양 골문 페널티 박스 */}
      <View style={[styles.boxTop, line]} />
      <View style={[styles.boxBottom, line]} />

      {slots.map((slot) => {
        const member = slot.memberId ? members.get(slot.memberId) : undefined;
        const selected = slot.key === selectedKey;
        return (
          <Pressable
            key={slot.key}
            onPress={() => onSelectSlot(slot.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${slot.key} ${member?.name ?? '빈 자리'}`}
            style={{
              position: 'absolute',
              // y=1 이 상대 골문이라 화면 좌표와 반대다.
              left: `${slot.x * 100}%`,
              top: `${(1 - slot.y) * 100}%`,
              transform: [{ translateX: -26 }, { translateY: -24 }],
              alignItems: 'center',
              width: 52,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: selected ? p.primarySoft : member ? p.surface : 'transparent',
                borderWidth: selected ? 2 : 1.5,
                borderColor: selected ? p.primary : p.borderStrong,
                borderStyle: member ? 'solid' : 'dashed',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt
                variant="tiny"
                tabular={Boolean(member?.backNumber)}
                color={selected ? p.primaryStrong : member ? p.textMuted : p.textDisabled}
              >
                {member ? (member.backNumber ?? slot.key) : slot.key}
              </Txt>
            </View>
            <Txt variant="tiny" muted numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
              {member?.name ?? ''}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  outline: { position: 'absolute', left: '4%', right: '4%', top: '3%', bottom: '3%' },
  half: { position: 'absolute', left: '4%', right: '4%', top: '50%', height: 1 },
  // 필드가 aspectRatio 0.74 라서, 세로 %를 그대로 쓰면 타원이 된다.
  // 지름 = 가로 32% => 세로로는 32% * 0.74 = 23.7%.
  circle: { position: 'absolute', left: '34%', right: '34%', top: '38.2%', bottom: '38.2%' },
  boxTop: { position: 'absolute', left: '25%', right: '25%', top: '3%', height: '11%' },
  boxBottom: { position: 'absolute', left: '25%', right: '25%', bottom: '3%', height: '11%' },
});
