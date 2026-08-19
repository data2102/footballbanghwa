import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { blankMemberFields, useStore } from '@/lib/store';
import { isLocalRepo } from '@/lib/repo';
import { supabase } from '@/lib/supabase';
import { formatDate, todayISO } from '@/lib/format';
import {
  Button,
  Card,
  Chip,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Toggle,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { registerForReminders } from '@/lib/notifications';
import { usePalette } from '@/theme';
import type { PositionGroup } from '@/lib/types';

const POSITIONS: PositionGroup[] = ['GK', 'DF', 'MF', 'FW'];

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad';
  placeholder?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Txt variant="tiny" muted>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={p.textMuted}
        style={{
          backgroundColor: p.surfaceAlt,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          color: p.text,
          fontSize: 15,
        }}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  const updateTeam = useStore((state) => state.updateTeam);
  const addMember = useStore((state) => state.addMember);
  const updateMember = useStore((state) => state.updateMember);
  const saveMatch = useStore((state) => state.saveMatch);

  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState<PositionGroup | null>(null);
  const [matchDate, setMatchDate] = useState(todayISO());
  const [matchVenue, setMatchVenue] = useState('');
  const [matchKickoff, setMatchKickoff] = useState('07:00');
  const [deviceNote, setDeviceNote] = useState<string | null>(null);

  if (!data) return null;

  return (
    <Screen>
      <SectionHeader title="팀" />
      <Card>
        <Field label="팀 이름" value={data.team.name} onChangeText={(value) => updateTeam({ name: value })} />
        <Field
          label="월 회비 (원)"
          keyboardType="number-pad"
          value={String(data.team.monthlyDue)}
          onChangeText={(value) => updateTeam({ monthlyDue: Number(value.replace(/\D/g, '')) || 0 })}
        />
        {data.team.inviteCode ? (
          <Row justify="space-between">
            <Txt variant="small" muted>
              초대코드
            </Txt>
            <Txt variant="h3" color={p.primary}>
              {data.team.inviteCode}
            </Txt>
          </Row>
        ) : null}
      </Card>

      <SectionHeader title="알림" />
      <Card>
        <Toggle
          label="경기 전날 알림 보내기"
          help="아직 참석 여부를 안 남긴 사람에게만 갑니다. 이미 답한 사람은 받지 않아요."
          value={data.team.reminderEnabled}
          onChange={(next) => updateTeam({ reminderEnabled: next })}
        />
        {data.team.reminderEnabled ? (
          <>
            <Divider />
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Txt variant="small" muted>
                  {deviceNote ?? '이 기기에서 알림을 받으려면 권한을 켜주세요.'}
                </Txt>
              </View>
              <Button
                label="이 기기 등록"
                tone="neutral"
                small
                onPress={async () => {
                  const result = await registerForReminders();
                  setDeviceNote(result.ok ? '이 기기로 알림이 와요.' : result.reason ?? null);
                }}
              />
            </Row>
          </>
        ) : null}
      </Card>

      <SectionHeader title="경기 추가" />
      <Card>
        <Row gap={space.sm}>
          <Field label="날짜 (YYYY-MM-DD)" value={matchDate} onChangeText={setMatchDate} />
          <Field label="시각" value={matchKickoff} onChangeText={setMatchKickoff} />
        </Row>
        <Field label="장소" value={matchVenue} onChangeText={setMatchVenue} placeholder="방화근린공원 축구장" />
        <Button
          label="경기 만들기"
          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)}
          onPress={async () => {
            await saveMatch({
              date: matchDate,
              kickoff: matchKickoff,
              venue: matchVenue,
              opponent: null,
              status: 'scheduled',
              note: null,
              shareToken: null,
            });
            setMatchVenue('');
          }}
        />
      </Card>

      <SectionHeader title={`명단 (${data.members.filter((m) => m.active).length}명)`} />
      <Card>
        <Row gap={space.sm} align="flex-end">
          <Field label="이름" value={newName} onChangeText={setNewName} placeholder="홍길동" />
          <Button
            label="추가"
            small
            disabled={!newName.trim()}
            onPress={async () => {
              await addMember({
                ...blankMemberFields(),
                name: newName.trim(),
                preferredPosition: newPosition,
              });
              setNewName('');
              setNewPosition(null);
            }}
          />
        </Row>
        <Row wrap gap={space.sm}>
          {POSITIONS.map((position) => (
            <Chip
              key={position}
              label={position}
              selected={newPosition === position}
              onPress={() => setNewPosition(newPosition === position ? null : position)}
            />
          ))}
        </Row>
      </Card>

      <Card style={{ padding: space.sm, gap: 0 }}>
        {data.members
          .filter((member) => member.active)
          .map((member, index) => (
            <View key={member.id}>
              {index > 0 ? <Divider /> : null}
              <Row justify="space-between" style={{ padding: space.sm }}>
                <View style={{ flexShrink: 1 }}>
                  <Txt variant="body">{member.name}</Txt>
                  <Txt variant="tiny" muted>
                    {member.backNumber ? `#${member.backNumber} · ` : ''}
                    {member.preferredPosition ?? '포지션 미정'} · {roleLabel(member.role)}
                  </Txt>
                </View>
                <Button label="열기" tone="neutral" small onPress={() => router.push(`/member/${member.id}`)} />
              </Row>
            </View>
          ))}
      </Card>

      <SectionHeader title="경기 목록" />
      <Card style={{ padding: space.sm, gap: 0 }}>
        {data.matches
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((match, index) => (
            <View key={match.id}>
              {index > 0 ? <Divider /> : null}
              <Row justify="space-between" style={{ padding: space.sm }}>
                <View style={{ flexShrink: 1 }}>
                  <Txt variant="body">
                    {formatDate(match.date)} {match.kickoff}
                  </Txt>
                  <Txt variant="tiny" muted>
                    {match.venue || '장소 미정'}
                    {match.note ? ` · ${match.note}` : ''}
                  </Txt>
                </View>
                <Button
                  label={match.status === 'finished' ? '완료' : '완료 처리'}
                  tone="neutral"
                  small
                  onPress={() => saveMatch({ ...match, status: 'finished' })}
                />
              </Row>
            </View>
          ))}
      </Card>

      {!isLocalRepo ? (
        <Card>
          <Txt variant="h3">계정</Txt>
          <Txt variant="tiny" muted>
            로그아웃하면 이 기기에서 팀 데이터가 보이지 않아요. 데이터는 서버에 그대로 남아요.
          </Txt>
          <Button
            label="로그아웃"
            tone="neutral"
            onPress={async () => {
              await supabase?.auth.signOut();
            }}
          />
        </Card>
      ) : null}

      {isLocalRepo ? (
        <Card style={{ backgroundColor: p.warnSoft, borderColor: p.warnSoft }}>
          <Txt variant="h3" color={p.warn}>
            데모 모드
          </Txt>
          <Txt variant="small" color={p.warn}>
            지금 데이터는 이 기기에만 저장돼요. .env에 EXPO_PUBLIC_SUPABASE_URL과
            EXPO_PUBLIC_SUPABASE_ANON_KEY를 넣고 다시 실행하면 팀 전체가 같은 데이터를 봐요.
          </Txt>
        </Card>
      ) : null}
    </Screen>
  );
}

function roleLabel(role: string): string {
  return { manager: '감독', coach: '코치', treasurer: '총무', player: '선수' }[role] ?? role;
}
