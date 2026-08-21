import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { attendanceForMatch, tallyAttendance, unrespondedMembers } from '@/lib/selectors';
import { formatDate } from '@/lib/format';
import { pickPhoto } from '@/lib/photo';
import { handOffPhotos } from '@/lib/photoHandoff';
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
import { AttendanceNudge } from '@/features/attendance/AttendanceNudge';
import { MatchPicker } from '@/components/MatchPicker';
import { usePalette } from '@/theme';
import type { AgeBand, AttendanceStatus } from '@/lib/types';

/*
 * 참석·불참·미투표 셋뿐이다.
 *
 * 지각을 뺐다. 참석 집계는 단톡방 투표를 옮겨 담는 일인데, 투표에는 지각 칸이 없다.
 * 앱에만 있는 칸은 아무도 누르지 않으면서 매주 손가락이 지나갈 자리만 차지한다.
 * 타입과 DB 값은 남겨 뒀다 — 예전에 지각으로 적어 둔 기록을 지우지 않으려고.
 */
const STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: 'attending', label: '참석' },
  { value: 'absent', label: '불참' },
  { value: 'unknown', label: '미투표' },
];

/**
 * 미정 = 이 경기에 참석 줄이 아예 없는 사람.
 *
 * 캡처에 안 나온 사람이 여기 남는다. 전에는 미투표와 한 칸이라 "투표를 안 한 사람"과
 * "캡처에 없어서 아직 못 넣은 사람"이 섞였다. 총무가 확인해야 할 건 뒤쪽이다.
 */
type Filter = 'all' | AttendanceStatus | 'undecided';

/** 나이대별로 걸러 본다. 조기축구는 연령대가 쿼터 배분에 실제로 쓰인다. */
const AGE_BANDS: AgeBand[] = ['60', '50', '40', '30', '20'];


export default function AttendanceScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const setAttendance = useStore((state) => state.setAttendance);
  const setAttendanceMany = useStore((state) => state.setAttendanceMany);
  const clearAttendance = useStore((state) => state.clearAttendance);
  const [filter, setFilter] = useState<Filter>('all');
  const [band, setBand] = useState<AgeBand | 'all'>('all');
  /*
   * 카톡 투표 화면을 사진으로 읽는 건 아흔 명쯤 되면 자꾸 틀린다. 이름이 작고
   * 프로필 사진에 가리고 화면이 잘린다. 그래서 손으로 고르는 길을 확실하게 둔다 —
   * 참석한 사람 골라서 한 번, 불참 골라서 한 번, 나머지는 미투표로 한 번.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  /**
   * 이 경기 참석을 통째로 지우기 전에 한 번 더 묻는 상태.
   *
   * 날짜를 잘못 골라 지난주 투표를 이번 주에 넣는 일이 실제로 있었다. 되돌리려면
   * 아흔 명을 하나씩 지워야 한다. 그래서 초기화 버튼을 두되, **한 번에 지워지지 않게** 한다.
   * 지우는 건 두 번째 누를 때이고, 그때 몇 명이 지워지는지 숫자로 보여 준다.
   */
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [picking, setPicking] = useState(false);

  const rows = useMemo(
    () => (data && activeMatchId ? attendanceForMatch(data, activeMatchId) : new Map()),
    [data, activeMatchId],
  );
  const pending = useMemo(
    () => (data && activeMatchId ? unrespondedMembers(data, activeMatchId) : []),
    [data, activeMatchId],
  );

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId);
  /**
   * 아직 아무 표시도 없는 사람. 캡처에 안 나왔거나 손이 안 간 사람이다.
   * 탭으로만 두면 찾아가야 보인다 — 이 앱은 총무가 찾아다니지 않는 게 전제라 위에서 알린다.
   */
  const undecided = data.members.filter((one) => one.active && !rows.get(one.id));
  /** 이 경기에 실제로 줄이 있는 사람 수. 초기화로 지워질 대상이다. */
  const answered = rows.size;

  const tally = match ? tallyAttendance(data, match.id) : null;
  const members = data.members
    .filter((member) => member.active)
    .filter((member) => {
      if (filter === 'all') return true;
      // 미정은 "줄이 아예 없음". 캡처에 안 나온 사람이 여기 남는다.
      if (filter === 'undecided') return !rows.get(member.id);
      return rows.get(member.id)?.status === filter;
    })
    .filter((member) => band === 'all' || member.ageBand === band);

  const active = data.members.filter((member) => member.active);
  /** 참석·불참으로 정해지지 않은 채 줄만 남아 있는 사람 — 미투표로 되돌릴 대상. */
  const toPending = active
    .filter((member) => {
      const status = rows.get(member.id)?.status;
      return status && status !== 'attending' && status !== 'absent';
    })
    .map((member) => member.id);
  /** 줄이 아예 없는 사람 — 아직 아무 말이 없는 사람. */
  const stillSilent = active
    .filter((member) => !rows.get(member.id))
    .map((member) => member.id);

  /*
   * 참석은 파랑, 불참은 빨강, 미투표는 진한 회색.
   *
   * 참석을 초록에서 파랑으로 옮겼다. 운동장 햇빛 아래 작은 칩에서는 초록과 회색이
   * 잘 안 갈렸다. 미투표도 옅은 회색이라 안 보인다고 해서 글자를 본문 색까지 올렸다.
   */
  const tone: Record<AttendanceStatus, { fg: string; bg: string; line: string }> = {
    attending: { fg: p.primaryStrong, bg: p.primarySoft, line: p.primary },
    absent: { fg: p.danger, bg: p.dangerSoft, line: p.dangerLine },
    unknown: { fg: p.text, bg: p.surfaceAlt, line: p.textMuted },
    // 지각과 "투표는 했는데 뭐라고 했는지 모름"은 화면에서 고를 수 없다.
    // 옛 기록에만 남아 있어서 아바타 색으로만 쓰인다.
    late: { fg: p.warn, bg: p.warnSoft, line: p.warnLine },
    voted: { fg: p.warn, bg: p.warnSoft, line: p.warnLine },
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <MatchPicker />
        {!match ? (
          <Card>
            <Empty text={'경기를 먼저 만들어 주세요.\n설정에서 추가할 수 있어요.'} />
          </Card>
        ) : (
          <>
            <Card>
              <Hero
                label="뛸 수 있는 인원"
                value={`${(tally?.attending ?? 0) + (tally?.late ?? 0)}명`}
                suffix={`/ ${data.members.filter((m) => m.active).length}명`}
                caption={
                  tally?.unknown
                    ? `${tally.unknown}명은 아직 투표를 안 했어요.`
                    : '전원 투표했어요.'
                }
              />
              <Txt variant="tiny" muted>
                {formatDate(match.date)} {match.kickoff} · {match.venue}
              </Txt>
              {/*
                예전 엑셀에서 옮겨 온 주는 "투표했다"까지만 안다. 그 말을 안 해 두면
                아흔 명이 아무 표시도 없이 놓여 있어서 앱이 고장 난 것처럼 보인다.
              */}
              {tally?.voted ? (
                <Txt variant="tiny" color={p.primaryStrong}>
                  {tally.voted}명은 투표한 것만 확인됐어요. 참석인지 불참인지는 안 적혀 있어요.
                </Txt>
              ) : null}
              {/*
                이름을 나열하는 건 "이 사람들만 찌르면 된다"를 보여 주려는 것이다.
                아직 전원이 미응답이면 그 목록은 아래 명단과 똑같아서 줄만 차지한다.
              */}
              {pending.length && pending.length < data.members.filter((m) => m.active).length ? (
                <Txt variant="tiny" muted>
                  아직 답 없음 · {pending.slice(0, 8).map((member) => member.name).join(', ')}
                  {pending.length > 8 ? ` 외 ${pending.length - 8}명` : ''}
                </Txt>
              ) : null}
            </Card>

            {/*
              참석 투표는 단톡방에서 한다. 그래서 이 화면에서 제일 먼저 하는 일은
              그 투표 화면을 찍어서 넣는 것이다. 아래 명단 체크는 빠진 사람 고칠 때만 쓴다.
            */}
            <Card>
              <Txt variant="h3">단톡방 투표 옮겨 담기</Txt>
              <Txt variant="tiny" muted>
                카톡 투표 현황에서 <Txt variant="tiny">항목별</Txt> 탭과{' '}
                <Txt variant="tiny">미참여</Txt> 탭을 각각 캡처해서 올리면 참석·불참·미투표로
                나눠 읽어요. 길게 찍혀도 앱이 알아서 잘라 읽으니 나눠 찍지 않으셔도 돼요.
              </Txt>
              <Txt variant="tiny" muted>
                읽은 결과는 체크로 확인한 뒤에만 저장돼요.
              </Txt>
              <Row gap={space.sm}>
                {/*
                  글자가 길어 320px 에서 두 줄로 접혔다. 짧게 줄이고 small 로 낮춘다.
                  좁은 화면에서 버튼 두 개를 옆에 두려면 글자가 네 자를 넘으면 안 된다.
                */}
                <Button
                  label={picking ? '여는 중' : '사진 올리기'}
                  icon="camera"
                  tone="neutral"
                  small
                  style={{ flex: 1 }}
                  disabled={picking}
                  /*
                   * 사진첩은 누른 이 자리에서 연다. 브라우저가 "사용자가 누른 그 순간"이
                   * 아니면 파일 선택을 안 열어 주기 때문에, 화면을 먼저 띄우고 열 수는 없다.
                   * 고른 사진만 검토 화면으로 넘긴다.
                   */
                  onPress={async () => {
                    setPicking(true);
                    try {
                      const photo = await pickPhoto('library');
                      if (!photo) return;
                      handOffPhotos([photo]);
                      router.push('/attendance-photo');
                    } finally {
                      setPicking(false);
                    }
                  }}
                />
                <Button
                  label={selecting ? '그만두기' : '여러 명 고르기'}
                  icon="check"
                  small
                  style={{ flex: 1 }}
                  onPress={() => {
                    setSelecting((on) => !on);
                    setPicked(new Set());
                  }}
                />
              </Row>
              {/*
                사진이 아흔 명에서 자꾸 틀린다는 걸 겪고 나서 넣었다.
                카톡 투표는 복사도 막혀 있어서, 손으로 고르는 길이 확실한 바닥이 된다.
              */}
              <Txt variant="tiny" muted>
                사진이 잘 안 읽히면 여러 명 한 번에로 골라서 처리하세요. 참석·불참을 고른 뒤
                나머지를 미투표로 한 번에 되돌릴 수 있어요.
              </Txt>

              {/*
                날짜를 잘못 골라 지난주 투표를 이번 주에 넣는 일이 있다. 되돌리려면
                아흔 명을 하나씩 지워야 해서, 통째로 비우는 길을 둔다.
                한 번에 지워지지 않게 두 번 눌러야 하고, 몇 명이 지워지는지 숫자로 보여 준다.
              */}
              {answered > 0 ? (
                <>
                  <Divider />
                  {confirmReset ? (
                    <View style={{ gap: space.sm }}>
                      <Txt variant="small" color={p.danger}>
                        {`${match ? formatDate(match.date) : '이 경기'}에 적힌 ${answered}명을 모두 지우고 미투표로 되돌려요. 되돌릴 수 없어요.`}
                      </Txt>
                      <Row gap={space.sm}>
                        <Button
                          label={`${answered}명 지우기`}
                          tone="danger"
                          style={{ flex: 1 }}
                          loading={resetting}
                          onPress={async () => {
                            if (!activeMatchId) return;
                            setResetting(true);
                            await clearAttendance(activeMatchId, [...rows.keys()]);
                            setResetting(false);
                            setConfirmReset(false);
                            setPicked(new Set());
                            setSelecting(false);
                          }}
                        />
                        <Button
                          label="그만두기"
                          tone="neutral"
                          style={{ flex: 1 }}
                          onPress={() => setConfirmReset(false)}
                        />
                      </Row>
                    </View>
                  ) : (
                    <Button
                      label="이 날짜 참석 전체 지우기"
                      tone="neutral"
                      small
                      onPress={() => setConfirmReset(true)}
                    />
                  )}
                </>
              ) : null}
            </Card>

            {/*
              아무 표시도 없는 사람은 위에서 알린다. 캡처에 안 나와서 빠진 사람이
              여기 남는데, 탭으로만 두면 찾아가야 보인다.
            */}
            {undecided.length > 0 && filter !== 'undecided' ? (
              <Card style={{ backgroundColor: p.warnSoft, borderColor: p.warnSoft }}>
                <Row justify="space-between" gap={space.md}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="h3" color={p.warn}>
                      {`아직 표시 없는 ${undecided.length}명`}
                    </Txt>
                    <Txt variant="tiny" color={p.warn}>
                      투표 캡처에 안 나온 사람일 수 있어요. 확인해 주세요.
                    </Txt>
                  </View>
                  <Button label="보기" tone="neutral" small onPress={() => setFilter('undecided')} />
                </Row>
              </Card>
            ) : null}

            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '전체' },
                ...STATUSES.map((status) => ({ value: status.value, label: status.label })),
                { value: 'undecided' as const, label: '미정' },
              ]}
            />

            {/* 연령대. 여섯 칸이라 Segmented 로는 좁아서 칩을 가로로 민다. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Row gap={space.sm}>
                {(['all', ...AGE_BANDS] as const).map((one) => (
                  <Chip
                    key={one}
                    label={one === 'all' ? '연령 전체' : `${one}대`}
                    tone={
                      band === one ? { fg: p.primaryStrong, bg: p.primarySoft } : undefined
                    }
                    onPress={() => setBand(one)}
                  />
                ))}
              </Row>
            </ScrollView>

            {selecting ? (
              <Row justify="space-between">
                <Txt variant="small" muted>
                  {picked.size}명 골랐어요
                </Txt>
                <Row gap={space.sm}>
                  <Button
                    label={`보이는 ${members.length}명 전부`}
                    tone="neutral"
                    small
                    onPress={() => setPicked(new Set(members.map((member) => member.id)))}
                  />
                  <Button
                    label="선택 지우기"
                    tone="neutral"
                    small
                    disabled={picked.size === 0}
                    onPress={() => setPicked(new Set())}
                  />
                </Row>
              </Row>
            ) : null}

            <Card style={{ padding: space.sm, gap: 0 }}>
              {members.length === 0 ? (
                <Empty text="여기 해당하는 회원이 없어요." />
              ) : (
                members.map((member, index) => {
                  /*
                   * 줄이 없으면 null 이다. 예전에는 'unknown' 으로 떨어뜨렸는데, 그러면
                   * 아무 표시도 없는 사람이 화면에서는 "미투표"를 고른 것처럼 보였다.
                   * 미정과 미투표를 나눈 의미가 없어진다.
                   */
                  const current = (rows.get(member.id)?.status ?? null) as AttendanceStatus | null;
                  const note = rows.get(member.id)?.note;
                  const chosen = picked.has(member.id);
                  const toggle = () =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(member.id)) next.delete(member.id);
                      else next.add(member.id);
                      return next;
                    });
                  return (
                    <View key={member.id}>
                      {index > 0 ? <Divider /> : null}
                      <Pressable
                        // 고르는 중에는 줄 아무 데나 눌러도 골라진다. 아흔 번 누를 자리라
                        // 작은 네모만 정확히 찍게 하면 손이 아프다.
                        onPress={selecting ? toggle : undefined}
                        accessibilityRole={selecting ? 'checkbox' : undefined}
                        accessibilityState={selecting ? { checked: chosen } : undefined}
                        accessibilityLabel={selecting ? member.name : undefined}
                      >
                      <Row justify="space-between" style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}>
                        <Row style={{ flexShrink: 1 }}>
                          {/*
                            네모는 보여 주기만 한다. 누르는 건 줄 전체가 받는다 —
                            둘 다 반응하면 네모를 정확히 눌렀을 때 두 번 토글돼서
                            아무 일도 안 일어난다. 실제로 그렇게 안 골라졌다.
                          */}
                          {selecting ? (
                            <View
                              pointerEvents="none"
                              // 낭독기에도 감춘다. 줄 자체가 이미 checkbox 라 안 감추면
                              // 한 사람이 두 번 읽힌다.
                              accessibilityElementsHidden
                              importantForAccessibility="no-hide-descendants"
                            >
                              <Checkbox checked={chosen} onToggle={toggle} />
                            </View>
                          ) : null}
                          <Avatar name={member.name} size={32} tone={current ? tone[current].bg : p.surfaceAlt} />
                          <View style={{ flexShrink: 1 }}>
                            <Txt variant="h3">{member.name}</Txt>
                            <Txt variant="tiny" muted numberOfLines={1}>
                              {member.backNumber ? `#${member.backNumber} ` : ''}
                              {member.positions.join('·')}
                              {note ? ` · ${note}` : ''}
                            </Txt>
                          </View>
                        </Row>
                        <Row gap={4}>
                          {/* 고르는 중에는 상태 버튼을 감춘다. 같은 줄에서 두 가지를 하면 오작동한다. */}
                          {selecting ? null : STATUSES.map((status) => {
                            const active = current === status.value;
                            return (
                              <Pressable
                                key={status.value}
                                onPress={() => setAttendance(match.id, member.id, status.value)}
                                // 역할을 안 주면 화면 낭독기가 그냥 글자로 읽는다. 눌리는 것임을 알려야 한다.
                                accessibilityRole="button"
                                accessibilityState={{ selected: active }}
                                accessibilityLabel={`${member.name} ${status.label}`}
                                style={{
                                  paddingHorizontal: 8,
                                  height: 30,
                                  minWidth: 34,
                                  borderRadius: radius.sm,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: active ? tone[status.value].bg : 'transparent',
                                  borderWidth: 1,
                                  borderColor: active ? tone[status.value].line : p.border,
                                }}
                              >
                                {/*
                                  참·불·? 세 글자였는데 "?" 가 무슨 뜻인지 알 수 없다는 말을 들었다.
                                  낱말로 적는다. 안 고른 것도 textFaint 는 너무 옅어서 textMuted 로 올렸다.
                                */}
                                <Txt
                                  variant="tiny"
                                  color={active ? tone[status.value].fg : p.textMuted}
                                  style={{ fontWeight: active ? '700' : '500' }}
                                >
                                  {status.label}
                                </Txt>
                              </Pressable>
                            );
                          })}
                        </Row>
                      </Row>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </Card>

            {selecting ? (
              <Card>
                <Txt variant="h3">골라 둔 {picked.size}명을</Txt>
                <Row gap={space.sm}>
                  <Button
                    label="참석"
                    style={{ flex: 1 }}
                    disabled={picked.size === 0}
                    onPress={async () => {
                      await setAttendanceMany(match.id, [...picked], 'attending');
                      setPicked(new Set());
                    }}
                  />
                  <Button
                    label="불참"
                    tone="neutral"
                    style={{ flex: 1 }}
                    disabled={picked.size === 0}
                    onPress={async () => {
                      await setAttendanceMany(match.id, [...picked], 'absent');
                      setPicked(new Set());
                    }}
                  />
                  <Button
                    label="미투표"
                    tone="neutral"
                    style={{ flex: 1 }}
                    disabled={picked.size === 0}
                    onPress={async () => {
                      /*
                       * 미투표도 줄로 남긴다. 지우면 "표시가 아예 없는 사람"과 구분이 안 된다 —
                       * 캡처에 안 나와서 빠진 사람을 찾을 수 없게 된다.
                       * 계산 쪽은 예전부터 줄 없음과 unknown 을 같게 봐서(?? 'unknown') 영향이 없다.
                       */
                      await setAttendanceMany(match.id, [...picked], 'unknown');
                      setPicked(new Set());
                    }}
                  />
                </Row>
                <Txt variant="tiny" muted>
                  누르면 바로 저장돼요. 위 칸에서 참석·불참만 걸러 보면 고르기가 빨라요.
                </Txt>
              </Card>
            ) : null}

            {/*
              참석·불참을 다 골랐으면 남은 사람은 전부 아직 답을 안 한 것이다.
              여기서 되돌리는 건 참석도 불참도 아닌 줄(지각·투표함·판단못함)뿐이다.
              불참은 사람이 일부러 찍은 값이라 건드리지 않는다 — 그걸 되돌리고 싶으면
              위에서 불참만 걸러 골라 미투표를 누르면 된다.

              인원을 버튼에 박아 둔다 — 옛 경기를 열어 둔 채 누르면 그 주 기록이 통째로
              지워지는데, "90명"이라고 쓰여 있으면 손이 멈춘다.
            */}
            <Button
              label={
                toPending.length
                  ? `참석·불참이 아닌 ${toPending.length}명 미투표로 되돌리기`
                  : '참석·불참으로 정리됐어요'
              }
              tone="neutral"
              disabled={toPending.length === 0}
              // 미투표도 줄로 남긴다. 지우면 표시가 아예 없는 사람과 구분이 안 된다.
              onPress={() => void setAttendanceMany(match.id, toPending, 'unknown')}
            />

            <Button
              label={
                stillSilent.length
                  ? `아직 답 없는 ${stillSilent.length}명 전부 불참 처리하기`
                  : '전원 답했어요'
              }
              tone="neutral"
              disabled={stillSilent.length === 0}
              onPress={() => void setAttendanceMany(match.id, stillSilent, 'absent')}
            />

            {/*
              링크 보내기와 독촉은 주중에 한 번 하는 일이고, 명단 체크는 경기 당일 매번 하는 일이다.
              그래서 자주 쓰는 명단을 위에 두고 이 둘을 아래로 내린다.
            */}
            {/*
              참석 링크(ShareVoteLink)는 화면에서만 감춰 뒀다. 참석 투표를 카톡에서 하시므로
              지금은 쓸 일이 없다. 코드와 DB 함수는 그대로 남겼다 — 나중에 앱에서 받기로
              마음이 바뀌면 이 줄만 되살리면 된다.
            */}
            <SectionHeader title="팀에 보내기" />
            <AttendanceNudge
              teamName={data.team.name}
              match={match}
              pending={pending}
              attending={(tally?.attending ?? 0) + (tally?.late ?? 0)}
            />
          </>
        )}
      </Screen>
    </View>
  );
}
