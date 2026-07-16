// 브라우저 localStorage에 발표 기록을 저장한다. 서버가 없어도 새로고침 후 기록이 남는다.

const KEY = 'presentation-coach-data';

const EMPTY = { cookies: 0, totalCookies: 0, records: [] };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    // 저장된 값이 깨졌을 때 앱 전체가 멈추는 것보다 기록을 포기하는 편이 낫다.
    return { ...EMPTY };
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('기록 저장 실패:', e);
  }
}

/** 발표 한 건을 기록에 추가하고, 저장된 전체 데이터를 돌려준다. */
export function addRecord(record) {
  const data = load();
  data.records.push(record);
  data.cookies += record.cookiesEarned;
  data.totalCookies += record.cookiesEarned;
  save(data);
  return data;
}

/** 방금 발표와 비교할 "지난 발표". 없으면 null (= 첫 발표). */
export function getLastRecord() {
  const { records } = load();
  return records.length ? records[records.length - 1] : null;
}

/** 누적 쿠키로 발표 레벨을 정한다. (PRD 8장) */
export function getLevel(totalCookies) {
  if (totalCookies >= 120) return { emoji: '👑', name: '발표 마스터' };
  if (totalCookies >= 60)  return { emoji: '⭐', name: '발표 리더' };
  if (totalCookies >= 20)  return { emoji: '🌼', name: '발표 연습생' };
  return { emoji: '🌱', name: '발표 새싹' };
}
