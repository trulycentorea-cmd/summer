// 별점을 아이에게 들려줄 말로 바꾸고, 쿠키 보상을 계산한다.
//
// 원칙 (PRD 6.3): 평가하지 말고 행동을 알려준다.
//   ❌ "목소리가 작아요"  → 아이를 위축시키는 평가
//   ✅ "교실 맨 뒷자리 친구에게 들리게 말해볼까요?" → 다음에 뭘 할지 아는 행동
// 개선점은 한 번에 하나만 말한다. 다섯 개를 쏟아내면 아이가 발표를 싫어하게 된다.

import { ELEMENTS } from './score.js';

const PRAISE = {
  confidence: '자신감이 가득한 발표였어요!',
  voice: '목소리가 교실 뒤까지 잘 들렸어요!',
  speed: '또박또박 알맞은 속도로 말했어요!',
  posture: '몸을 흔들지 않고 바르게 섰어요!',
  eyeContact: '친구들을 잘 바라보며 발표했어요!',
};

// 자신감은 여기 없다. 직접 잰 값이 아니라서 조언 대상이 아니다. (buildFeedback 참고)
const TIPS = {
  voice: '교실 맨 뒷자리 친구에게 들리도록 말해 볼까요?',
  posture: '두 발을 바닥에 딱 붙이고 서 볼까요?',
  eyeContact: '친구 세 명의 눈을 한 번씩 바라보며 말해 볼까요?',
};

const GROWTH = {
  confidence: '지난 발표보다 더 자신감이 생겼어요!',
  voice: '지난 발표보다 목소리가 더 커졌어요!',
  speed: '지난 발표보다 말하는 속도가 좋아졌어요!',
  posture: '지난 발표보다 자세가 더 바르게 됐어요!',
  eyeContact: '지난 발표보다 친구들을 더 잘 바라봤어요!',
};

/**
 * 쿠키 보상 (PRD 8장). 친구와 비교하지 않고 "지난 나"와만 비교한다.
 * @returns {{earned:number, grown:string[], bonus:boolean, isFirst:boolean}}
 */
export function calcCookies(scores, prevScores) {
  if (!prevScores) {
    // 첫 발표는 비교할 대상이 없다. 성장은 0이지만 도전한 것 자체를 칭찬한다.
    return { earned: 2, grown: [], bonus: false, isFirst: true };
  }

  const grown = ELEMENTS
    .map(e => e.key)
    .filter(key => {
      const now = scores[key], before = prevScores[key];
      return now !== null && before !== null && now > before;
    });

  const bonus = grown.length === ELEMENTS.length;
  return { earned: grown.length * 2 + (bonus ? 5 : 0), grown, bonus, isFirst: false };
}

/**
 * 코치가 할 말을 고른다.
 * @returns {{growth:string|null, praise:string|null, tip:string|null}}
 */
export function buildFeedback(scores, prevScores, raw) {
  const { grown } = calcCookies(scores, prevScores);

  // 성장한 게 있으면 그 말을 가장 먼저 한다. 아이에게 가장 큰 동기가 된다.
  const growth = grown.length ? GROWTH[bestGrowth(grown, scores)] : null;

  const measured = ELEMENTS.map(e => e.key).filter(k => scores[k] !== null);
  if (!measured.length) return { growth, praise: null, tip: null };

  const best = measured.reduce((a, b) => (scores[b] > scores[a] ? b : a));

  // 자신감은 목소리·속도·눈맞춤에서 계산해낸 값이지 직접 잰 값이 아니다.
  // 자신감이 낮다면 원인은 언제나 저 셋 중 하나이므로, 아이에게는 증상 대신 원인을 알려준다.
  // ("가슴을 펴세요"보다 "뒷자리까지 들리게 말해볼까요?"가 아이가 바로 할 수 있는 행동이다.)
  const actionable = measured.filter(k => k !== 'confidence');
  const worst = actionable.length
    ? actionable.reduce((a, b) => (scores[b] < scores[a] ? b : a))
    : null;

  return {
    growth,
    // 성장 메시지가 이미 나갔다면 칭찬을 또 하지 않는다. 잘한 것 1개 + 고칠 것 1개면 충분하다.
    praise: growth ? null : PRAISE[best],
    // 모든 요소가 ⭐4 이상이면 굳이 지적하지 않는다.
    tip: !worst || scores[worst] >= 4 ? null : tipFor(worst, raw),
  };
}

/** 여러 개가 함께 좋아졌다면 그중 점수가 가장 높은 것을 대표로 말해준다. */
function bestGrowth(grown, scores) {
  return grown.reduce((a, b) => (scores[b] > scores[a] ? b : a));
}

/** 속도는 너무 빠른지 느린지에 따라 조언이 정반대다. */
function tipFor(key, raw) {
  if (key !== 'speed') return TIPS[key];
  return raw.syllablesPerMin > 280
    ? '조금 빨랐어요. 문장 끝마다 한 번 쉬어 볼까요?'
    : '조금 더 씩씩하게 이어서 말해 볼까요?';
}
