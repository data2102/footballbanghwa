#!/usr/bin/env node
/**
 * 총무의 2026년 미투표자 엑셀을 Supabase 에 넣을 SQL 로 바꾼다.
 *
 *   npm run import:roster -- ~/Downloads/2026년미투표자현황.xlsx > import.sql
 *
 * 그리고 나온 import.sql 을 Supabase 대시보드의 SQL Editor 에 붙여넣고 Run 한다.
 *
 * 왜 이렇게 하나 — 이 저장소는 공개다. 실명 아흔 개가 커밋에 들어가면 지워도 남는다.
 * 스크립트는 맥북에서만 돌고, 나온 SQL 도 커밋하지 않는다(.gitignore 에 넣어 뒀다).
 * 키도 필요 없다. SQL Editor 는 이미 로그인한 사람이 쓰는 자리다.
 *
 * 엑셀에서 읽는 것:
 *   3행이 머리글 — 구분 | 성명 | 연령대 | (전반/후반) | 1.4 | 1.11 | ... | 12.27 | 비고
 *   4행부터가 사람. 날짜 칸의 O 는 "그 주에 답을 안 했다".
 *
 * 엑셀에 없는 것: 참석·불참. 총무가 센 건 답을 했나 안 했나뿐이다.
 * 그래서 답을 한 사람은 voted 로 넣는다 — "투표는 했는데 참석인지 불참인지 모른다".
 * 참석으로 올려 넣으면 다음 주 라인업이 그 거짓말 위에서 짜인다.
 */
import ExcelJS from 'exceljs';

const SHEET = '전체명단';
const HEADER_ROW = 3;
const KICKOFF = '06:00';
const VENUE = '자체경기';

const path = process.argv[2];
if (!path) {
  console.error('쓰는 법: npm run import:roster -- <엑셀 경로> > import.sql');
  process.exit(1);
}

/** 작은따옴표만 막으면 된다. 이름·메모 말고는 넣는 게 없다. */
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** '1.4' 를 2026-01-04 로. 엑셀 칸은 그 해 일요일 순서와 같다. */
function toISO(year, label) {
  const [month, day] = String(label).split('.').map(Number);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const book = new ExcelJS.Workbook();
await book.xlsx.readFile(path);

const sheet = book.getWorksheet(SHEET);
if (!sheet) {
  console.error(`'${SHEET}' 시트를 찾지 못했어요. 시트 이름을 확인해 주세요.`);
  process.exit(1);
}

// 머리글에서 날짜 칸의 위치를 찾는다. 열 순서가 바뀌어도 따라간다.
const header = sheet.getRow(HEADER_ROW);
const dateColumns = [];
let nameColumn = null;
let bandColumn = null;
header.eachCell((cell, col) => {
  const text = String(cell.value ?? '').trim();
  if (text === '성명') nameColumn = col;
  else if (text === '연령대' && bandColumn === null) bandColumn = col;
  else if (/^\d{1,2}\.\d{1,2}$/.test(text)) dateColumns.push({ col, label: text });
});

if (!nameColumn || !bandColumn || dateColumns.length === 0) {
  console.error('머리글에서 성명·연령대·날짜 칸을 못 찾았어요. 3행이 머리글이 맞는지 봐 주세요.');
  process.exit(1);
}

// 연도는 파일 이름이나 첫 날짜로는 알 수 없다. 인자로 받되 없으면 올해로 둔다.
const year = Number(process.argv[3]) || new Date().getFullYear();

const people = [];
for (let r = HEADER_ROW + 1; r <= sheet.rowCount; r += 1) {
  const row = sheet.getRow(r);
  const name = String(row.getCell(nameColumn).value ?? '').trim();
  if (!name) continue;
  const band = String(row.getCell(bandColumn).value ?? '').replace('대', '').trim();
  const silent = dateColumns
    .filter(({ col }) => String(row.getCell(col).value ?? '').trim() !== '')
    .map(({ label }) => toISO(year, label));
  people.push({ name, band, silent, number: people.length + 1 });
}

// 표시가 하나라도 있는 주만 "집계한 주"다. 3월처럼 통째로 빈 주는 체크를 건너뛴 것이지
// 아흔 명이 다 같이 답을 안 한 게 아니다. 그 주에는 아무 줄도 넣지 않는다.
const tracked = [...new Set(people.flatMap((p) => p.silent))].sort();
const totalSilent = people.reduce((sum, p) => sum + p.silent.length, 0);

const out = [];
out.push(`-- ${path} 에서 만든 적재 SQL`);
out.push(`-- 회원 ${people.length}명 · 집계한 주 ${tracked.length}개 · 미투표 ${totalSilent}건`);
out.push(`-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.`);
out.push(`-- 두 번 돌려도 같은 결과가 됩니다(이름+등번호, 날짜, (경기,회원) 로 맞춰 넣어요).`);
out.push('');
out.push('begin;');
out.push('');
out.push('do $$');
out.push('declare');
out.push('  v_team   uuid;');
out.push('  v_member uuid;');
out.push('  v_match  uuid;');
out.push('begin');
out.push('  -- 팀이 여러 개면 아래를 원하는 팀 id 로 바꾸세요.');
out.push('  select id into v_team from public.teams order by created_at limit 1;');
out.push("  if v_team is null then raise exception '팀이 없습니다. 앱에서 팀을 먼저 만들어 주세요.'; end if;");
out.push('');

out.push('  -- ---------------------------------------------------------- 회원');
for (const person of people) {
  out.push(`  select id into v_member from public.members`);
  out.push(`    where team_id = v_team and name = ${q(person.name)} and back_number = ${person.number};`);
  out.push('  if v_member is null then');
  out.push('    insert into public.members (team_id, name, back_number, age_band, role, active)');
  out.push(
    `    values (v_team, ${q(person.name)}, ${person.number}, ${person.band ? q(person.band) : 'null'}::public.age_band, 'player', true)`,
  );
  out.push('    returning id into v_member;');
  out.push('  else');
  out.push(
    `    update public.members set age_band = ${person.band ? q(person.band) : 'null'}::public.age_band where id = v_member;`,
  );
  out.push('  end if;');
  out.push('');
}

out.push('  -- ---------------------------------------------------------- 경기와 참석');
out.push('  -- 미투표를 실제로 센 주만 넣는다. 표시가 하나도 없는 주는 집계를 안 한 주라');
out.push('  -- 그대로 두면 앱이 참석률 분모에서 알아서 뺀다.');
for (const date of tracked) {
  const voted = people.filter((p) => !p.silent.includes(date));
  out.push('');
  out.push(`  -- ${date} · 투표 ${voted.length}명 / 미투표 ${people.length - voted.length}명`);
  out.push(`  select id into v_match from public.matches where team_id = v_team and date = ${q(date)};`);
  out.push('  if v_match is null then');
  out.push('    insert into public.matches (team_id, date, kickoff, venue, status)');
  out.push(`    values (v_team, ${q(date)}, ${q(KICKOFF)}, ${q(VENUE)}, 'finished')`);
  out.push('    returning id into v_match;');
  out.push('  end if;');
  out.push('');
  out.push('  insert into public.attendance (match_id, member_id, status, source, updated_at)');
  out.push('  select v_match, m.id, \'voted\', \'manual\', ' + q(date) + '::timestamptz');
  out.push('    from public.members m');
  out.push('   where m.team_id = v_team');
  out.push(`     and m.back_number in (${voted.map((p) => p.number).join(', ')})`);
  out.push('  on conflict (match_id, member_id) do update set status = excluded.status;');
  out.push('');
  // 미투표는 줄을 넣지 않는다. 앱이 "줄이 없음 = 미투표"로 읽는다.
  // 다시 돌릴 때를 대비해, 전에 잘못 들어간 줄이 있으면 지운다.
  out.push('  delete from public.attendance');
  out.push('   where match_id = v_match');
  out.push('     and member_id in (');
  out.push('       select id from public.members');
  out.push(`        where team_id = v_team and back_number in (${people
    .filter((p) => p.silent.includes(date))
    .map((p) => p.number)
    .join(', ')})`);
  out.push('     );');
}

out.push('end $$;');
out.push('');
out.push('commit;');
out.push('');
out.push('-- 확인용: 사람별 미투표 횟수 (엑셀과 맞는지 대조하세요)');
out.push('-- select m.name, count(*) filter (where a.id is null) as 미투표');
out.push('--   from public.members m');
out.push('--   cross join public.matches mt');
out.push('--   left join public.attendance a on a.match_id = mt.id and a.member_id = m.id');
out.push(`--  where mt.date in (${tracked.map(q).join(', ')})`);
out.push('--  group by m.name order by 미투표 desc;');

console.log(out.join('\n'));
console.error(
  `회원 ${people.length}명 · 집계한 주 ${tracked.length}개 · 미투표 ${totalSilent}건을 SQL 로 만들었어요.`,
);
