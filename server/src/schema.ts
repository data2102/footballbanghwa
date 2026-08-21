/**
 * Claude structured outputs(`output_config.format`)에 넘길 JSON Schema.
 * src/lib/ai/contract.ts 의 타입과 짝을 이룬다. 한쪽을 고치면 다른 쪽도 고쳐야 한다.
 *
 * 항목별로 필드가 다르지만 oneOf 대신 "모든 필드를 가진 하나의 평평한 객체"로 정의한다.
 * 구조화 출력은 모든 프로퍼티가 required 일 때 가장 안정적이고,
 * 함수 쪽에서 kind 별로 정규화하면 되기 때문이다.
 */

/*
 * 비어 있는 칸을 null 로 두지 않는다. 대신 "없음"을 뜻하는 값을 정해 둔다.
 *
 * 처음에는 type: ['string','null'] 로 적었다가 enum 과 같이 오면 거절당했고,
 * anyOf 로 바꾸니 이번엔 이렇게 거절당했다:
 *
 *   Schemas contains too many parameters with union types
 *   (17 parameters with type arrays or anyOf)
 *
 * 항목 하나가 다섯 종류(참석·회비·라인업·기록·프로필)를 한 객체로 받다 보니
 * 비울 수 있는 칸이 열일곱 개다. union 을 줄이는 게 아니라 아예 없앤다.
 *
 *   글자  -> ''     빈 문자열
 *   숫자  -> -1     (금액은 0)
 *   갈래  -> 'none'
 *   목록  -> []     빈 배열
 *
 * 함수의 normalizeItem 이 이 값들을 다시 null 로 바꿔 앱에 넘긴다.
 * 그래서 앱 타입(contract.ts)은 그대로다 — 이 약속은 함수 안에서 끝난다.
 */
/** 없음을 뜻하는 값들. 프롬프트와 normalizeItem 이 같은 값을 쓴다. */
export const NONE = { text: '', num: -1, choice: 'none', amount: 0 } as const;

const optionalEnum = (values: string[]) => ({ type: 'string', enum: [...values, NONE.choice] });

export const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'formation', 'items', 'unmatched', 'summary'],
  properties: {
    intent: {
      type: 'string',
      enum: ['attendance', 'payment', 'lineup', 'event', 'profile', 'mixed', 'unknown'],
      description: '입력 전체가 무엇에 관한 것인지. 여러 종류가 섞였으면 mixed.',
    },
    formation: {
      type: 'string',
      description: "lineup일 때 인식된 포메이션 문자열. 예: '4-3-3', '4-4-2'. 없으면 ''.",
    },
    unmatched: {
      type: 'array',
      items: { type: 'string' },
      description: '원문에 등장했지만 명단에서 특정하지 못한 사람 이름들.',
    },
    summary: {
      type: 'string',
      description: "검토 화면 상단에 띄울 한 줄 한국어 요약. 예: '참석 9명, 불참 3명, 지각 1명으로 읽었습니다.'",
    },
    items: {
      type: 'array',
      description: '사용자가 체크박스로 하나씩 검토할 수 있도록 사람/건 단위로 쪼갠 결과.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'kind',
          'memberId',
          'memberName',
          'confidence',
          'quote',
          'status',
          'note',
          'ledgerKind',
          'amount',
          'period',
          'occurredOn',
          'memo',
          'slotKey',
          'group',
          'eventType',
          'minute',
          'strengths',
          'backNumber',
          'quarter',
          'side',
        ],
        properties: {
          kind: { type: 'string', enum: ['attendance', 'payment', 'lineup', 'event', 'profile'] },
          memberId: {
            type: 'string',
            description: "명단에서 확실히 특정한 경우에만 그 id. 애매하면 반드시 '' (빈 문자열).",
          },
          memberName: { type: 'string', description: '원문에 적힌 이름/호칭 그대로.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          quote: { type: 'string', description: '이 항목의 근거가 된 원문 조각(짧게).' },

          status: {
            ...optionalEnum(['attending', 'absent', 'late', 'unknown', 'pending']),
            description:
              "kind=attendance 일 때만. 그 외에는 'none'. pending 은 아직 투표를 안 한 사람.",
          },
          note: {
            type: 'string',
            description:
              "kind=attendance 일 때 사유나 예상 도착시각(예: '30분 늦음', '출장'), kind=profile 일 때 감독 메모.",
          },

          ledgerKind: {
            ...optionalEnum(['due', 'income', 'expense']),
            description: "kind=payment 일 때만. 월 회비면 due, 그 외 수입 income, 지출 expense. 아니면 'none'.",
          },
          amount: {
            type: 'integer',
            description: 'kind=payment 일 때 원 단위 정수. 지출도 양수. 회비가 아니면 0.',
          },
          period: {
            type: 'string',
            description: "회비가 어느 달 몫인지 YYYY-MM. 명시 안 됐으면 입금월. 회비가 아니면 ''.",
          },
          occurredOn: { type: 'string', description: "발생일 YYYY-MM-DD. 모르면 ''." },
          memo: { type: 'string', description: "kind=payment 일 때 적요/메모. 없으면 ''." },

          slotKey: {
            type: 'string',
            description: "kind=lineup 일 때 포메이션 슬롯 키. 예: 'GK', 'DF1', 'MF2', 'FW3'. 순서를 알 수 없으면 ''.",
          },
          group: {
            ...optionalEnum(['GK', 'DF', 'MF', 'FW']),
            description: "kind=lineup 일 때 배치할 포지션, kind=profile 일 때 주 포지션. 그 외에는 'none'.",
          },

          eventType: {
            ...optionalEnum(['goal', 'assist', 'save', 'yellow', 'red', 'own_goal']),
            description: "kind=event 일 때 기록 종류. 그 외에는 'none'.",
          },
          minute: { type: 'integer', description: 'kind=event 일 때 경기 시작 후 분. 모르면 -1.' },

          strengths: {
            type: 'array',
            items: { type: 'string' },
            description:
              "kind=profile 일 때 새로 붙일 장점 태그. 짧은 명사구로. 예: ['왼발','헤딩','체력']. 그 외에는 [].",
          },
          backNumber: {
            type: 'integer',
            description: 'kind=profile 일 때 등번호를 새로 정해준 경우에만(0~99). 그 외에는 -1.',
          },

          quarter: {
            type: 'integer',
            description:
              'kind=lineup 일 때 몇 쿼터의 라인업인지(1~6). 화이트보드에 안 적혀 있으면 -1.',
          },
          side: {
            ...optionalEnum(['A', 'B']),
            description:
              "kind=lineup 일 때 두 팀 중 어느 쪽인지. 화이트보드 왼쪽/위가 A, 오른쪽/아래가 B. 한 팀만 있으면 A. 판단이 안 되면 'none'.",
          },
        },
      },
    },
  },
} as const;

/**
 * 투표 사진 전용 짧은 스키마. 사람마다 번호 하나만 받는다.
 *
 * PARSE_SCHEMA 는 항목 하나에 스무 칸을 전부 required 로 요구한다. 한 사람에 약 115토큰이라
 * 아흔 명이면 출력만 1만 토큰이고, 그걸 쓰는 데 걸리는 시간이 Edge Function 한도(150초)를
 * 그대로 넘겼다 — WORKER_RESOURCE_LIMIT. 모델을 빠른 것으로 바꿔도 벽이 그대로 있었다.
 *
 * 투표 화면은 "누가 어느 칸에 있나"만 알면 되는 일이라 번호로 받는다. 사람당 네댓 토큰이라
 * 같은 아흔 명이 400토큰으로 끝난다. 앱에 돌려줄 때 함수가 다시 항목으로 펼치므로
 * 앱 타입(contract.ts)은 그대로다 — 이 약속도 함수 안에서 끝난다.
 *
 * 여기에도 union 은 없다. 전부 required 이고 빈 칸은 빈 배열이다.
 */
const indexList = (what: string) => ({
  type: 'array',
  items: { type: 'integer' },
  description: `${what} 사람들의 명단 번호. 없으면 빈 배열 [].`,
});

export const ROSTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['attending', 'absent', 'late', 'pending', 'unmatched', 'summary'],
  properties: {
    attending: indexList('참석한'),
    absent: indexList('불참한'),
    late: indexList('지각·늦참으로 적힌'),
    pending: indexList('미참여(아직 투표 안 함)'),
    unmatched: {
      type: 'array',
      items: { type: 'string' },
      description: '화면에는 있는데 명단에서 못 찾은 이름들. 글자 그대로 넣는다.',
    },
    summary: {
      type: 'string',
      description: "검토 화면 위에 띄울 한 줄 한국어 요약. 예: '참석 15명, 불참 4명으로 읽었어요.'",
    },
  },
} as const;
