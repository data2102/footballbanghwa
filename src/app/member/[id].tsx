import { useMemo, useState } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import {
  STRENGTH_SUGGESTIONS,
  knownStrengths,
  memberProfile,
} from '@/lib/selectors';
import { formatDate, formatPeriod, thisPeriod, todayISO, won } from '@/lib/format';
import { pickPhoto } from '@/lib/photo';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  Hero,
  Row,
  Screen,
  SectionHeader,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { usePalette } from '@/theme';
import type { AgeBand, AttendanceStatus, MemberRole, PositionGroup } from '@/lib/types';

const POSITIONS: PositionGroup[] = ['GK', 'DF', 'MF', 'FW'];

/** 조기축구는 나이대가 쿼터 배분과 포지션에 실제로 영향을 준다. */
const AGE_BANDS: AgeBand[] = ['30', '40', '50', '60'];
const ROLES: { value: MemberRole; label: string }[] = [
  { value: 'manager', label: '감독' },
  { value: 'coach', label: '코치' },
  { value: 'treasurer', label: '총무' },
  { value: 'player', label: '선수' },
];

export default function MemberDetailScreen() {
  const p = usePalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const data = useStore((state) => state.data);
  const updateMember = useStore((state) => state.updateMember);
  const addLedger = useStore((state) => state.addLedger);
  const setMemberPhoto = useStore((state) => state.setMemberPhoto);

  const [newTag, setNewTag] = useState('');
  const [noteDraft, setNoteDraft] = useState<string | null>(null);

  const profile = useMemo(() => (data && id ? memberProfile(data, id) : null), [data, id]);
  const suggestions = useMemo(() => {
    const used = new Set(profile?.member.strengths ?? []);
    return [...knownStrengths(data?.members ?? []), ...STRENGTH_SUGGESTIONS]
      .filter((tag, index, list) => list.indexOf(tag) === index && !used.has(tag))
      .slice(0, 10);
  }, [data?.members, profile?.member.strengths]);

  if (!data || !profile) {
    return (
      <Screen>
        <Card>
          <Txt variant="small" muted>
            회원을 찾을 수 없어요.
          </Txt>
        </Card>
      </Screen>
    );
  }

  const { member } = profile;
  const ratePercent = profile.rate === null ? null : Math.round(profile.rate * 100);
  const rateTone =
    ratePercent === null ? p.textFaint : ratePercent < 50 ? p.danger : ratePercent < 75 ? p.warn : p.text;

  async function changePhoto(source: 'camera' | 'library') {
    const photo = await pickPhoto(source, { avatar: true });
    if (photo) await setMemberPhoto(member.id, photo);
  }

  function addTag(tag: string) {
    const cleaned = tag.trim();
    if (!cleaned || member.strengths.includes(cleaned)) return;
    updateMember({ ...member, strengths: [...member.strengths, cleaned] });
    setNewTag('');
  }

  return (
    <>
      <Stack.Screen options={{ title: member.name }} />
      <Screen>
        {/* ---------------------------------------------------- 프로필 */}
        <Card>
          <Row gap={space.lg}>
            <Pressable
              onPress={() => changePhoto('library')}
              onLongPress={() => changePhoto('camera')}
              accessibilityLabel="프로필 사진 바꾸기"
            >
              {member.photoUri ? (
                <Image source={{ uri: member.photoUri }} style={{ width: 64, height: 64, borderRadius: 32 }} />
              ) : (
                <Avatar name={member.name} size={64} />
              )}
            </Pressable>
            <View style={{ flex: 1, gap: space.xs }}>
              <Txt variant="h2">{member.name}</Txt>
              <Txt variant="tiny" muted>
                {member.positions.length ? member.positions.join('·') : '포지션 미정'}
                {member.backNumber != null ? ` · ${member.backNumber}번` : ''}
                {` · ${ROLES.find((role) => role.value === member.role)?.label}`}
              </Txt>
              {member.joinedOn ? (
                <Txt variant="tiny" muted>
                  {formatDate(member.joinedOn)}에 들어왔어요
                </Txt>
              ) : null}
            </View>
          </Row>
          <Row gap={space.sm}>
            <Button
              label="사진 찍기"
              icon="camera"
              tone="neutral"
              small
              style={{ flex: 1 }}
              onPress={() => changePhoto('camera')}
            />
            <Button
              label="사진첩에서"
              icon="image"
              tone="neutral"
              small
              style={{ flex: 1 }}
              onPress={() => changePhoto('library')}
            />
          </Row>
        </Card>

        {/* ---------------------------------------------------- 출석률 */}
        <Card>
          <Hero
            label="출석률"
            value={ratePercent === null ? '-' : `${ratePercent}%`}
            suffix={profile.eligible ? `· ${profile.eligible}경기 중 ${profile.attended + profile.late}번` : undefined}
            tone={rateTone}
            caption={
              profile.eligible === 0
                ? '아직 치른 경기가 없어요'
                : `참석 ${profile.attended} · 지각 ${profile.late} · 불참 ${profile.absent}`
            }
          />
          {profile.recent.length ? (
            <View style={{ gap: space.sm }}>
              <Txt variant="tiny" muted>
                최근 경기 (오른쪽이 최신)
              </Txt>
              <Row gap={space.sm}>
                {[...profile.recent].reverse().map((entry) => (
                  <AttendanceDot key={entry.matchId} date={entry.date} status={entry.status} />
                ))}
              </Row>
            </View>
          ) : null}
        </Card>

        {/* ---------------------------------------------------- 장점 */}
        <SectionHeader title="장점" />
        <Card>
          {member.strengths.length ? (
            <Row wrap gap={space.sm}>
              {member.strengths.map((tag) => (
                <Chip
                  key={tag}
                  label={`${tag}  ×`}
                  tone={{ fg: p.primaryStrong, bg: p.primarySoft }}
                  onPress={() =>
                    updateMember({
                      ...member,
                      strengths: member.strengths.filter((item) => item !== tag),
                    })
                  }
                />
              ))}
            </Row>
          ) : (
            <Txt variant="small" muted>
              이 선수를 왜 쓰는지 한 단어씩 적어두면, 라인업 짤 때 바로 보여요.
            </Txt>
          )}

          <Row gap={space.sm}>
            <TextInput
              value={newTag}
              onChangeText={setNewTag}
              onSubmitEditing={() => addTag(newTag)}
              placeholder="왼발, 헤딩, 체력…"
              placeholderTextColor={p.textFaint}
              style={{
                flex: 1,
                backgroundColor: p.surfaceAlt,
                borderRadius: radius.sm,
                paddingHorizontal: space.md,
                paddingVertical: space.md,
                color: p.text,
                fontSize: 15,
              }}
            />
            <Button label="추가" tone="neutral" small disabled={!newTag.trim()} onPress={() => addTag(newTag)} />
          </Row>

          {suggestions.length ? (
            <>
              <Txt variant="tiny" muted>
                눌러서 바로 붙이기
              </Txt>
              <Row wrap gap={space.sm}>
                {suggestions.map((tag) => (
                  <Chip key={tag} label={`+ ${tag}`} onPress={() => addTag(tag)} />
                ))}
              </Row>
            </>
          ) : null}
        </Card>

        {/* ---------------------------------------------------- 기록 */}
        <SectionHeader title="시즌 기록" />
        <Card>
          <Row gap={space.lg} wrap>
            <StatCell label="골" value={profile.goals} />
            <StatCell label="도움" value={profile.assists} />
            <StatCell label="선방" value={profile.saves} />
            <StatCell label="경고·퇴장" value={profile.cards} tone={profile.cards ? p.warn : undefined} />
          </Row>
        </Card>

        {/* ---------------------------------------------------- 회비 */}
        <SectionHeader title="회비" />
        <Card>
          <Row justify="space-between">
            <View style={{ gap: 2 }}>
              <Txt variant="h3">{formatPeriod(thisPeriod())}</Txt>
              <Txt variant="tiny" muted>
                {profile.outstanding > 0 ? `${won(profile.outstanding)} 아직이에요` : '냈어요'}
              </Txt>
            </View>
            {profile.outstanding > 0 ? (
              <Button
                label={`${won(profile.outstanding)} 입금 처리`}
                tone="neutral"
                small
                onPress={() =>
                  addLedger({
                    memberId: member.id,
                    kind: 'due',
                    amount: profile.outstanding,
                    period: thisPeriod(),
                    occurredOn: todayISO(),
                    memo: null,
                    source: 'manual',
                  })
                }
              />
            ) : (
              <Chip label="완납" tone={{ fg: p.ok, bg: p.okSoft }} />
            )}
          </Row>
          <Divider />
          <Row justify="space-between">
            <Txt variant="tiny" muted>
              지금까지 낸 돈
            </Txt>
            <Txt variant="h3" tabular>
              {won(profile.totalPaid)}
            </Txt>
          </Row>
          {profile.paidPeriods.length ? (
            <Row wrap gap={space.sm}>
              {profile.paidPeriods.slice(0, 8).map((period) => (
                <Chip key={period} label={formatPeriod(period)} tone={{ fg: p.ok, bg: p.okSoft }} />
              ))}
            </Row>
          ) : null}
        </Card>

        {/* ---------------------------------------------------- 메모 */}
        <SectionHeader title="감독 메모" />
        <Card>
          <TextInput
            multiline
            value={noteDraft ?? member.note ?? ''}
            onChangeText={setNoteDraft}
            onBlur={() => {
              if (noteDraft !== null && noteDraft !== (member.note ?? '')) {
                updateMember({ ...member, note: noteDraft.trim() || null });
              }
              setNoteDraft(null);
            }}
            placeholder="부상 이력, 성향처럼 태그로 담기 어려운 것"
            placeholderTextColor={p.textFaint}
            style={{
              minHeight: 84,
              backgroundColor: p.surfaceAlt,
              borderRadius: radius.sm,
              padding: space.md,
              color: p.text,
              fontSize: 15,
              lineHeight: 24,
              textAlignVertical: 'top',
            }}
          />
        </Card>

        {/* ---------------------------------------------------- 기본 정보 */}
        <SectionHeader title="기본 정보" />
        <Card>
          <Txt variant="tiny" muted>
            주 포지션
          </Txt>
          <Row wrap gap={space.sm}>
            {/* 여러 자리를 볼 수 있으니 여러 개를 고른다. 먼저 고른 게 주 포지션이다. */}
            {POSITIONS.map((position) => (
              <Chip
                key={position}
                label={position}
                selected={member.positions.includes(position)}
                onPress={() =>
                  updateMember({
                    ...member,
                    positions: member.positions.includes(position)
                      ? member.positions.filter((row) => row !== position)
                      : [...member.positions, position],
                  })
                }
              />
            ))}
          </Row>

          <Txt variant="tiny" muted>
            연령대
          </Txt>
          <Row wrap gap={space.sm}>
            {AGE_BANDS.map((band) => (
              <Chip
                key={band}
                label={`${band}대`}
                selected={member.ageBand === band}
                onPress={() =>
                  updateMember({ ...member, ageBand: member.ageBand === band ? null : band })
                }
              />
            ))}
          </Row>

          <Txt variant="tiny" muted>
            역할
          </Txt>
          <Row wrap gap={space.sm}>
            {ROLES.map((role) => (
              <Chip
                key={role.value}
                label={role.label}
                selected={member.role === role.value}
                onPress={() => updateMember({ ...member, role: role.value })}
              />
            ))}
          </Row>

          <Txt variant="tiny" muted>
            등번호
          </Txt>
          <TextInput
            value={member.backNumber == null ? '' : String(member.backNumber)}
            onChangeText={(value) => {
              const digits = value.replace(/\D/g, '').slice(0, 2);
              updateMember({ ...member, backNumber: digits ? Number(digits) : null });
            }}
            keyboardType="number-pad"
            placeholder="없음"
            placeholderTextColor={p.textFaint}
            style={{
              backgroundColor: p.surfaceAlt,
              borderRadius: radius.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.md,
              color: p.text,
              fontSize: 15,
              width: 90,
            }}
          />
        </Card>

        <Button
          label="명단에서 빼기"
          icon="trash"
          tone="danger"
          onPress={async () => {
            await updateMember({ ...member, active: false });
            router.back();
          }}
        />
        <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
          기록은 그대로 남고 명단·회비 집계에서만 빠져요.
        </Txt>
      </Screen>
    </>
  );
}

function StatCell({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={{ gap: 2, minWidth: 56 }}>
      <Txt variant="tiny" muted>
        {label}
      </Txt>
      <Txt variant="h2" tabular color={tone}>
        {value}
      </Txt>
    </View>
  );
}

/** 최근 경기 참석을 한 칸씩. 색만으로 구분하지 않고 글자를 같이 넣는다. */
function AttendanceDot({ date, status }: { date: string; status: AttendanceStatus }) {
  const p = usePalette();
  const map: Record<AttendanceStatus, { label: string; fg: string; bg: string }> = {
    attending: { label: '참', fg: p.ok, bg: p.okSoft },
    late: { label: '늦', fg: p.warn, bg: p.warnSoft },
    absent: { label: '불', fg: p.danger, bg: p.dangerSoft },
    unknown: { label: '?', fg: p.textFaint, bg: p.surfaceAlt },
  };
  const tone = map[status];
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.sm,
          backgroundColor: tone.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt variant="tiny" color={tone.fg}>
          {tone.label}
        </Txt>
      </View>
      <Txt variant="tiny" muted style={{ fontSize: 10 }}>
        {date.slice(5).replace('-', '/')}
      </Txt>
    </View>
  );
}
