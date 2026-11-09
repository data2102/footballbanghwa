#!/usr/bin/env node
/**
 * 총무의 회원명단 엑셀(풀리스트)을 Supabase 에 맞출 SQL 로 바꾼다.
 *
 *   npm run import:members -- <엑셀> [팀id] > import-members.sql
 *
 * 나온 SQL 을 Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 한다. 키는 필요 없다.
 * 엑셀도 SQL 도 커밋하지 않는다 — 실명이 들어 있다(.gitignore 의 import-*.sql).
 *
 * 엑셀에서 읽는 것 (머리글 줄은 '성명' 칸이 있는 줄을 찾는다):
 *   성명 | 연령대 | (초반/후반) | 등번호 | 사이즈(상) | 사이즈(하) | 비고1 | 비고2
 *   비고에 '탈퇴'  → 명단에서 뺀다(active = false). 없던 사람은 새로 만들지 않는다.
 *   비고에 '미지급' → 유니폼 아직 안 받음.
 *   비고에 '골키퍼' → 포지션에 GK 를 붙인다.
 *
 * **생년월일·전화번호는 옮기지 않는다.** 앱에는 그 칸이 없고, 팀원 누구나 명단을 보는
 * 자리에 남의 번호를 둘 이유가 없다. 연령대·초반후반은 엑셀에 적힌 그대로 쓴다 —
 * 이 팀은 70대도 "60대 후반", 39세도 "40대 초반"으로 넣어서 나이로 계산하면 틀린다.
 *
 * 이미 있는 회원과는 **이름으로** 맞춘다. 앱에서 "김영호(40대후반)"처럼 고쳐 둔 이름과
 * 카톡 별명(aliases)도 같은 사람으로 본다. 같은 이름이 여럿이면 연령대로 한 번 더 가르고,
 * 그래도 갈리지 않으면 건드리지 않고 NOTICE 로 알린다 — 엉뚱한 사람의 사이즈를 덮는 것보다
 * 한 명을 손으로 고치는 게 싸다. 이름은 덮어쓰지 않는다.
 */
import ExcelJS from 'exceljs';

const path = process.argv[2];
if (!path) {
  console.error('쓰는 법: npm run import:members -- <엑셀 경로> [팀id] > import-members.sql');
  process.exit(1);
}
const teamId = process.argv[3];
if (teamId && !/^[0-9a-f-]{36}$/i.test(teamId)) {
  console.error(`팀 id 가 uuid 모양이 아니에요: ${teamId}`);
  process.exit(1);
}

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlOrNull = (value) => (value == null ? 'null' : q(value));

/** 셀 값을 글자로. 수식 칸은 결과값, 서식 있는 글은 이어 붙인다. */
function text(cell) {
  let value = cell?.value;
  if (value && typeof value === 'object') {
    if ('result' in value) value = value.result;
    else if ('richText' in value) value = value.richText.map((part) => part.text).join('');
    else if ('text' in value) value = value.text;
  }
  return String(value ?? '').trim();
}

/** '60대' → '60', 34 → '30'. 20~60 밖이면 모름. */
function toBand(raw) {
  const n = Number(String(raw).replace(/[^0-9]/g, ''));
  if (!n) return null;
  const band = String(Math.floor(n / 10) * 10);
  return ['20', '30', '40', '50', '60'].includes(band) ? band : null;
}

function toHalf(raw) {
  if (raw.includes('초')) return 'early';
  if (raw.includes('후')) return 'late';
  return null;
}

/** 앱의 normalizeSize 와 같은 규칙. 'xxl' 과 '2XL' 이 다른 칸이 되면 집계가 갈린다. */
function toSize(raw) {
  const t = raw.toUpperCase().replace(/\s+/g, '');
  if (!t) return null;
  const xs = /^(X+)L$/.exec(t);
  if (xs && xs[1].length >= 2) return `${xs[1].length}XL`;
  return t;
}

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(path);
const sheet = book.getWorksheet('풀리스트') ?? book.worksheets[0];

// 머리글 줄을 찾는다. 위에 제목 줄이 몇 줄 있든 따라간다.
let headerRow = null;
const col = {};
sheet.eachRow((row, r) => {
  if (headerRow) return;
  row.eachCell((cell, c) => {
    const t = text(cell).replace(/\s/g, '');
    if (t === '성명') headerRow = r;
  });
  if (headerRow !== r) return;
  row.eachCell((cell, c) => {
    const t = text(cell).replace(/\s/g, '');
    if (t === '성명') col.name = c;
    else if (t === '연령대') col.band = c;
    else if (t === '등번호') col.number = c;
    else if (t.startsWith('사이즈') && t.includes('상')) col.top = c;
    else if (t.startsWith('사이즈') && t.includes('하')) col.bottom = c;
    else if (t.startsWith('비고')) (col.notes ??= []).push(c);
  });
});

if (!headerRow || !col.name || !col.band) {
  console.error("머리글에서 '성명'·'연령대' 칸을 못 찾았어요. 시트를 확인해 주세요.");
  process.exit(1);
}

const people = [];
for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
  const row = sheet.getRow(r);
  const name = text(row.getCell(col.name));
  if (!name) continue;
  const notes = (col.notes ?? []).map((c) => text(row.getCell(c))).join(' ');
  const numberText = col.number ? text(row.getCell(col.number)) : '';
  const number = /^\d{1,3}$/.test(numberText) ? Number(numberText) : null;
  const top = col.top ? toSize(text(row.getCell(col.top))) : null;
  const bottom = col.bottom ? toSize(text(row.getCell(col.bottom))) : null;
  const pending = notes.includes('미지급');
  people.push({
    name,
    band: toBand(text(row.getCell(col.band))),
    // 연령대 바로 옆 칸이 초반·후반이다(머리글이 비어 있다).
    half: toHalf(text(row.getCell(col.band + 1))),
    number,
    top,
    bottom,
    // 미지급이라고 적혔으면 아직, 번호나 사이즈가 있으면 받음, 아무것도 없으면 모름.
    issued: pending ? false : number != null || top || bottom ? true : null,
    keeper: notes.includes('골키퍼'),
    left: notes.includes('탈퇴'),
  });
}

const active = people.filter((person) => !person.left);
const left = people.filter((person) => person.left);
const out = [];
out.push(`-- ${path} 에서 만든 회원 맞춤 SQL`);
out.push(`-- 회원 ${active.length}명 · 탈퇴 ${left.length}명`);
out.push('-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요. 두 번 돌려도 같은 결과예요.');
out.push('-- 끝나면 Messages 탭(NOTICE)에 고친 수·새로 만든 수·건너뛴 사람이 나와요.');
out.push('');
out.push('begin;');
out.push('');
out.push('do $$');
out.push('declare');
out.push('  v_team uuid;');
out.push('  v_ids uuid[];');
out.push("  v_used uuid[] := '{}';");
out.push('  v_updated int := 0;');
out.push('  v_inserted int := 0;');
out.push('  v_left int := 0;');
out.push('  v_skipped int := 0;');
out.push('begin');
out.push("  -- 칸이 없으면 알아보기 힘든 오류로 멈춘다. 먼저 본다.");
out.push('  if not exists (');
out.push('    select 1 from information_schema.columns');
out.push("     where table_schema = 'public' and table_name = 'members' and column_name = 'uniform_issued'");
out.push('  ) then');
out.push("    raise exception '스키마가 최신이 아닙니다. 먼저 npm run db:push 를 하세요.';");
out.push('  end if;');
out.push('');
if (teamId) {
  out.push(`  select id into v_team from public.teams where id = ${q(teamId)};`);
  out.push(`  if v_team is null then raise exception '팀 ${teamId} 를 찾지 못했습니다.'; end if;`);
} else {
  out.push('  -- 팀을 안 골랐으니 가장 먼저 만든 팀에 넣는다. 여러 팀이면 스크립트에 팀 id 를 넘기세요.');
  out.push('  select id into v_team from public.teams order by created_at limit 1;');
  out.push("  if v_team is null then raise exception '팀이 없습니다. 앱에서 팀을 먼저 만들어 주세요.'; end if;");
}
out.push('');

/**
 * 이 사람으로 보이는 회원 id 들을 v_ids 에 담는 SQL.
 *
 * 1. 이름이 같거나, "이름(...)" 으로 고쳐 뒀거나, 카톡 별명에 그 이름이 있는 회원.
 * 2. 이번 실행에서 이미 다른 줄과 맞춘 회원은 뺀다. 엑셀에 김영호가 둘이면 둘이 한 줄을
 *    차례로 덮어 버린다 — 실제로 시험 DB 에서 그렇게 됐다.
 * 3. 이름 뒤에 "(40대후반)" 처럼 연령대를 적어 둔 회원은 그 연령대일 때만 맞는다.
 * 4. 그래도 여럿이면 괄호 표시가 정확히 맞는 쪽 → 연령대 → 초반·후반 순으로 좁힌다.
 */
function findSql(person) {
  const label = person.band ? `${person.band}대` : null;
  const halfLabel = person.half === 'early' ? '초반' : person.half === 'late' ? '후반' : '';
  const suffix = "regexp_replace(coalesce(substring(name from '\\(([^)]*)\\)$'), ''), '\\s', '', 'g')";
  const byName = `(name = ${q(person.name)} or name like ${q(`${person.name}(%`)} or ${q(person.name)} = any(aliases))`;
  // 괄호 안에 연령대를 적어 둔 다른 사람은 뺀다.
  const otherLabel = label
    ? `(${suffix} like '%대%' and (${suffix} not like ${q(`%${label}%`)}` +
      (halfLabel
        ? ` or ((${suffix} like '%초반%' or ${suffix} like '%후반%') and ${suffix} not like ${q(`%${halfLabel}%`)})`
        : '') +
      '))'
    : 'false';
  const bandSql = person.band ? `${q(person.band)}::public.age_band` : 'null';
  return [
    `  select array_agg(id) into v_ids from public.members`,
    `   where team_id = v_team and ${byName} and not (id = any(v_used)) and not ${otherLabel};`,
    ...(label
      ? [
          '  if coalesce(array_length(v_ids, 1), 0) > 1 then',
          `    select coalesce(array_agg(id), v_ids) into v_ids from public.members where id = any(v_ids) and ${suffix} like ${q(`%${label}${halfLabel}%`)};`,
          '  end if;',
        ]
      : []),
    '  if coalesce(array_length(v_ids, 1), 0) > 1 then',
    `    select coalesce(array_agg(id), v_ids) into v_ids from public.members where id = any(v_ids) and age_band is not distinct from ${bandSql};`,
    '  end if;',
    '  if coalesce(array_length(v_ids, 1), 0) > 1 then',
    `    select coalesce(array_agg(id), v_ids) into v_ids from public.members where id = any(v_ids) and (age_half is null or age_half = ${sqlOrNull(person.half)});`,
    '  end if;',
    '  if coalesce(array_length(v_ids, 1), 0) = 1 then v_used := v_used || v_ids[1]; end if;',
  ];
}

for (const person of active) {
  const fields = [
    `back_number = ${person.number ?? 'null'}`,
    `age_band = ${person.band ? `${q(person.band)}::public.age_band` : 'null'}`,
    `age_half = ${sqlOrNull(person.half)}`,
    `top_size = ${sqlOrNull(person.top)}`,
    `bottom_size = ${sqlOrNull(person.bottom)}`,
    `uniform_issued = ${person.issued == null ? 'null' : person.issued}`,
    'active = true',
  ];
  if (person.keeper) {
    fields.push("positions = case when 'GK' = any(positions) then positions else array_prepend('GK'::public.position_group, positions) end");
    fields.push("preferred_position = coalesce(preferred_position, 'GK')");
  }
  const label = `${person.name}${person.band ? ` (${person.band}대)` : ''}`;
  out.push(`  -- ${label}`);
  out.push(...findSql(person));
  out.push('  if coalesce(array_length(v_ids, 1), 0) = 1 then');
  out.push(`    update public.members set ${fields.join(', ')} where id = v_ids[1];`);
  out.push('    v_updated := v_updated + 1;');
  out.push('  elsif v_ids is null then');
  out.push(
    '    insert into public.members (team_id, name, role, active, back_number, age_band, age_half, top_size, bottom_size, uniform_issued, positions, preferred_position)',
  );
  out.push(
    `    values (v_team, ${q(person.name)}, 'player', true, ${person.number ?? 'null'}, ${person.band ? `${q(person.band)}::public.age_band` : 'null'}, ${sqlOrNull(person.half)}, ${sqlOrNull(person.top)}, ${sqlOrNull(person.bottom)}, ${person.issued == null ? 'null' : person.issued}, ${person.keeper ? "array['GK']::public.position_group[]" : "'{}'"}, ${person.keeper ? "'GK'" : 'null'});`,
  );
  out.push('    v_inserted := v_inserted + 1;');
  out.push('  else');
  out.push(`    raise notice '건너뜀: % — 같은 사람으로 보이는 회원이 % 명이에요. 앱에서 손으로 맞춰 주세요.', ${q(label)}, array_length(v_ids, 1);`);
  out.push('    v_skipped := v_skipped + 1;');
  out.push('  end if;');
  out.push('');
}

for (const person of left) {
  out.push(`  -- 탈퇴: ${person.name}`);
  out.push(...findSql(person));
  out.push('  if coalesce(array_length(v_ids, 1), 0) = 1 then');
  out.push('    update public.members set active = false where id = v_ids[1] and active;');
  out.push('    if found then v_left := v_left + 1; end if;');
  out.push('  end if;');
  out.push('');
}

out.push("  raise notice '고침 % · 새로 만듦 % · 탈퇴 처리 % · 건너뜀 %', v_updated, v_inserted, v_left, v_skipped;");
out.push('end $$;');
out.push('');
out.push('commit;');

console.log(out.join('\n'));
console.error(`회원 ${active.length}명 · 탈퇴 ${left.length}명을 읽었어요.`);
