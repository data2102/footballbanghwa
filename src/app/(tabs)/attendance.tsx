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
  Row,
  Screen,
  Segmented,
  Stat,
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

  const tone: Record<AttendanceStatus, { fg: string; bg: string }> = {
    attending: { fg: p.ok, bg: p.okSoft },
    late: { fg: p.warn, bg: p.warnSoft },
    absent: { fg: p.danger, bg: p.dangerSoft },
    unknown: { fg: p.textMuted, bg: p.surfaceAlt },
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <MatchPicker />
        {!match ? (
          <Card>
            <Empty text="경기를 먼저 만들어 주세요." />
          </Card>
        ) : (
          <>
            <Card>
              <Txt variant="h3">
                {formatDate(match.date)} {match.kickoff} · {match.venue}
              </Txt>
              <Row gap={space.sm} wrap>
                <Stat label="참석" value={`${tally?.attending ?? 0}`} tone={p.ok} />
                <Stat label="지각" value={`${tally?.late ?? 0}`} tone={p.warn} />
                <Stat label="불참" value={`${tally?.absent ?? 0}`} tone={p.danger} />
                <Stat label="미정" value={`${tally?.unknown ?? 0}`} />
              </Row>
              <Txt variant="small" muted>
                단톡방 투표 결과를 그대로 복사해서 오른쪽 아래 &ldquo;문자로 입력&rdquo; 버튼에
                붙여넣으면 한 번에 반영됩니다.
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
                <Empty text="해당하는 회원이 없습니다." />
              ) : (
                members.map((member, index) => {
                  const current = (rows.get(member.id)?.status ?? 'unknown') as AttendanceStatus;
                  const note = rows.get(member.id)?.note;
                  return (
                    <View key={member.id}>
                      {index > 0 ? <Divider /> : null}
                      <Row justify="space-between" style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}>
                        <Row style={{ flexShrink: 1 }}>
                          <Avatar name={member.name} tone={tone[current].bg} />
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
                                  width: 34,
                                  height: 34,
                                  borderRadius: radius.sm,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: active ? tone[status.value].bg : 'transparent',
                                  borderWidth: 1,
                                  borderColor: active ? tone[status.value].fg : p.border,
                                }}
                              >
                                <Txt
                                  variant="small"
                                  color={active ? tone[status.value].fg : p.textMuted}
                                  style={{ fontWeight: '700' }}
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
              label="미정 인원 전부 불참 처리"
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
