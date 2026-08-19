import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { loadBallot, submitVote, type VoteBallot } from '@/lib/vote';
import { isLocalRepo } from '@/lib/repo';
import { formatDate } from '@/lib/format';
import { Card, Divider, Empty, Row, Screen, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';
import type { AttendanceStatus } from '@/lib/types';

const CHOICES: { value: AttendanceStatus; label: string }[] = [
  { value: 'attending', label: '참석' },
  { value: 'late', label: '지각' },
  { value: 'absent', label: '불참' },
];

/**
 * 가입 없이 참석만 남기는 화면.
 *
 * 이 앱을 쓰는 사람은 감독·코치·총무 셋인데, 참석을 답해야 하는 사람은 열여섯이다.
 * 열여섯 명을 전부 가입시키는 대신 링크 하나만 보낸다.
 *
 * 여기서는 회비도 기록도 보이지 않는다. 링크가 도는 물건이라 보이는 만큼이 곧 새는 만큼이다.
 */
export default function VoteScreen() {
  const p = usePalette();
  // 토큰을 경로가 아니라 쿼리로 받는다.
  // 정적 호스팅(GitHub Pages)에는 /vote/<토큰> 에 해당하는 파일이 없어서 404 대체 페이지가 뜨고,
  // 그러면 서버가 보낸 HTML 과 화면이 달라져 React 가 하이드레이션을 통째로 버린다.
  // /vote 는 실제 파일이라 그 문제가 없다.
  const { t: token } = useLocalSearchParams<{ t: string }>();
  const [ballot, setBallot] = useState<VoteBallot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadBallot(token);
      setBallot(next);
      if (!next) setError('링크가 만료됐거나 잘못된 주소예요.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '지금은 열 수 없어요.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function choose(memberId: string, status: AttendanceStatus) {
    if (!token) return;
    setSaving(memberId);
    // 눌렀을 때 바로 바뀌게 한다. 운동장 앞 지하철에서 누르는 화면이라 왕복을 기다리면 안 눌린 줄 안다.
    setBallot((prev) =>
      prev
        ? {
            ...prev,
            members: prev.members.map((member) =>
              member.id === memberId ? { ...member, status } : member,
            ),
          }
        : prev,
    );
    try {
      await submitVote(token, memberId, status);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장하지 못했어요.');
      await refresh();
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ paddingVertical: space.xxxl, alignItems: 'center' }}>
          <ActivityIndicator color={p.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (!ballot) {
    return (
      <Screen>
        <Card>
          <Empty text={error ?? '링크가 만료됐어요.\n총무에게 새 링크를 받아 주세요.'} />
          {isLocalRepo ? (
            <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
              데모 모드에서는 링크가 링크를 만든 기기에서만 열려요. Supabase를 연결하면 팀원 누구나
              열 수 있어요.
            </Txt>
          ) : null}
        </Card>
      </Screen>
    );
  }

  const done = ballot.members.filter((member) => member.status !== 'unknown').length;

  return (
    <Screen>
      <Card>
        <Txt variant="h2">{ballot.teamName}</Txt>
        <Txt variant="body" muted>
          {formatDate(ballot.match.date)} {ballot.match.kickoff}
        </Txt>
        <Txt variant="small" muted>
          {ballot.match.venue}
          {ballot.match.opponent ? ` · vs ${ballot.match.opponent}` : ''}
        </Txt>
        <Divider />
        <Txt variant="small" muted>
          본인 이름 옆을 눌러 주세요. {ballot.members.length}명 중 {done}명이 답했어요.
        </Txt>
      </Card>

      {error ? (
        <Card>
          <Txt variant="small" color={p.danger}>
            {error}
          </Txt>
        </Card>
      ) : null}

      <Card style={{ padding: space.sm, gap: 0 }}>
        {ballot.members.map((member, index) => (
          <View key={member.id}>
            {index > 0 ? <Divider /> : null}
            <Row
              justify="space-between"
              style={{ paddingVertical: space.sm, paddingHorizontal: space.sm }}
            >
              <Txt variant="h3" style={{ flexShrink: 1, opacity: saving === member.id ? 0.5 : 1 }}>
                {member.name}
              </Txt>
              <Row gap={6}>
                {CHOICES.map((choice) => {
                  const active = member.status === choice.value;
                  const tone =
                    choice.value === 'attending'
                      ? { fg: p.ok, bg: p.okSoft, line: p.okLine }
                      : choice.value === 'late'
                        ? { fg: p.warn, bg: p.warnSoft, line: p.warnLine }
                        : { fg: p.danger, bg: p.dangerSoft, line: p.dangerLine };
                  return (
                    <Pressable
                      key={choice.value}
                      onPress={() => choose(member.id, choice.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${member.name} ${choice.label}`}
                      style={{
                        minWidth: 52,
                        height: 38,
                        paddingHorizontal: space.sm,
                        borderRadius: radius.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? tone.bg : 'transparent',
                        borderWidth: 1,
                        borderColor: active ? tone.line : p.border,
                      }}
                    >
                      <Txt
                        variant="small"
                        color={active ? tone.fg : p.textFaint}
                        style={{ fontWeight: '500' }}
                      >
                        {choice.label}
                      </Txt>
                    </Pressable>
                  );
                })}
              </Row>
            </Row>
          </View>
        ))}
      </Card>

      <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
        누르면 바로 저장돼요. 마음이 바뀌면 다시 눌러서 고치면 돼요.
      </Txt>
    </Screen>
  );
}
