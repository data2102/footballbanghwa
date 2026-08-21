import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * 아웃라인 아이콘 한 세트. 24px 그리드, stroke 1.75, 색은 부모에서 내려받는다.
 * 이모지와 섞지 않는다 — 플랫폼마다 모양이 달라지고 디자인 시스템 규칙에도 어긋난다.
 */
export type IconName =
  | 'calendar'
  | 'users'
  | 'field'
  | 'wallet'
  | 'chart'
  | 'person'
  | 'message'
  | 'check'
  | 'alert'
  | 'close'
  | 'plus'
  | 'chevron'
  | 'swap'
  | 'camera'
  | 'image'
  | 'search'
  | 'trash'
  | 'menu'
  | 'book'
  | 'edit';

type Props = { name: IconName; size?: number; color: string };

export function Icon({ name, size = 22, color }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'calendar':
      return (
        <Svg {...common}>
          <Rect x="3" y="5" width="18" height="16" rx="2.5" />
          <Path d="M8 3v4M16 3v4M3 10h18" />
        </Svg>
      );
    case 'users':
      return (
        <Svg {...common}>
          <Circle cx="9" cy="8" r="3.2" />
          <Path d="M3 20c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2" />
          <Path d="M16.5 5.6a3 3 0 0 1 0 5.6M18 20c0-2.2-.6-3.7-1.6-4.7" />
        </Svg>
      );
    case 'field':
      return (
        <Svg {...common}>
          <Rect x="3" y="4" width="18" height="16" rx="2.5" />
          <Path d="M3 12h18" />
          <Circle cx="12" cy="12" r="2.6" />
          <Path d="M8 4v2.6h8V4M8 20v-2.6h8V20" />
        </Svg>
      );
    case 'wallet':
      return (
        <Svg {...common}>
          <Rect x="3" y="6" width="18" height="13" rx="2.5" />
          <Path d="M3 10h18M16.5 14.5h1.5" />
        </Svg>
      );
    case 'menu':
      return (
        <Svg {...common}>
          <Path d="M4 7h16M4 12h16M4 17h16" />
        </Svg>
      );
    case 'book':
      return (
        <Svg {...common}>
          <Path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z" />
          <Path d="M5 4v16" />
        </Svg>
      );
    case 'chart':
      return (
        <Svg {...common}>
          <Path d="M4 20h16M7 20v-5M12 20v-9M17 20v-6" />
        </Svg>
      );
    case 'person':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="8" r="3.4" />
          <Path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
        </Svg>
      );
    case 'message':
      return (
        <Svg {...common}>
          <Rect x="3" y="4" width="18" height="13" rx="3" />
          <Path d="M8.5 17 6 21v-4M8 9h8M8 12.5h5" />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...common}>
          <Path d="M4.5 12.5 9 17 19.5 6.5" />
        </Svg>
      );
    case 'alert':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7.5v5.5M12 16.2v.1" />
        </Svg>
      );
    case 'close':
      return (
        <Svg {...common}>
          <Path d="M6 6l12 12M18 6 6 18" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...common}>
          <Path d="M12 5v14M5 12h14" />
        </Svg>
      );
    case 'chevron':
      return (
        <Svg {...common}>
          <Path d="M9 5.5 15.5 12 9 18.5" />
        </Svg>
      );
    case 'swap':
      return (
        <Svg {...common}>
          <Path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5" />
          <Path d="M20 16H7M10.5 12.5 7 16l3.5 3.5" />
        </Svg>
      );
    case 'camera':
      return (
        <Svg {...common}>
          <Path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
          <Circle cx="12" cy="13.5" r="3.4" />
        </Svg>
      );
    case 'image':
      return (
        <Svg {...common}>
          <Rect x="3" y="5" width="18" height="14" rx="2.5" />
          <Circle cx="8.5" cy="10" r="1.6" />
          <Path d="m4 17 4.5-4.5L12 16l3-2.8L20 18" />
        </Svg>
      );
    case 'search':
      return (
        <Svg {...common}>
          <Circle cx="11" cy="11" r="6.5" />
          <Path d="m16 16 4 4" />
        </Svg>
      );
    case 'trash':
      return (
        <Svg {...common}>
          <Path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.8 12.2h9.4L17.5 7" />
        </Svg>
      );
    case 'edit':
      return (
        <Svg {...common}>
          {/* 연필. 고칠 수 있는 자리에만 쓴다 — 이름, 메모처럼 눌러서 바꾸는 것. */}
          <Path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
          <Path d="M13.5 7 17 10.5" />
        </Svg>
      );
  }
}
