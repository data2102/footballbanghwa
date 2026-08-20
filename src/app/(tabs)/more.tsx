import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { isLocalRepo } from '@/lib/repo';
import { Card, Divider, Row, Screen, SectionHeader, Txt, space } from '@/components/ui';
import { Icon, type IconName } from '@/components/icons';
import { usePalette } from '@/theme';
import { Pressable } from 'react-native';

/**
 * 가끔 여는 화면을 모아 둔다.
 *
 * 매주 여는 것(참석·출전·회비)과 가끔 여는 것(기록·분석·설정)을 같은 줄에 두면
 * 탭바가 여섯 개로 꽉 차서 더 못 넣는다. 자주 쓰는 쪽에 자리를 내준다.
 */
type Entry = { icon: IconName; title: string; help: string; path: string };

const ENTRIES: Entry[] = [
  { icon: 'chart', title: '기록', help: '랭킹 여섯 가지와 경기별 기록', path: '/stats' },
  { icon: 'users', title: '출결 분석', help: '참석률과 답 안 한 횟수', path: '/analysis' },
  { icon: 'message', title: '공지 만들기', help: '틀을 고르면 문구가 나와요', path: '/notice' },
  { icon: 'book', title: '문구 보관함', help: '자주 쓰는 글을 저장해 두고 꺼내 써요', path: '/templates' },
  { icon: 'book', title: '회칙', help: '단톡방에 붙여넣을 회칙', path: '/rules' },
  { icon: 'wallet', title: '물품 재고', help: '조끼·공·콘이 몇 개 남았나', path: '/inventory' },
  { icon: 'person', title: '팀 설정', help: '팀 이름, 회비, 경기 만들기', path: '/settings' },
];

export default function MoreScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);

  if (!data) return null;

  return (
    <Screen>
      <SectionHeader title={data.team.name} />

      <Card style={{ padding: space.sm, gap: 0 }}>
        {ENTRIES.map((entry, index) => (
          <View key={entry.path}>
            {index > 0 ? <Divider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={entry.title}
              onPress={() => router.push(entry.path as never)}
              style={({ pressed }) => ({
                padding: space.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Row justify="space-between">
                <Row gap={space.md} style={{ flex: 1, minWidth: 0 }}>
                  <Icon name={entry.icon} size={20} color={p.textMuted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="h3">{entry.title}</Txt>
                    <Txt variant="tiny" muted>
                      {entry.help}
                    </Txt>
                  </View>
                </Row>
                <Icon name="chevron" size={18} color={p.textFaint} />
              </Row>
            </Pressable>
          </View>
        ))}
      </Card>

      {isLocalRepo ? (
        <Card style={{ backgroundColor: p.warnSoft, borderColor: p.warnSoft }}>
          <Txt variant="h3" color={p.warn}>
            데모 모드
          </Txt>
          <Txt variant="small" color={p.warn}>
            지금 데이터는 이 기기에만 저장돼요. 예시로 채워 둔 팀이라 마음껏 눌러 보셔도 돼요.
          </Txt>
        </Card>
      ) : null}
    </Screen>
  );
}
