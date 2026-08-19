import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useStore } from '@/lib/store';
import { attendanceForMatch, tallyAttendance } from '@/lib/selectors';
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
  Segmented,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { MatchPicker } from '@/components/MatchPicker';
import { QuickInputFab } from '@/components/QuickInputFab';
import { usePalette } from '@/theme';
import type { AttendanceStatus } from '@/lib/types';

const STATUSES: { value: AttendanceStatus; label: string; short: string }[] = [
  { value: 'attending', label: '참석', short: '참' },
  { value: 'late', label: '지각', short: '늦' },
  { value: 'absent', label: '불참', short: '불' },
  { value: 'unknown', label: '미정', short: '?' },
];

type Filter = 'all' | AttendanceStatus;

export default function AttendanceScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const setAttendance = useStore((state) => state.setAttendance);
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(
    () => (data && activeMatchId ? attendanceForMatch(data, activeMatchId) : new Map()),
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
                    ? `지각 ${tally.late}명 포함이에요. ${tally.unknown}명은 아직 답이 없어요.`
                    : `지각 ${tally?.late ?? 0}명 포함이에요. 전원 응답했어요.`
                }
              />
              <Txt variant="tiny" muted>
                {formatDate(match.date)} {match.kickoff} · {match.venue}
              </Txt>
              <Txt variant="tiny" muted>
                단톡방 투표를 그대로 복사하거나, 손으로 쓴 명단을 찍어서 오른쪽 아래 버튼에 넣으면 한 번에
                반영돼요.
              </Txt>
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
                              {member.preferredPosition ?? ''}
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
          </>
        )}
      </Screen>
      <QuickInputFab hint="attendance" />
    </View>
  );
}
