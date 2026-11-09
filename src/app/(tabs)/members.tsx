import { useMemo, useState } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';
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
  SectionHeader,
  Segmented,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { Icon } from '@/components/icons';
import { usePalette } from '@/theme';
import { shareMessage, shareText } from '@/lib/share';
import {
  UNIFORM_LABEL,
  ageLabel,
  duplicateNumbers,
  groupByAge,
  normalizeSize,
  sizeSummaryText,
  sizeTable,
  uniformState,
  type UniformState,
} from '@/features/members/roster';
import type { AgeBand, Member, PositionGroup } from '@/lib/types';

type Sort = 'name' | 'rate' | 'age';

/**
 * 회원 탭의 세 메뉴. 총무 엑셀(풀리스트)이 하는 일을 그대로 나눴다 —
 * 전체를 훑을 때, 나이대로 쿼터를 나눌 때, 유니폼을 맞출 때 보는 표가 다르다.
 */
type MenuKey = 'full' | 'age' | 'uniform';

const MENU: { value: MenuKey; label: string }[] = [
  { value: 'full', label: '풀명단' },
  { value: 'age', label: '연령대별' },
  { value: 'uniform', label: '유니폼 현황' },
];

export default function MembersScreen() {
  const data = useStore((state) => state.data);
  const [menu, setMenu] = useState<MenuKey>('full');
  const members = useMemo(() => (data ? data.members.filter((member) => member.active) : []), [data]);

  if (!data) return null;

  return (
    <Screen>
      <Segmented value={menu} onChange={setMenu} options={MENU} />
      {menu === 'full' ? <FullRoster /> : null}
      {menu === 'age' ? <AgeRoster members={members} /> : null}
      {menu === 'uniform' ? <UniformStatus members={members} teamName={data.team.name} /> : null}
    </Screen>
  );
}

const POSITIONS: (PositionGroup | 'ALL')[] = ['ALL', 'GK', 'DF', 'MF', 'FW'];

function FullRoster() {
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
      if (sort === 'age') {
        /*
         * 나이 많은 쪽부터. 조기축구는 60대가 몇 명인지가 먼저 궁금하고,
         * 쿼터를 나눌 때도 위에서부터 본다. 연령대를 안 적은 사람은 맨 뒤로 보낸다 —
         * 가운데 섞이면 "이 사람은 몇 대지" 하고 매번 멈추게 된다.
         */
        const rank = (band: AgeBand | null) => (band ? Number(band) : -1);
        return (
          rank(b.member.ageBand) - rank(a.member.ageBand) ||
          a.member.name.localeCompare(b.member.name, 'ko')
        );
      }
      return (b.rate ?? -1) - (a.rate ?? -1);
    });

  const rated = profiles.filter((profile) => profile.rate !== null);
  const teamRate = rated.length
    ? Math.round((rated.reduce((sum, profile) => sum + (profile.rate ?? 0), 0) / rated.length) * 100)
    : null;
  const unpaidCount = profiles.filter((profile) => profile.outstanding > 0).length;

  return (
    <>
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
          { value: 'age', label: '연령대 순' },
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
    </>
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
            {/*
              연령대를 이름 옆에 붙인다. 연령대 순으로 정렬해 놓고 화면에 안 보이면
              무슨 기준으로 줄 선 건지 알 수가 없다. 조기축구는 나이대가 실제 정보다.
            */}
            {member.ageBand ? (
              <Txt variant="tiny" muted>
                {ageLabel(member.ageBand, member.ageHalf)}
              </Txt>
            ) : null}
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


// ------------------------------------------------------------ 연령대별 명단

/**
 * 연령대 → 후반·초반 순으로 묶는다. 쿼터를 나눌 때 "60대 후반이 몇 분 오셨나"를 먼저 본다.
 * 한 칸에 세 명씩 놓는다 — 아흔 명을 한 줄씩 늘어놓으면 50대에 닿기 전에 손가락이 지친다.
 */
function AgeRoster({ members }: { members: Member[] }) {
  const groups = useMemo(() => groupByAge(members), [members]);

  if (members.length === 0) {
    return (
      <Card>
        <Empty text="첫 회원을 추가해 보세요." />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Hero
          label="연령대별 회원"
          value={`${members.length}명`}
          caption={groups.map((group) => `${ageLabel(group.band)} ${group.total}`).join(' · ')}
        />
      </Card>

      {groups.map((group) => (
        <View key={group.band ?? 'none'} style={{ gap: space.sm }}>
          <SectionHeader title={`${ageLabel(group.band)} · ${group.total}명`} />
          <Card style={{ gap: space.md }}>
            {group.halves.map((row, index) => (
              <View key={row.half ?? 'none'} style={{ gap: space.sm }}>
                {index > 0 ? <Divider /> : null}
                {/* 한 칸짜리 연령대(전부 구분 없음)면 소제목이 군더더기라 뺀다. */}
                {group.halves.length > 1 || row.half ? (
                  <Txt variant="tiny" muted>
                    {`${row.half ? ageLabel(group.band, row.half) : '초반·후반 모름'} ${row.members.length}명`}
                  </Txt>
                ) : null}
                <MemberGrid members={row.members} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

function MemberGrid({ members }: { members: Member[] }) {
  const p = usePalette();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs }}>
      {members.map((member) => (
        <View key={member.id} style={{ width: '33.333%', padding: space.xs }}>
          <Pressable
            onPress={() => router.push(`/member/${member.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${member.name} 열기`}
            style={({ pressed }) => ({
              backgroundColor: pressed ? p.border : p.surfaceAlt,
              borderRadius: radius.sm,
              paddingVertical: space.sm,
              paddingHorizontal: space.sm,
              gap: 2,
              minHeight: 48,
            })}
          >
            <Txt variant="small" numberOfLines={1} style={{ fontWeight: '600' }}>
              {member.name}
            </Txt>
            <Txt variant="tiny" muted numberOfLines={1}>
              {[
                member.backNumber != null ? `${member.backNumber}번` : null,
                member.positions[0] ?? null,
              ]
                .filter(Boolean)
                .join(' · ') || '-'}
            </Txt>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------ 유니폼 현황

const UNIFORM_FILTERS: { value: UniformState | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '미지급' },
  { value: 'unknown', label: '모름' },
  { value: 'issued', label: '받음' },
];

/**
 * 유니폼을 맞추고 나눠 줄 때 총무가 보는 표.
 * 제일 알고 싶은 건 "아직 못 받은 사람이 몇 명인가"라 그걸 키운다.
 * 사이즈 집계는 업체에 그대로 보낼 수 있게 글로 내보낸다.
 */
function UniformStatus({ members, teamName }: { members: Member[]; teamName: string }) {
  const p = usePalette();
  const router = useRouter();
  const [filter, setFilter] = useState<UniformState | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);

  const table = useMemo(() => sizeTable(members), [members]);
  const dupes = useMemo(() => duplicateNumbers(members), [members]);
  const counts = useMemo(() => {
    const result: Record<UniformState, number> = { issued: 0, pending: 0, unknown: 0 };
    for (const member of members) result[uniformState(member)] += 1;
    return result;
  }, [members]);

  // 번호 순. 유니폼은 번호로 찾는다. 번호 없는 사람은 맨 뒤에 이름 순으로.
  const list = members
    .filter((member) => filter === 'all' || uniformState(member) === filter)
    .sort(
      (a, b) =>
        (a.backNumber ?? Number.MAX_SAFE_INTEGER) - (b.backNumber ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name, 'ko'),
    );

  const stateTone: Record<UniformState, string> = {
    issued: p.textMuted,
    pending: p.danger,
    unknown: p.warn,
  };

  return (
    <>
      <Card>
        <Hero
          label="유니폼 미지급"
          value={`${counts.pending}명`}
          tone={counts.pending ? p.danger : undefined}
          caption={`받음 ${counts.issued} · 모름 ${counts.unknown} · 전체 ${members.length}명`}
        />
      </Card>

      <SectionHeader title="사이즈 집계" />
      <Card style={{ gap: 0, paddingVertical: space.sm }}>
        <SizeLine size="사이즈" top="상의" bottom="하의" header />
        {table.rows.map((row) => (
          <View key={row.size}>
            <Divider />
            <SizeLine size={row.size} top={String(row.top)} bottom={String(row.bottom)} />
          </View>
        ))}
        {table.unknownTop || table.unknownBottom ? (
          <View>
            <Divider />
            <SizeLine
              size="모름"
              top={String(table.unknownTop)}
              bottom={String(table.unknownBottom)}
              muted
            />
          </View>
        ) : null}
      </Card>
      <Button
        label="사이즈 집계 공유하기"
        icon="message"
        tone="neutral"
        onPress={async () => {
          const outcome = await shareText(sizeSummaryText(teamName, members), '유니폼 사이즈 집계');
          setNotice(shareMessage(outcome));
        }}
      />
      {notice ? (
        <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
          {notice}
        </Txt>
      ) : null}

      {dupes.length ? (
        <>
          <SectionHeader title="등번호가 겹쳐요" />
          <Card style={{ gap: space.sm }}>
            {dupes.map((dupe) => (
              <Row key={dupe.number} gap={space.md} align="flex-start">
                <Txt variant="h3" tabular style={{ minWidth: 40 }}>
                  {`${dupe.number}번`}
                </Txt>
                <Txt variant="small" style={{ flex: 1 }}>
                  {dupe.members.map((member) => member.name).join(', ')}
                </Txt>
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="회원별 현황" />
      <Row gap={space.sm} wrap>
        {UNIFORM_FILTERS.map((item) => (
          <Chip
            key={item.value}
            label={`${item.label} ${item.value === 'all' ? members.length : counts[item.value]}`}
            selected={filter === item.value}
            onPress={() => setFilter(item.value)}
          />
        ))}
      </Row>
      <Card style={{ padding: space.sm, gap: 0 }}>
        {list.length === 0 ? (
          <Empty text="여기에 해당하는 회원이 없어요." />
        ) : (
          list.map((member, index) => {
            const state = uniformState(member);
            const top = normalizeSize(member.topSize);
            const bottom = normalizeSize(member.bottomSize);
            return (
              <View key={member.id}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => router.push(`/member/${member.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${member.name} 열기`}
                >
                  <Row
                    gap={space.md}
                    style={{ paddingVertical: space.sm, paddingHorizontal: space.sm, minHeight: 44 }}
                  >
                    <Txt variant="h3" tabular muted={member.backNumber == null} style={{ width: 36 }}>
                      {member.backNumber == null ? '-' : String(member.backNumber)}
                    </Txt>
                    <Txt variant="h3" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                      {member.name}
                    </Txt>
                    <Txt variant="small" tabular muted={!top && !bottom}>
                      {top || bottom ? `${top ?? '?'} / ${bottom ?? '?'}` : '사이즈 모름'}
                    </Txt>
                    <Txt variant="tiny" color={stateTone[state]} style={{ width: 40, textAlign: 'right' }}>
                      {UNIFORM_LABEL[state]}
                    </Txt>
                  </Row>
                </Pressable>
              </View>
            );
          })
        )}
      </Card>
    </>
  );
}

function SizeLine({
  size,
  top,
  bottom,
  header,
  muted,
}: {
  size: string;
  top: string;
  bottom: string;
  header?: boolean;
  muted?: boolean;
}) {
  const variant = header ? 'tiny' : 'h3';
  const dim = header || muted;
  return (
    <Row gap={space.md} style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}>
      <Txt variant={variant} muted={dim} style={{ flex: 1 }}>
        {size}
      </Txt>
      <Txt variant={variant} muted={dim} tabular style={{ width: 56, textAlign: 'right' }}>
        {top}
      </Txt>
      <Txt variant={variant} muted={dim} tabular style={{ width: 56, textAlign: 'right' }}>
        {bottom}
      </Txt>
    </Row>
  );
}
