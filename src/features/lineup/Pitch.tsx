import { Pressable, View } from 'react-native';
import { Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';
import type { LineupSlot, Member } from '@/lib/types';

const PITCH_GREEN = '#1B7A54';
const LINE = 'rgba(255,255,255,0.45)';

/**
 * 세로 방향 필드. 아래가 우리 골문, 위가 상대 골문이다.
 * 슬롯은 x/y 상대좌표(0~1)로만 배치해서 화면 폭에 상관없이 같은 모양이 나온다.
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

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 0.72,
        backgroundColor: PITCH_GREEN,
        borderRadius: radius.lg,
        overflow: 'hidden',
      }}
    >
      {/* 필드 라인 */}
      <View
        style={{
          position: 'absolute',
          left: '4%',
          right: '4%',
          top: '3%',
          bottom: '3%',
          borderWidth: 2,
          borderColor: LINE,
          borderRadius: 4,
        }}
      />
      <View style={{ position: 'absolute', left: '4%', right: '4%', top: '50%', height: 2, backgroundColor: LINE }} />
      <View
        style={{
          position: 'absolute',
          left: '32%',
          right: '32%',
          top: '39%',
          bottom: '39%',
          borderWidth: 2,
          borderColor: LINE,
          borderRadius: 999,
        }}
      />
      {/* 양 골문 페널티 박스 */}
      <View style={{ position: 'absolute', left: '25%', right: '25%', top: '3%', height: '13%', borderWidth: 2, borderColor: LINE }} />
      <View style={{ position: 'absolute', left: '25%', right: '25%', bottom: '3%', height: '13%', borderWidth: 2, borderColor: LINE }} />

      {slots.map((slot) => {
        const member = slot.memberId ? members.get(slot.memberId) : undefined;
        const selected = slot.key === selectedKey;
        return (
          <Pressable
            key={slot.key}
            onPress={() => onSelectSlot(slot.key)}
            accessibilityLabel={`${slot.key} ${member?.name ?? '빈 자리'}`}
            style={{
              position: 'absolute',
              // y=1이 상대 골문이므로 위쪽. 화면 좌표는 반대라 뒤집는다.
              left: `${slot.x * 100}%`,
              top: `${(1 - slot.y) * 100}%`,
              transform: [{ translateX: -26 }, { translateY: -26 }],
              alignItems: 'center',
              width: 52,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: member ? p.surface : 'rgba(255,255,255,0.18)',
                borderWidth: selected ? 3 : 2,
                borderColor: selected ? '#FFD43B' : 'rgba(255,255,255,0.8)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt variant="tiny" color={member ? p.text : 'rgba(255,255,255,0.9)'}>
                {member ? (member.backNumber ?? slot.key) : slot.key}
              </Txt>
            </View>
            <Txt
              variant="tiny"
              color="#FFFFFF"
              numberOfLines={1}
              style={{ marginTop: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 }}
            >
              {member?.name ?? ''}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export const pitchSpacing = space;
