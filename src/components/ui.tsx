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
import { CONTENT_MAX_WIDTH, font, numeric, Palette, radius, space, usePalette } from '@/theme';
import { Icon, type IconName } from '@/components/icons';

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
      // 떠 있는 입력 버튼(약 44px)과 그 여백만큼 아래를 비워 둔다.
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + 88 }]}
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
  tabular,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: keyof typeof font;
  muted?: boolean;
  color?: string;
  /** 숫자가 세로로 줄 맞아야 하는 곳(장부·랭킹)에 켠다. */
  tabular?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const p = usePalette();
  // tiny 는 캡션·메타 전용이라, muted 를 켜면 한 단계 더 옅은 회색으로 간다.
  const mutedColor = variant === 'tiny' ? p.textFaint : p.textMuted;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        font[variant],
        tabular && numeric,
        { color: color ?? (muted ? mutedColor : p.text) },
        style,
      ]}
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
  icon,
  disabled,
  loading,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  // 채운 파란 버튼은 화면당 하나만. 나머지는 테두리(neutral)로 둔다.
  const bg = { primary: p.primaryStrong, neutral: 'transparent', danger: 'transparent' }[tone];
  const fg = { primary: p.onPrimary, neutral: p.text, danger: p.danger }[tone];
  const borderColor = { primary: 'transparent', neutral: p.borderStrong, danger: p.dangerSoft }[tone];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          // 터치 타겟 44px 을 맞추려고 세로 여백을 넉넉히 둔다.
          paddingVertical: small ? space.sm : 13,
          paddingHorizontal: small ? space.md : space.lg,
          flexDirection: 'row',
          gap: space.sm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: off ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 15 : 17} color={fg} /> : null}
          <Text style={[small ? font.small : font.h3, { color: fg, fontWeight: '500' }]}>{label}</Text>
        </>
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
  const fg = tone ? tone.fg : selected ? p.primaryStrong : p.textMuted;
  const bg = tone ? tone.bg : selected ? p.primarySoft : p.surface;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: tone ? tone.bg : selected ? p.primarySoft : p.border,
          borderRadius: radius.pill,
          paddingVertical: 6,
          paddingHorizontal: space.md,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <Text style={[font.small, { color: fg, fontWeight: '500' }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * 작은 수를 올리고 내리는 조작. 출전 쿼터처럼 0~6 사이를 오가는 값에 쓴다.
 *
 * 운동장에서 숫자를 타이핑하게 두지 않는다. 장갑 낀 손으로도 눌리도록
 * 터치 타겟을 36px 로 잡고, 한계에 닿으면 버튼을 흐리게 해서 더 못 누르는 걸 보여 준다.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9,
  suffix,
  accessibilityLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  };
  const key = (delta: number, label: string, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel ?? ''} ${label}`.trim()}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => step(delta)}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: disabled ? p.border : p.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Text style={[font.h3, { color: disabled ? p.textDisabled : p.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      {key(-1, '−', value <= min)}
      <Text
        style={[
          font.h3,
          numeric,
          { color: value > 0 ? p.text : p.textFaint, minWidth: 52, textAlign: 'center' },
        ]}
      >
        {value}
        {suffix ? <Text style={[font.tiny, { color: p.textFaint }]}> {suffix}</Text> : null}
      </Text>
      {key(1, '+', value >= max)}
    </View>
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
        minWidth: 68,
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
        borderColor: checked ? p.primary : p.borderStrong,
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
        backgroundColor: tone ?? p.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: p.textMuted, fontWeight: '500', fontSize: size * 0.36 }}>
        {name.slice(-2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.md, flexGrow: 1 },
});

/** 켜고 끄는 스위치. 라벨을 눌러도 토글된다(터치 타겟 44px 확보). */
export function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: 44 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h3">{label}</Txt>
        {help ? (
          <Txt variant="tiny" muted>
            {help}
          </Txt>
        ) : null}
      </View>
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: radius.pill,
          padding: 3,
          backgroundColor: value ? p.primary : p.borderStrong,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: p.surface,
            transform: [{ translateX: value ? 18 : 0 }],
          }}
        />
      </View>
    </Pressable>
  );
}

/** 진행률 막대. 회비 걷힌 비율처럼 "몇 분의 몇"이 한눈에 보여야 할 때. */
export function Progress({ value }: { value: number }) {
  const p = usePalette();
  const ratio = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(ratio * 100), min: 0, max: 100 }}
      style={{ height: 8, backgroundColor: p.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden' }}
    >
      <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: p.primary }} />
    </View>
  );
}

/** 화면 안에서 큰 숫자 하나를 주인공으로 쓸 때. 화면당 한 번만. */
export function Hero({
  label,
  value,
  suffix,
  tone,
  caption,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: string;
  caption?: string;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="tiny" muted>
        {label}
      </Txt>
      <Row gap={space.xs} align="baseline">
        <Text style={[font.display, { color: tone ?? p.text }]}>{value}</Text>
        {suffix ? (
          <Text style={[font.body, { color: p.textFaint }]}>{suffix}</Text>
        ) : null}
      </Row>
      {caption ? (
        <Txt variant="tiny" muted>
          {caption}
        </Txt>
      ) : null}
    </View>
  );
}

export { space, radius, font, numeric, usePalette };
