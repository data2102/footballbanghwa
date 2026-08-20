import { useMemo, useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { allProfiles, type MemberProfile } from '@/lib/selectors';
import { wonShort } from '@/lib/format';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  Empty,
  Hero,
  Row,
  Screen,
  Segmented,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { Icon } from '@/components/icons';
import { usePalette } from '@/theme';
import type { PositionGroup } from '@/lib/types';

type Sort = 'name' | 'rate' | 'unpaid';

const POSITIONS: (PositionGroup | 'ALL')[] = ['ALL', 'GK', 'DF', 'MF', 'FW'];

export default function MembersScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<PositionGroup | 'ALL'>('ALL');
  const [sort, setSort] = useState<Sort>('rate');
  /**
   * 정리 모드. 평소에는 회원을 눌러 상세로 들어가고, 이 모드에서는 눌러서 고른다.
   * 한 명씩 지우는 화면만 두면 열 명 정리할 때 스무 번 왕복해야 한다.
   */
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const removeMember = useStore((state) => state.removeMember);

  const profiles = useMemo(() => (data ? allProfiles(data) : []), [data]);

  if (!data) return null;

  const filtered = profiles
    // 여러 자리를 보는 사람은 그 자리 어느 쪽으로 걸러도 나온다.
    .filter((profile) => position === 'ALL' || profile.member.positions.includes(position))
    .filter((profile) => {
      if (!query.trim()) return true;
      const needle = query.trim();
      return (
        profile.member.name.includes(needle) ||
        profile.member.strengths.some((tag) => tag.includes(needle)) ||
        String(profile.member.backNumber ?? '') === needle
      );
    })
    .sort((a, b) => {
      if (sort === 'name') return a.member.name.localeCompare(b.member.name, 'ko');
      if (sort === 'unpaid') return b.outstanding - a.outstanding || a.member.name.localeCompare(b.member.name, 'ko');
      return (b.rate ?? -1) - (a.rate ?? -1);
    });

  const rated = profiles.filter((profile) => profile.rate !== null);
  const teamRate = rated.length
    ? Math.round((rated.reduce((sum, profile) => sum + (profile.rate ?? 0), 0) / rated.length) * 100)
    : null;
  const unpaidCount = profiles.filter((profile) => profile.outstanding > 0).length;

  return (
    <Screen>
      <Card>
        <Hero
          label="팀 평균 출석률"
          value={teamRate === null ? '-' : `${teamRate}%`}
          suffix={teamRate === null ? undefined : `· ${profiles.length}명`}
          caption={
            unpaidCount
              ? `이번 달 회비는 ${unpaidCount}명이 아직이에요`
              : '이번 달 회비는 다 걷혔어요'
          }
        />
      </Card>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          backgroundColor: p.surface,
          borderColor: p.borderStrong,
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingHorizontal: space.md,
        }}
      >
        <Icon name="search" size={17} color={p.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="이름, 등번호, 장점으로 찾기"
          placeholderTextColor={p.textFaint}
          style={{ flex: 1, paddingVertical: space.md, color: p.text, fontSize: 15 }}
        />
      </View>

      <Row gap={space.sm} wrap>
        {POSITIONS.map((item) => (
          <Chip
            key={item}
            label={item === 'ALL' ? '전체' : item}
            selected={position === item}
            onPress={() => setPosition(item)}
          />
        ))}
      </Row>

      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { value: 'rate', label: '출석률 순' },
          { value: 'unpaid', label: '미납 순' },
          { value: 'name', label: '이름 순' },
        ]}
      />

      <Card style={{ padding: space.sm, gap: 0 }}>
        {filtered.length === 0 ? (
          <Empty text="찾는 회원이 없어요." />
        ) : (
          filtered.map((profile, index) => (
            <View key={profile.member.id}>
              {index > 0 ? <Divider /> : null}
              <MemberRow
                profile={profile}
                picking={picking}
                picked={picked.has(profile.member.id)}
                onPress={() => {
                  if (!picking) {
                    router.push(`/member/${profile.member.id}`);
                    return;
                  }
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(profile.member.id)) next.delete(profile.member.id);
                    else next.add(profile.member.id);
                    return next;
                  });
                }}
              />
            </View>
          ))
        )}
      </Card>

      {picking ? (
        <>
          <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
            지운 회원은 명단에서 사라지지만 지난 기록은 그대로 남아요.
          </Txt>
          <Row gap={space.sm}>
            <Button
              label="그만두기"
              tone="neutral"
              style={{ flex: 1 }}
              onPress={() => {
                setPicking(false);
                setPicked(new Set());
              }}
            />
            <Button
              label={picked.size ? `${picked.size}명 지우기` : '지울 회원 고르기'}
              tone="danger"
              style={{ flex: 1 }}
              disabled={picked.size === 0}
              onPress={async () => {
                for (const id of picked) await removeMember(id);
                setPicked(new Set());
                setPicking(false);
              }}
            />
          </Row>
        </>
      ) : (
        <Row gap={space.sm}>
          <Button
            label="회원 추가하기"
            icon="plus"
            tone="neutral"
            style={{ flex: 1 }}
            onPress={() => router.push('/settings')}
          />
          <Button
            label="정리하기"
            icon="trash"
            tone="neutral"
            style={{ flex: 1 }}
            onPress={() => setPicking(true)}
          />
        </Row>
      )}
    </Screen>
  );
}

function MemberRow({
  profile,
  onPress,
  picking,
  picked,
}: {
  profile: MemberProfile;
  onPress: () => void;
  picking: boolean;
  picked: boolean;
}) {
  const p = usePalette();
  const { member, rate, outstanding } = profile;
  // 출석률은 낮을 때만 색이 붙는다. 잘 나오는 사람에게까지 색을 쓰면 신호가 죽는다.
  const rateTone = rate === null ? p.textFaint : rate < 0.5 ? p.danger : rate < 0.75 ? p.warn : p.text;

  return (
    <Row
      justify="space-between"
      gap={space.md}
      style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}
    >
      <Row gap={space.md} style={{ flex: 1, minWidth: 0 }}>
        {picking ? <Checkbox checked={picked} onToggle={onPress} /> : null}
        {member.photoUri ? (
          <Image
            source={{ uri: member.photoUri }}
            style={{ width: 36, height: 36, borderRadius: 18 }}
            accessibilityLabel={`${member.name} 프로필 사진`}
          />
        ) : (
          <Avatar name={member.name} size={36} />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row gap={space.xs}>
            <Txt variant="h3">{member.name}</Txt>
            {member.positions.length || member.backNumber != null ? (
              <Txt variant="tiny" muted>
                {member.positions.join('·')}
                {member.backNumber != null
                  ? `${member.positions.length ? ' · ' : ''}${member.backNumber}번`
                  : ''}
              </Txt>
            ) : null}
          </Row>
          <Txt variant="tiny" muted numberOfLines={1}>
            {member.strengths.length ? member.strengths.join(' · ') : '장점을 아직 안 적었어요'}
          </Txt>
        </View>
      </Row>

      <Row gap={space.sm}>
        <View style={{ alignItems: 'flex-end', gap: 2, minWidth: 52 }}>
          <Txt variant="h3" tabular color={rateTone}>
            {rate === null ? '-' : `${Math.round(rate * 100)}%`}
          </Txt>
          {outstanding > 0 ? (
            <Txt variant="tiny" color={p.danger} tabular>
              -{wonShort(outstanding)}
            </Txt>
          ) : (
            <Txt variant="tiny" muted>
              완납
            </Txt>
          )}
        </View>
        {picking ? null : <Chip label="열기" onPress={onPress} />}
      </Row>
    </Row>
  );
}

