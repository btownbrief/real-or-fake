// Headline pools + no-repeat draw tracking for REAL OR FAKE.
//
// Both pools draw without repeats across runs: seen headline keys persist in
// localStorage so regulars keep getting fresh material. When a pool runs dry
// its seen-set resets (the archive recycles).

const SEEN_REAL_KEY = 'btown-rof-seen-real';
const SEEN_FAKE_KEY = 'btown-rof-seen-fake';

let REAL = []; // [{headline, editionUrl, date}]
let FAKE = []; // [{headline}]

const keyOf = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function loadSeen(k) {
  try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); }
  catch { return new Set(); }
}
const seen = { real: loadSeen(SEEN_REAL_KEY), fake: loadSeen(SEEN_FAKE_KEY) };

function saveSeen() {
  localStorage.setItem(SEEN_REAL_KEY, JSON.stringify([...seen.real]));
  localStorage.setItem(SEEN_FAKE_KEY, JSON.stringify([...seen.fake]));
}

export async function loadPools() {
  const [r, f] = await Promise.all([
    fetch('data/real-headlines.json').then((x) => x.json()),
    fetch('data/fake-headlines.json').then((x) => x.json()),
  ]);
  REAL = r;
  FAKE = f.map((x) => (typeof x === 'string' ? { headline: x } : x));
  // drop stale seen-keys that no longer exist in the data files
  const realKeys = new Set(REAL.map((x) => keyOf(x.headline)));
  const fakeKeys = new Set(FAKE.map((x) => keyOf(x.headline)));
  seen.real = new Set([...seen.real].filter((k) => realKeys.has(k)));
  seen.fake = new Set([...seen.fake].filter((k) => fakeKeys.has(k)));
}

export const totalReal = () => REAL.length;
export const remainingReal = () => REAL.length - seen.real.size;
export const oldestDate = () => REAL.reduce((a, x) => (x.date && x.date < a ? x.date : a), '9999');

function drawFrom(pool, which, n, alsoExclude) {
  let fresh = pool.filter((x) => !seen[which].has(keyOf(x.headline)) && !alsoExclude.has(keyOf(x.headline)));
  if (fresh.length < n) {
    // pool exhausted mid-run: recycle, but still avoid repeats within this run
    seen[which].clear();
    fresh = pool.filter((x) => !alsoExclude.has(keyOf(x.headline)));
  }
  const out = [];
  for (let i = 0; i < n && fresh.length > 0; i++) {
    const j = Math.floor(Math.random() * fresh.length);
    out.push(fresh.splice(j, 1)[0]);
  }
  return out;
}

// One round's material: nReal real + nFake fake cards, shuffled.
// usedThisRun: Set of keys already shown during this run (no repeats in-run
// even right after a recycle).
export function drawRound(nReal, nFake, usedThisRun) {
  const reals = drawFrom(REAL, 'real', nReal, usedThisRun);
  const fakes = drawFrom(FAKE, 'fake', nFake, usedThisRun);
  for (const x of reals) { seen.real.add(keyOf(x.headline)); usedThisRun.add(keyOf(x.headline)); }
  for (const x of fakes) { seen.fake.add(keyOf(x.headline)); usedThisRun.add(keyOf(x.headline)); }
  saveSeen();
  const cards = [
    ...reals.map((x) => ({ ...x, real: true })),
    ...fakes.map((x) => ({ ...x, real: false })),
  ];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
