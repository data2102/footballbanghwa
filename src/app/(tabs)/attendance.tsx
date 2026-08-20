import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { attendanceForMatch, tallyAttendance, unrespondedMembers } from '@/lib/selectors';
import { formatDate } from '@/lib/format';
import {
  Avatar,
  Button,
  Card,
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
import type { AttendanceStatus } from '@/lib/types';

/*
 * 참석·불참·미투표 셋뿐이다.
 *
 * 지각을 뺐다. 참석 집계는 단톡방 투표를 옮겨 담는 일인데, 투표에는 지각 칸이 없다.
 * 앱에만 있는 칸은 아무도 누르지 않으면서 매주 손가락이 지나갈 자리만 차지한다.
 * 타입과 DB 값은 남겨 뒀다 — 예전에 지각으로 적어 둔 기록을 지우지 않으려고.
 */
const STATUSES: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: 'attending', label: '참석', short: '참' },
  { value: 'absent', label: '불참', short: '불' },
  { value: 'unknown', label: '미투표', short: '?' },
];

type Filter = 'all' | AttendanceStatus;

export default function AttendanceScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const setAttendance = useStore((state) => state.setAttendance);
  const [filter, setFilter] = useState<Filter>('all');

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

  const tally = match ? tallyAttendance(data, match.id) : null;
  const members = data.members
    .filter((member) => member.active)
    .filter((member) => filter === 'all' || (rows.get(member.id)?.status ?? 'unknown') === filter);

  const tone: Record<AttendanceStatus, { fg: string; bg: string; line: string }> = {
    attending: { fg: p.ok, bg: p.okSoft, line: p.okLine },
    late: { fg: p.warn, bg: p.warnSoft, line: p.warnLine },
    absent: { fg: p.danger, bg: p.dangerSoft, line: p.dangerLine },
    // 예전 엑셀에서 옮겨 온 "투표는 했는데 뭐라고 했는지 모름". 파랑으로 두어
    // 참석(초록)·불참(빨강)과 섞이지 않게 한다.
    voted: { fg: p.primaryStrong, bg: p.primarySoft, line: p.primary },
    unknown: { fg: p.textMuted, bg: p.surfaceAlt, line: p.borderStrong },
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
                카톡 투표 화면을 찍거나 대화를 그대로 붙여넣으면 명단에 맞춰 읽어요. 읽은 결과는
                체크로 확인한 뒤에만 저장돼요.
              </Txt>
              <Button
                label="투표 사진 올리기"
                icon="camera"
                onPress={() => router.push('/quick-input?hint=attendance')}
              />
            </Card>

            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '전체' },
                ...STATUSES.map((status) => ({ value: status.value, label: status.label })),
              ]}
            />

            <Card style={{ padding: space.sm, gap: 0 }}>
              {members.length === 0 ? (
                <Empty text="여기 해당하는 회원이 없어요." />
              ) : (
                members.map((member, index) => {
                  const current = (rows.get(member.id)?.status ?? 'unknown') as AttendanceStatus;
                  const note = rows.get(member.id)?.note;
                  return (
                    <View key={member.id}>
                      {index > 0 ? <Divider /> : null}
                      <Row justify="space-between" style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}>
                        <Row style={{ flexShrink: 1 }}>
                          <Avatar name={member.name} size={32} tone={tone[current].bg} />
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
                          {STATUSES.map((status) => {
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
                                  width: 30,
                                  height: 30,
                                  borderRadius: radius.sm,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: active ? tone[status.value].bg : 'transparent',
                                  borderWidth: 1,
                                  borderColor: active ? tone[status.value].line : p.border,
                                }}
                              >
                                <Txt
                                  variant="small"
                                  color={active ? tone[status.value].fg : p.textFaint}
                                  style={{ fontWeight: '500' }}
                                >
                                  {status.short}
                                </Txt>
                              </Pressable>
                            );
                          })}
                        </Row>
                      </Row>
                    </View>
                  );
                })
              )}
            </Card>

            <Button
              label="아직 답 없는 사람 전부 불참 처리하기"
              tone="neutral"
              onPress={() => {
                for (const member of data.members) {
                  if (!member.active) continue;
                  if ((rows.get(member.id)?.status ?? 'unknown') === 'unknown') {
                    setAttendance(match.id, member.id, 'absent');
                  }
                }
              }}
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
