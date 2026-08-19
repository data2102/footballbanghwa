/**
 * Claude structured outputs(`output_config.format`)에 넘길 JSON Schema.
 * src/lib/ai/contract.ts 의 타입과 짝을 이룬다. 한쪽을 고치면 다른 쪽도 고쳐야 한다.
 *
 * 항목별로 필드가 다르지만 oneOf 대신 "모든 필드를 가진 하나의 평평한 객체"로 정의한다.
 * 구조화 출력은 모든 프로퍼티가 required + nullable 일 때 가장 안정적이고,
 * 함수 쪽에서 kind 별로 정규화하면 되기 때문이다.
 */

const nullable = (type: string) => ({ type: [type, 'null'] });
const nullableEnum = (values: string[]) => ({ type: ['string', 'null'], enum: [...values, null] });

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
      ...nullable('string'),
      description: "lineup일 때 인식된 포메이션 문자열. 예: '4-3-3', '4-4-2'. 없으면 null.",
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
        ],
        properties: {
          kind: { type: 'string', enum: ['attendance', 'payment', 'lineup', 'event', 'profile'] },
          memberId: {
            ...nullable('string'),
            description: '명단에서 확실히 특정한 경우에만 그 id. 애매하면 반드시 null.',
          },
          memberName: { type: 'string', description: '원문에 적힌 이름/호칭 그대로.' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          quote: { type: 'string', description: '이 항목의 근거가 된 원문 조각(짧게).' },

          status: {
            ...nullableEnum(['attending', 'absent', 'late', 'unknown']),
            description: 'kind=attendance 일 때만. 그 외에는 null.',
          },
          note: {
            ...nullable('string'),
            description:
              "kind=attendance 일 때 사유나 예상 도착시각(예: '30분 늦음', '출장'), kind=profile 일 때 감독 메모.",
          },

          ledgerKind: {
            ...nullableEnum(['due', 'income', 'expense']),
            description: 'kind=payment 일 때만. 월 회비면 due, 그 외 수입 income, 지출 expense.',
          },
          amount: {
            ...nullable('integer'),
            description: 'kind=payment 일 때 원 단위 정수. 지출도 양수.',
          },
          period: {
            ...nullable('string'),
            description: "회비가 어느 달 몫인지 YYYY-MM. 명시 안 됐으면 입금월. 회비가 아니면 null.",
          },
          occurredOn: { ...nullable('string'), description: '발생일 YYYY-MM-DD. 모르면 null.' },
          memo: { ...nullable('string'), description: 'kind=payment 일 때 적요/메모.' },

          slotKey: {
            ...nullable('string'),
            description: "kind=lineup 일 때 포메이션 슬롯 키. 예: 'GK', 'DF1', 'MF2', 'FW3'. 순서를 알 수 없으면 null.",
          },
          group: {
            ...nullableEnum(['GK', 'DF', 'MF', 'FW']),
            description: 'kind=lineup 일 때 배치할 포지션, kind=profile 일 때 주 포지션.',
          },

          eventType: {
            ...nullableEnum(['goal', 'assist', 'save', 'yellow', 'red', 'own_goal']),
            description: 'kind=event 일 때 기록 종류.',
          },
          minute: { ...nullable('integer'), description: 'kind=event 일 때 경기 시작 후 분. 모르면 null.' },

          strengths: {
            type: ['array', 'null'],
            items: { type: 'string' },
            description:
              "kind=profile 일 때 새로 붙일 장점 태그. 짧은 명사구로. 예: ['왼발','헤딩','체력']. 그 외에는 null.",
          },
          backNumber: {
            ...nullable('integer'),
            description: 'kind=profile 일 때 등번호를 새로 정해준 경우에만. 그 외에는 null.',
          },
        },
      },
    },
  },
} as const;
