// REAL OR FAKE: BTV HEADLINES — game flow + UI.
import { loadPools, drawRound, remainingReal, totalReal, oldestDate } from './data.js';
import {
  lbEnabled, getName, submitScore, renamePlayer, fetchTop, monthLabel, playerId,
} from './leaderboard.js';
import { initSoundToggle, playSound, stopSounds } from './audio.js';

const $ = (id) => document.getElementById(id);
const intro = $('intro'), roundScr = $('round'), overScr = $('gameover');
const cardsEl = $('cards'), verdictEl = $('verdict'), verdictLine = $('verdict-line');
const nextBtn = $('nextBtn'), momentBanner = $('moment-banner');
const scorebar = $('scorebar'), scoreEl = $('score'), multiplierEl = $('score-multiplier');
const announcer = $('announcer');

const BEST_KEY = 'btown-rof-best';        // best score
const BEST_STREAK_KEY = 'btown-rof-best-streak';

const INVERT_EVERY = 5; // every 5th round: 1 real among 3 fakes

let state = 'menu'; // menu | guessing | revealed | over
let roundNo = 0;
let streak = 0;
let score = 0;
let results = [];              // '✅' per round for the share grid
let usedThisRun = new Set();
let submittedThisRun = false;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let bestStreak = Number(localStorage.getItem(BEST_STREAK_KEY) || 0);
let effectEpoch = 0;
let effectTimers = new Set();
let numberAnimation;

$('ear-date').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});
$('best').textContent = best;
initSoundToggle($('mute'));

const toast = document.createElement('div');
toast.id = 'toast';
document.body.appendChild(toast);
let toastT;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toast.classList.remove('show'), 2200);
}

function paintScorebar() {
  $('streak').textContent = streak;
  scoreEl.textContent = score;
  $('best').textContent = best;
  scorebar.classList.remove('heat-3', 'heat-5', 'heat-10');
  if (streak >= 10) scorebar.classList.add('heat-10');
  else if (streak >= 5) scorebar.classList.add('heat-5');
  else if (streak >= 3) scorebar.classList.add('heat-3');
}

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resetEffects() {
  effectEpoch++;
  for (const timer of effectTimers) clearTimeout(timer);
  effectTimers = new Set();
  stopSounds();
  cancelAnimationFrame(numberAnimation);
  numberAnimation = undefined;
  scoreEl.textContent = score;
  multiplierEl.className = '';
  momentBanner.classList.add('hidden');
  $('streak-stat').classList.remove('streak-hit');
  announcer.textContent = '';
  roundScr.classList.remove('inversion-intro', 'reveal-beat', 'wrong-answer');
  overScr.classList.remove('resolution-enter');
  $('paper').classList.remove('death-wash');
}

function scheduleEffect(fn, delay) {
  const epoch = effectEpoch;
  const timer = setTimeout(() => {
    effectTimers.delete(timer);
    if (epoch === effectEpoch) fn();
  }, delay);
  effectTimers.add(timer);
}

function announce(message) {
  announcer.textContent = '';
  scheduleEffect(() => { announcer.textContent = message; }, 20);
}

function animateNumber(element, from, to, duration) {
  cancelAnimationFrame(numberAnimation);
  if (reduceMotion() || from === to) {
    element.textContent = to;
    return;
  }
  const epoch = effectEpoch;
  const started = performance.now();
  const frame = (now) => {
    if (epoch !== effectEpoch) return;
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - ((1 - progress) ** 3);
    element.textContent = Math.round(from + ((to - from) * eased));
    if (progress < 1) numberAnimation = requestAnimationFrame(frame);
  };
  numberAnimation = requestAnimationFrame(frame);
}

function animateScore(previousScore, multiplier) {
  animateNumber(scoreEl, previousScore, score, 500);
  multiplierEl.textContent = `×${multiplier}`;
  multiplierEl.className = reduceMotion() ? 'show static' : 'show';
  scheduleEffect(() => { multiplierEl.className = ''; }, 900);
}

function markStreakMilestone() {
  if (![3, 5, 10].includes(streak)) return;
  const stat = $('streak-stat');
  stat.classList.remove('streak-hit');
  void stat.offsetWidth;
  stat.classList.add('streak-hit');
  announce(`${streak} in a row. Streak multiplier times ${streak}.`);
  playSound('streak', streak);
  scheduleEffect(() => stat.classList.remove('streak-hit'), 850);
}

function paintFlex() {
  const rem = remainingReal();
  const yr = oldestDate().slice(0, 4);
  $('pool-flex').textContent =
    `${rem} of ${totalReal()} real headlines left in your archive · going back to ${yr}`;
}

// ------------------------------------------------------------ rounds

function isInverted() { return roundNo % INVERT_EVERY === 0; }

function startRun() {
  resetEffects();
  roundNo = 0;
  streak = 0;
  score = 0;
  results = [];
  usedThisRun = new Set();
  submittedThisRun = false;
  paintScorebar();
  intro.classList.add('hidden');
  overScr.classList.add('hidden');
  roundScr.classList.remove('hidden');
  nextRound();
}

function nextRound() {
  resetEffects();
  roundNo++;
  const inverted = isInverted();
  const cards = inverted ? drawRound(1, 3, usedThisRun) : drawRound(3, 1, usedThisRun);
  state = inverted ? 'announcing' : 'guessing';

  $('round-no').textContent = `ROUND No. ${roundNo}`;
  $('round-task').innerHTML = inverted
    ? 'FIND THE <b class="real-word">☝️ REAL ONE</b>'
    : 'FIND THE <b class="fake-word">FAKE</b>';

  verdictEl.classList.add('hidden');
  nextBtn.classList.add('hidden');
  cardsEl.innerHTML = '';
  for (const c of cards) {
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<div class="hl"></div><div class="meta"></div>';
    b.querySelector('.hl').textContent = c.headline;
    b.addEventListener('click', () => pick(b, c, cards, inverted));
    b._data = c;
    cardsEl.appendChild(b);
  }
  roundScr.scrollIntoView({ block: 'start' });

  if (inverted) {
    roundScr.classList.add('inversion-intro');
    momentBanner.innerHTML = '<b>RULES FLIPPED!</b><span>Find the one real headline.</span>';
    momentBanner.classList.remove('hidden');
    announce(`Round ${roundNo}. Rules flipped. Find the one real headline.`);
    playSound('inversion');
    scheduleEffect(() => {
      momentBanner.classList.add('hidden');
      roundScr.classList.remove('inversion-intro');
      state = 'guessing';
      announce('Cards are ready. Find the one real headline.');
    }, reduceMotion() ? 1100 : 850);
  } else {
    announce(`Round ${roundNo}. Find the fake headline.`);
  }
}

function reveal(cards, pickedBtn, pickedCard) {
  for (const b of cardsEl.children) {
    const c = b._data;
    b.disabled = true;
    b.classList.add('revealed');
    const meta = b.querySelector('.meta');
    if (c.real) {
      // THE discovery engine: date + inviting link to the archived story
      const d = c.date
        ? new Date(c.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'BTown Brief';
      meta.innerHTML = `<span class="when"></span> · <a target="_blank" rel="noopener">Read the story →</a>`;
      meta.querySelector('.when').textContent = `✓ Real — ${d}`;
      meta.querySelector('a').href = c.editionUrl;
      if (isInverted()) b.classList.add('is-real-answer');
    } else {
      b.classList.add('is-fake');
      meta.innerHTML = '<span class="stamp-fake">🚫 FAKE</span>';
    }
  }
  if (pickedBtn && pickedCard) pickedBtn.classList.add('picked-wrong');
}

function pick(btn, card, cards, inverted) {
  if (state !== 'guessing') return;
  state = 'revealed';
  const correct = inverted ? card.real : !card.real;
  const previousScore = score;
  roundScr.classList.add('reveal-beat');

  if (correct) {
    streak++;
    const points = 100 * streak; // climbing multiplier: round N of the streak pays 100×N
    score += points;
    results.push(inverted ? '🟢' : '✅');
    reveal(cards, null, null);
    verdictLine.innerHTML = `<b class="good">CORRECT.</b> +${points} pts · read what really happened ↑`;
    nextBtn.textContent = 'NEXT ROUND →';
    announce(`Correct. Plus ${points} points. Streak multiplier times ${streak}.`);
  } else {
    results.push('❌');
    reveal(cards, btn, card);
    roundScr.classList.add('wrong-answer');
    verdictLine.innerHTML = inverted
      ? `<b class="bad">FAKE NEWS.</b> That one never happened — the real stories are worth a read ↑`
      : `<b class="bad">FOOLED.</b> That one really ran. The fake is stamped above.`;
    nextBtn.textContent = 'FINAL SCORE →';
    announce(inverted
      ? 'Wrong. That headline was fake. The run is over.'
      : 'Wrong. That headline was real. The fake is now stamped. The run is over.');
  }
  paintScorebar();
  if (correct) {
    animateScore(previousScore, streak);
    markStreakMilestone();
  }
  scheduleEffect(() => playSound('stamp'), 190);
  scheduleEffect(() => playSound(correct ? 'correct' : 'wrong'), 360);
  scheduleEffect(() => roundScr.classList.remove('reveal-beat'), 900);
  nextBtn.classList.remove('hidden');
  verdictEl.classList.remove('hidden');
  verdictEl.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

// ------------------------------------------------------------ game over

function gameOver() {
  resetEffects();
  state = 'over';
  const isBestScore = score > best;
  if (isBestScore) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
  if (streak > bestStreak) { bestStreak = streak; localStorage.setItem(BEST_STREAK_KEY, String(bestStreak)); }
  paintScorebar();

  $('final-line').textContent = streak === 0
    ? 'Fooled on the first edition. The Brief awaits your re-read.'
    : `You spotted ${streak} fake${streak === 1 ? '' : 's'} before the news got you.`;
  $('final-score').textContent = reduceMotion() ? score : 0;
  const bl = $('best-line');
  bl.textContent = isBestScore ? '★ NEW BEST ★' : `Best: ${best} · Best streak: ${bestStreak}`;
  bl.className = isBestScore ? 'new-best' : '';

  roundScr.classList.add('hidden');
  overScr.classList.remove('hidden');
  overScr.classList.add('resolution-enter');
  $('paper').classList.add('death-wash');
  animateNumber($('final-score'), 0, score, 650);
  playSound('death');
  announce(`Final score ${score}. ${streak} correct in a row.`);
  scheduleEffect(() => $('paper').classList.remove('death-wash'), 700);
  $('againBtn').focus({ preventScroll: true });
  updateLeaderboard(score);
}

// share: emoji streak grid
$('shareBtn').addEventListener('click', async () => {
  const grid = results.join('');
  const text = `REAL OR FAKE: BTV HEADLINES 🗞️\nStreak: ${streak} · Score: ${score}\n${grid}\nSpot the fake: https://btownbrief.github.io/real-or-fake/`;
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  } catch { /* user cancelled the share sheet */ }
});

// ------------------------------------------------------------ leaderboard
// (pattern from Church St Surfers, restyled; score submits exactly once/run)

const lbBox = $('lb'), lbList = $('lbList'), lbStatus = $('lbStatus');
const lbForm = $('lbForm'), lbNameInput = $('lbNameInput');
const lbThisBtn = $('lbThisBtn'), lbLastBtn = $('lbLastBtn'), lbRenameBtn = $('lbRenameBtn');
let lbMonthOffset = 0;

if (lbEnabled()) {
  lbBox.classList.remove('hidden');
  lbThisBtn.textContent = `🏆 ${monthLabel(0)}`;
  lbLastBtn.textContent = monthLabel(-1);
}

async function updateLeaderboard(s) {
  if (!lbEnabled()) return;
  if (!getName()) {
    // first run: hold the score pending until a name is saved
    lbForm.classList.remove('hidden');
    lbRenameBtn.classList.add('hidden');
    lbStatus.textContent = 'Pick a byline to join the monthly leaderboard!';
    lbList.innerHTML = '';
    lbForm.dataset.pendingScore = String(s);
    return;
  }
  try {
    if (!submittedThisRun && s > 0) {
      submittedThisRun = true;
      await submitScore(s); // server keeps the monthly best
    }
  } catch { /* offline — still show the board */ }
  renderBoard();
}

async function renderBoard() {
  lbForm.classList.add('hidden');
  lbRenameBtn.classList.remove('hidden');
  lbStatus.textContent = 'Loading…';
  try {
    const rows = await fetchTop(lbMonthOffset);
    const me = playerId();
    lbList.innerHTML = '';
    rows.slice(0, 10).forEach((r, i) => {
      const li = document.createElement('li');
      if (r.player_id === me) li.className = 'me';
      const medal = ['🥇', '🥈', '🥉'][i];
      li.innerHTML = `<span class="rank">${medal || i + 1}</span><span class="nm"></span><span class="sc"></span>`;
      li.querySelector('.nm').textContent = r.name;
      li.querySelector('.sc').textContent = r.score;
      lbList.appendChild(li);
    });
    const myRank = rows.findIndex((r) => r.player_id === me);
    lbStatus.textContent = rows.length === 0
      ? 'No scores yet this month — be the first!'
      : myRank >= 0 ? `You're #${myRank + 1} of ${rows.length} this month` : '';
  } catch {
    lbStatus.textContent = 'Leaderboard unavailable (offline?)';
  }
}

$('lbSaveBtn').addEventListener('click', async () => {
  const name = lbNameInput.value.trim();
  if (!name) { lbNameInput.focus(); return; }
  const pending = Number(lbForm.dataset.pendingScore || 0);
  lbForm.dataset.pendingScore = '';
  try {
    await renamePlayer(name); // saves locally + renames existing rows
    if (pending > 0 && !submittedThisRun) {
      submittedThisRun = true;
      await submitScore(pending);
    }
  } catch { /* offline */ }
  renderBoard();
});
lbNameInput.addEventListener('keydown', (e) => {
  e.stopPropagation(); // keystrokes in the name input must never restart the game
  if (e.key === 'Enter') $('lbSaveBtn').click();
});
lbRenameBtn.addEventListener('click', () => {
  lbNameInput.value = getName();
  lbForm.classList.remove('hidden');
  lbRenameBtn.classList.add('hidden');
  lbNameInput.focus();
});
lbThisBtn.addEventListener('click', () => {
  lbMonthOffset = 0;
  lbThisBtn.classList.add('sel');
  lbLastBtn.classList.remove('sel');
  renderBoard();
});
lbLastBtn.addEventListener('click', () => {
  lbMonthOffset = -1;
  lbLastBtn.classList.add('sel');
  lbThisBtn.classList.remove('sel');
  renderBoard();
});
// taps inside the leaderboard box never reach game-level handlers
lbBox.addEventListener('click', (e) => e.stopPropagation());

// ------------------------------------------------------------ input

$('startBtn').addEventListener('click', startRun);
$('againBtn').addEventListener('click', startRun);
nextBtn.addEventListener('click', () => {
  if (state !== 'revealed') return;
  if (results[results.length - 1] === '❌') gameOver();
  else nextRound();
});

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, button, a')) return;
  if (e.code !== 'Space' && e.key !== 'Enter') return;
  e.preventDefault();
  if (state === 'menu' || state === 'over') startRun();
  else if (state === 'revealed' && !nextBtn.classList.contains('hidden')) nextBtn.click();
});

// ------------------------------------------------------------ boot

loadPools().then(() => {
  paintFlex();
}).catch(() => {
  $('pool-flex').textContent = 'Could not load the headline archive — check your connection.';
  $('startBtn').disabled = true;
});

// debug/test hook
window.__rof = {
  startRun,
  get state() { return state; },
  get score() { return score; },
  get streak() { return streak; },
  get roundNo() { return roundNo; },
  pickFake() { // auto-answer correctly for testing
    const inverted = isInverted();
    for (const b of cardsEl.children) {
      if (inverted === b._data.real) { b.click(); return b._data; }
    }
  },
  pickWrong() {
    const inverted = isInverted();
    for (const b of cardsEl.children) {
      if (inverted !== b._data.real) { b.click(); return b._data; }
    }
  },
};
