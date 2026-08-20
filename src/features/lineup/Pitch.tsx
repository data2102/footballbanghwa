import { Pressable, StyleSheet, View } from 'react-native';
import { Txt, radius } from '@/components/ui';
import { usePalette } from '@/theme';
import type { LineupSide, LineupSlot, Member } from '@/lib/types';

/**
 * 자체경기 전술판. 한 판에 두 팀이 같이 선다.
 *
 * 운동장 화이트보드가 그렇게 생겼다 — 판 하나에 위아래로 두 팀을 그리고 쿼터마다 지운다.
 * 팀을 하나씩 따로 보여 주면 옮겨 적는 사람이 화이트보드와 화면을 번갈아 보며
 * 머릿속에서 두 장을 합쳐야 한다. 중계 화면(네이버)도 같은 이유로 한 판에 얹는다.
 *
 * 위 팀은 자기 골문이 위쪽이라 좌표를 뒤집어 그린다. 그래야 두 팀이 서로 마주 본다.
 *
 * 잔디 초록을 쓰지 않는다. 디자인 시스템이 "색은 신호지 장식이 아니다"를 못 박고 있어서,
 * 필드를 무채색으로 두면 화면에 남는 유일한 색이 "지금 고른 자리"가 된다.
 * 햇빛 아래에서 흘끗 봐도 어디를 만지는 중인지 보이는 쪽이 실제로 더 쓸모 있다.
 */
/*
 * 자리를 판 끝까지 밀지 않는다. 골키퍼 이름이 판 밖으로 잘리고, 공격수는 가운데
 * 포메이션 띠와 겹친다. 위아래로 EDGE 만큼 띄우고 그 안(REACH)에서만 배치한다.
 * 남는 가운데(0.44~0.56)가 하프라인과 이름 띠 자리다.
 */
const EDGE = 0.06;
const REACH = 0.36;

export type PitchTeam = {
  side: LineupSide;
  slots: LineupSlot[];
  /** 가운데 띠에 적을 이름. 예: "A팀 4-3-3" */
  label: string;
};

export function Pitch({
  top,
  bottom,
  members,
  selected,
  onSelectSlot,
}: {
  top: PitchTeam;
  bottom: PitchTeam;
  members: Map<string, Member>;
  selected: { side: LineupSide; key: string } | null;
  onSelectSlot: (side: LineupSide, key: string) => void;
}) {
  const p = usePalette();
  const line = { borderColor: p.borderStrong, borderWidth: StyleSheet.hairlineWidth * 2 };

  return (
    <View
      style={{
        width: '100%',
        // 한 판에 두 팀이라 예전(0.74)보다 훨씬 길쭉하다.
        aspectRatio: 0.62,
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

      {[top, bottom].map((team) => {
        const isTop = team.side === top.side;
        return team.slots.map((slot) => {
          const member = slot.memberId ? members.get(slot.memberId) : undefined;
          const isSelected = selected?.side === team.side && selected.key === slot.key;
          /*
           * 좌표는 팀 기준이다 — y=0 이 자기 골문, y=1 이 상대 골문.
           * 위 팀은 자기 골문이 화면 위쪽이라 y 를 그대로 반으로 접고,
           * 좌우도 뒤집어야 마주 본 배치가 된다.
           */
          const left = isTop ? 1 - slot.x : slot.x;
          const topPct = isTop ? EDGE + slot.y * REACH : 1 - EDGE - slot.y * REACH;
          return (
            <Pressable
              key={`${team.side}-${slot.key}`}
              onPress={() => onSelectSlot(team.side, slot.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${team.side}팀 ${slot.key} ${member?.name ?? '빈 자리'}`}
              style={{
                position: 'absolute',
                left: `${left * 100}%`,
                top: `${topPct * 100}%`,
                transform: [{ translateX: -26 }, { translateY: -22 }],
                alignItems: 'center',
                width: 52,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isSelected ? p.primarySoft : member ? p.surface : 'transparent',
                  borderWidth: isSelected ? 2 : 1.5,
                  borderColor: isSelected ? p.primary : p.borderStrong,
                  borderStyle: member ? 'solid' : 'dashed',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt
                  variant="tiny"
                  tabular={Boolean(member?.backNumber)}
                  color={isSelected ? p.primaryStrong : member ? p.textMuted : p.textDisabled}
                >
                  {member ? (member.backNumber ?? slot.key) : slot.key}
                </Txt>
              </View>
              <Txt variant="tiny" muted numberOfLines={1} style={{ marginTop: 2, fontSize: 10 }}>
                {member?.name ?? ''}
              </Txt>
            </Pressable>
          );
        });
      })}

      {/*
        어느 쪽이 어느 팀인지는 하프라인에서 갈린다. 그 자리에 이름과 포메이션을 적어 두면
        위아래를 헷갈릴 일이 없다. 판 안에 두는 건 화이트보드도 가운데에 적기 때문이다.
      */}
      <View style={styles.band} pointerEvents="none">
        <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
          {top.label}
        </Txt>
        <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
          {bottom.label}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outline: { position: 'absolute', left: '4%', right: '4%', top: '2%', bottom: '2%' },
  half: { position: 'absolute', left: '4%', right: '4%', top: '50%', height: 1 },
  // 필드가 aspectRatio 0.62 라서, 세로 %를 그대로 쓰면 타원이 된다.
  // 지름 = 가로 26% => 세로로는 26% * 0.62 = 16.1%.
  circle: { position: 'absolute', left: '37%', right: '37%', top: '41.9%', bottom: '41.9%' },
  boxTop: { position: 'absolute', left: '25%', right: '25%', top: '2%', height: '8%' },
  boxBottom: { position: 'absolute', left: '25%', right: '25%', bottom: '2%', height: '8%' },
  // 하프라인 위아래로 한 줄씩. 센터서클과 겹치지 않게 좌우 끝에 붙인다.
  band: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    top: '44%',
    height: '12%',
    justifyContent: 'space-between',
  },
});
