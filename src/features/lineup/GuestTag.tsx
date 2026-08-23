import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 회원이 아니라는 표시. 이름 앞에 붙는 한 글자짜리 배지.
 *
 * 가끔 명단에 없는 용병이 온다. 회원으로 만들면 명단·참석률·회비 독촉에 계속 남아서
 * 안 오는 사람이 매주 미납자로 뜨기 때문에, 이름만 자리에 담고 여기에 N 을 붙인다.
 *
 * 목록·단톡방 글·공유 이미지에도 같이 나와야 한다. 한 곳이라도 빠뜨리면 그 사람은
 * 거기서만 사라진다.
 */
export function GuestTag() {
  const p = usePalette();
  return (
    <View
      style={{
        paddingHorizontal: 3,
        borderRadius: 3,
        backgroundColor: p.warnSoft,
        borderWidth: 1,
        borderColor: p.warnLine,
      }}
    >
      <Txt variant="tiny" color={p.warn} style={{ fontSize: 9, lineHeight: 12 }}>
        N
      </Txt>
    </View>
  );
}
