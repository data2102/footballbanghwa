import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useStore } from '@/lib/store';
import { hasWebOrigin, voteUrl } from '@/lib/links';
import { isLocalRepo } from '@/lib/repo';
import { shareMessage, shareText } from '@/lib/share';
import { formatDate } from '@/lib/format';
import { Button, Card, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';
import type { Match } from '@/lib/types';

/**
 * 가입 없이 참석만 받는 링크를 만들어 단톡방으로 보낸다.
 *
 * 팀원 열여섯을 전부 회원가입시키는 게 이 앱을 들이는 데 가장 큰 장벽이다.
 * 감독·총무만 앱을 쓰고 나머지는 링크만 누르면 되도록 둔다.
 */
export function ShareVoteLink({ teamName, match }: { teamName: string; match: Match }) {
  const p = usePalette();
  const ensureShareToken = useStore((state) => state.ensureShareToken);
  const [url, setUrl] = useState<string | null>(
    match.shareToken ? voteUrl(match.shareToken) : null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const message = (link: string) =>
    [
      `[${teamName}] ${formatDate(match.date)} ${match.kickoff} 참석 확인이에요.`,
      `${match.venue}${match.opponent ? ` · vs ${match.opponent}` : ''}`,
      '아래 링크에서 본인 이름 옆만 눌러 주세요. 가입 안 해도 돼요.',
      link,
    ].join('\n');

  async function makeAndShare() {
    setBusy(true);
    setNotice(null);
    try {
      const token = await ensureShareToken(match.id);
      if (!token) {
        setNotice('링크를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        return;
      }
      const link = voteUrl(token);
      setUrl(link);
      setNotice(shareMessage(await shareText(message(link))));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Txt variant="h3">참석 링크</Txt>
      <Txt variant="tiny" muted>
        링크를 받은 사람은 이 경기의 참석만 누를 수 있어요. 회비도 기록도 보이지 않아요.
      </Txt>

      {url ? (
        <TextInput
          editable={false}
          value={url}
          style={{
            backgroundColor: p.surfaceAlt,
            borderRadius: radius.sm,
            padding: space.md,
            color: p.textMuted,
            fontSize: 13,
          }}
        />
      ) : null}

      <Button
        label={url ? '링크 다시 보내기' : '참석 링크 만들어 보내기'}
        icon="message"
        tone="neutral"
        loading={busy}
        onPress={makeAndShare}
      />

      {notice ? (
        <Txt variant="small" color={p.ok}>
          {notice}
        </Txt>
      ) : null}

      {isLocalRepo ? (
        <Txt variant="tiny" muted>
          데모 모드에서는 이 링크가 이 기기에서만 열려요. Supabase를 연결하면 팀원 누구나 열 수 있어요.
        </Txt>
      ) : !hasWebOrigin ? (
        <View>
          <Txt variant="tiny" muted>
            앱에서 만든 링크는 같은 앱을 깐 사람만 열려요. 웹 주소로 보내려면 빌드할 때
            EXPO_PUBLIC_WEB_URL 을 넣어 주세요.
          </Txt>
        </View>
      ) : null}
    </Card>
  );
}
