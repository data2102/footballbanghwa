import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONTENT_MAX_WIDTH, font, Palette, radius, space, usePalette } from '@/theme';

/** 화면 공통 래퍼. 가로 폭 제한 + 하단 탭에 가리지 않을 만큼의 여백. */
export function Screen({
  children,
  scroll = true,
  refreshing,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const inner = (
    <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: space.md }}>
      {children}
    </View>
  );

  if (!scroll) {
    return <View style={[styles.screen, { backgroundColor: p.bg }]}>{inner}</View>;
  }
  return (
    <ScrollView
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + space.xxl * 2 }]}
      keyboardShouldPersistTaps="handled"
    >
      {refreshing ? <ActivityIndicator color={p.primary} /> : null}
      {inner}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const p = usePalette();
  const base: ViewStyle = {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable style={({ pressed }) => [base, pressed && { opacity: 0.7 }, style]} onPress={onPress}>
      {children}
    </Pressable>
  );
}

export function Txt({
  children,
  variant = 'body',
  muted,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: keyof typeof font;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const p = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[font[variant], { color: color ?? (muted ? p.textMuted : p.text) }, style]}
    >
      {children}
    </Text>
  );
}

export function Row({
  children,
  gap = space.sm,
  align = 'center',
  justify,
  wrap,
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: align, justifyContent: justify, gap },
        wrap && { flexWrap: 'wrap' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonTone = 'primary' | 'neutral' | 'danger';

export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled,
  loading,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const bg = { primary: p.primary, neutral: p.surfaceAlt, danger: p.dangerSoft }[tone];
  const fg = { primary: p.onPrimary, neutral: p.text, danger: p.danger }[tone];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingVertical: small ? space.sm : space.md,
          paddingHorizontal: small ? space.md : space.lg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: off ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[small ? font.small : font.h3, { color: fg, fontWeight: '700' }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: { fg: string; bg: string };
}) {
  const p = usePalette();
  const fg = tone ? tone.fg : selected ? p.onPrimary : p.textMuted;
  const bg = tone ? tone.bg : selected ? p.primary : p.surfaceAlt;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: 6,
          paddingHorizontal: space.md,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[font.small, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

/** 좌우로 나열되는 라디오형 선택. 상태 필터, 포메이션 선택 등에 쓴다. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: p.surfaceAlt, borderRadius: radius.md, padding: 3 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              paddingVertical: space.sm,
              borderRadius: radius.sm,
              alignItems: 'center',
              backgroundColor: active ? p.surface : 'transparent',
            }}
          >
            <Text style={[font.small, { color: active ? p.text : p.textMuted, fontWeight: '700' }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row justify="space-between" style={{ marginTop: space.sm }}>
      <Txt variant="h2">{title}</Txt>
      {action}
    </Row>
  );
}

export function Empty({ text }: { text: string }) {
  const p = usePalette();
  return (
    <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
      <Txt variant="small" muted style={{ textAlign: 'center', lineHeight: 20 }}>
        {text}
      </Txt>
      <View style={{ height: 1, backgroundColor: p.border, width: 0 }} />
    </View>
  );
}

/** 대시보드 숫자 타일. */
export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const p = usePalette();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: p.surfaceAlt,
        borderRadius: radius.md,
        padding: space.md,
        gap: 2,
        minWidth: 72,
      }}
    >
      <Txt variant="tiny" muted>
        {label}
      </Txt>
      <Txt variant="h2" color={tone}>
        {value}
      </Txt>
    </View>
  );
}

export function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      hitSlop={8}
      style={{
        width: 24,
        height: 24,
        borderRadius: radius.sm,
        borderWidth: 2,
        borderColor: checked ? p.primary : p.border,
        backgroundColor: checked ? p.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Text style={{ color: p.onPrimary, fontSize: 14, fontWeight: '900' }}>✓</Text> : null}
    </Pressable>
  );
}

export function Divider() {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border }} />;
}

/** 회원 이니셜 원형 아바타. 사진 업로드 전까지의 자리표시. */
export function Avatar({ name, size = 34, tone }: { name: string; size?: number; tone?: string }) {
  const p = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone ?? p.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: p.primary, fontWeight: '800', fontSize: size * 0.38 }}>
        {name.slice(-2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.md, flexGrow: 1 },
});

export { space, radius, font, usePalette };
