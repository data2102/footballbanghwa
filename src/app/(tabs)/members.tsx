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
import { QuickInputFab } from '@/components/QuickInputFab';
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

  const profiles = useMemo(() => (data ? allProfiles(data) : []), [data]);

  if (!data) return null;

  const filtered = profiles
    .filter((profile) => position === 'ALL' || profile.member.preferredPosition === position)
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
    <View style={{ flex: 1 }}>
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
                <MemberRow profile={profile} onPress={() => router.push(`/member/${profile.member.id}`)} />
              </View>
            ))
          )}
        </Card>

        <Button
          label="회원 추가하기"
          icon="plus"
          tone="neutral"
          onPress={() => router.push('/settings')}
        />
      </Screen>
      <QuickInputFab hint="profile" />
    </View>
  );
}

function MemberRow({ profile, onPress }: { profile: MemberProfile; onPress: () => void }) {
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
            {member.preferredPosition ? (
              <Txt variant="tiny" muted>
                {member.preferredPosition}
                {member.backNumber != null ? ` · ${member.backNumber}번` : ''}
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
        <Chip label="열기" onPress={onPress} />
      </Row>
    </Row>
  );
}

