import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Txt, radius, space } from '@/components/ui';
import { Icon } from '@/components/icons';
import { usePalette } from '@/theme';

/**
 * 올린 사진을 화면 가득 띄워 보는 창.
 *
 * 화이트보드 사진이 그 쿼터에 누가 뛰었는지의 **원본**이다. 앱이 읽어 낸 이름이 맞는지
 * 대조하려면 자석 글씨가 읽힐 만큼 크게 보여야 하는데, 카드 안 미리보기로는 어림도 없다.
 * 판 하나에 스무 명이 붙는 데다 손으로 쓴 이름표도 섞인다.
 *
 * 확대는 두 단만 둔다 — 맞춤과 크게. 손가락으로 벌리는 확대는 웹과 네이티브에서 다르게
 * 동작해서, 어느 한쪽에서 "안 커지는" 사진이 된다. 두 단이면 어디서든 똑같이 커진다.
 */
export function PhotoViewer({
  uri,
  title,
  onClose,
}: {
  uri: string | null;
  title: string;
  onClose: () => void;
}) {
  const p = usePalette();
  const { width, height } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);

  if (!uri) return null;

  // 크게 볼 때는 화면 폭의 두 배로 그리고 좌우·위아래로 밀어 본다.
  const drawWidth = zoomed ? width * 2 : width;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: p.text }}>
        <View
          style={{
            paddingTop: space.xxxl,
            paddingHorizontal: space.lg,
            paddingBottom: space.sm,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
          }}
        >
          <Txt variant="small" color={p.surface} numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Txt>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            hitSlop={12}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
              paddingVertical: space.xs,
              paddingHorizontal: space.sm,
              borderRadius: radius.sm,
              backgroundColor: p.textMuted,
            }}
          >
            <Icon name="close" size={14} color={p.surface} />
            <Txt variant="tiny" color={p.surface}>
              닫기
            </Txt>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          maximumZoomScale={3}
          // 크게 볼 때는 위부터 붙인다. 가운데로 맞추면 위아래로 검은 여백이 크게 남는다.
          contentContainerStyle={{
            minHeight: zoomed ? undefined : height * 0.7,
            justifyContent: zoomed ? 'flex-start' : 'center',
          }}
        >
          <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
            <Pressable
              onPress={() => setZoomed((was) => !was)}
              accessibilityRole="button"
              accessibilityLabel={zoomed ? '사진 줄이기' : '사진 크게 보기'}
            >
              <Image
                source={{ uri }}
                resizeMode="contain"
                style={{ width: drawWidth, height: zoomed ? height * 1.6 : height * 0.72 }}
              />
            </Pressable>
          </ScrollView>
        </ScrollView>

        <Pressable
          onPress={() => setZoomed((was) => !was)}
          accessibilityRole="button"
          style={{ paddingVertical: space.lg, alignItems: 'center' }}
        >
          <Txt variant="tiny" color={p.surface}>
            {zoomed ? '사진을 누르면 다시 맞춰요' : '사진을 누르면 크게 볼 수 있어요'}
          </Txt>
        </Pressable>
      </View>
    </Modal>
  );
}
