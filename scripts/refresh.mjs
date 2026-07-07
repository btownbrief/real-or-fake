#!/usr/bin/env node
// Weekly refresh for REAL OR FAKE: BTV HEADLINES.
//
// 1. Fetches the Btown Brief RSS feed and folds any new story headlines from
//    the newest edition into data/real-headlines.json.
// 2. Calls the Claude API to write 10 fresh fake headlines in the archive's
//    tone (20 random real headlines as style examples) and appends them to
//    data/fake-headlines.json.
//
// Hard validation everywhere; exits non-zero (so CI commits nothing) if the
// generated fakes don't pass. Requires ANTHROPIC_API_KEY for step 2.
//
// No dependencies — plain Node 18+.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FEED = 'https://rss.beehiiv.com/feeds/1BT4mvZXMo.xml';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_PATH = join(ROOT, 'data', 'real-headlines.json');
const FAKE_PATH = join(ROOT, 'data', 'fake-headlines.json');
const N_FAKES = 10;
const N_EXAMPLES = 20;

const decode = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();

const keyOf = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function looksLikeHeadline(t) {
  const words = t.split(' ');
  return (
    words.length >= 4 && words.length <= 18 &&
    t.length >= 24 && t.length <= 140 &&
    /^[A-Z0-9$‘'"“]/.test(t) &&
    !/instagram|facebook|subscribe|sign.?up|read more|click here|sponsor|advertis|quiz|btown brief|newsletter|merch|core reader|becoming a|support the|donate|upgrade|full list|keep reading|powered by/i.test(t)
  );
}

// ------------------------------------------------------------ 1. new reals

const real = JSON.parse(readFileSync(REAL_PATH, 'utf8'));
const fake = JSON.parse(readFileSync(FAKE_PATH, 'utf8'));
const knownKeys = new Set([...real, ...fake].map((x) => keyOf(x.headline)));

const feedRes = await fetch(FEED, { headers: { 'user-agent': 'real-or-fake-refresh' } });
if (!feedRes.ok) { console.error(`feed fetch failed: ${feedRes.status}`); process.exit(1); }
const xml = await feedRes.text();
const newest = xml.split('<item>')[1];
if (!newest) { console.error('no <item> in feed'); process.exit(1); }

const editionUrl = decode((newest.match(/<link>([\s\S]*?)<\/link>/) || [, ''])[1]);
const pubDate = (newest.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [, ''])[1];
const date = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null;
let body = (newest.match(/content:encoded>([\s\S]*?)<\/content:encoded>/) || [, ''])[1]
  .replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');

let added = 0;
const start = body.search(/<h[12][^>]*>(?:<[^>]+>)*[^<]*Local News/i);
if (start !== -1) {
  const rest = body.slice(start + 10);
  const end = rest.search(/<h[12][^>]/i);
  const section = end === -1 ? rest : rest.slice(0, end);
  for (const m of section.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)) {
    const t = decode(m[1]);
    if (!looksLikeHeadline(t) || knownKeys.has(keyOf(t))) continue;
    knownKeys.add(keyOf(t));
    real.unshift({ headline: t, editionUrl, date });
    added++;
  }
}
console.log(`${added} new real headlines from ${editionUrl}`);

// ------------------------------------------------------------ 2. new fakes

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

const examples = [...real].sort(() => Math.random() - 0.5).slice(0, N_EXAMPLES)
  .map((x) => x.headline);

const prompt = `You write fake local-news headlines for "Real or Fake: BTV Headlines", a game by the Btown Brief, a Burlington, Vermont newsletter. Players see real archive headlines next to fakes and must spot the fake — so your fakes must be indistinguishable in tone, length, and specificity.

Here are ${examples.length} REAL headlines from the archive as style examples:
${examples.map((h) => `- ${h}`).join('\n')}

Write exactly ${N_FAKES} NEW fake headlines. Rules:
- Plausible enough that a Burlington local genuinely hesitates. Real street names, neighborhoods, and institutions (Church Street, Pine Street, the Old North End, UVM, Winooski, City Hall Park, North Beach, CityPlace, Leddy Park, Shelburne Road…) attached to invented-but-believable events.
- Wry is good; absurd is not. No aliens, no obviously-a-joke premises.
- Do NOT describe real events, and never defame a real named private individual. Invented business/person names or unnamed roles ("City Council", "a South End bakery") are safest.
- Match the examples' headline style: title case-ish, 6-14 words, no ending period.
- No duplicates of the examples or of each other.

Reply with ONLY a JSON array of ${N_FAKES} strings. No prose, no code fences.`;

const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  }),
});
if (!apiRes.ok) {
  console.error(`Claude API failed: ${apiRes.status} ${await apiRes.text()}`);
  process.exit(1);
}
const msg = await apiRes.json();
// content may lead with a thinking block; take the first text block
const raw = (msg.content?.find((b) => b.type === 'text')?.text || '')
  .trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
if (msg.stop_reason === 'max_tokens') { console.error('Claude response truncated'); process.exit(1); }

let parsed;
try { parsed = JSON.parse(raw); }
catch {
  console.error('Claude output is not valid JSON:\n' + raw);
  console.error('full response: ' + JSON.stringify(msg).slice(0, 2000));
  process.exit(1);
}
if (!Array.isArray(parsed)) { console.error('Claude output is not an array'); process.exit(1); }

// Shape check for generated fakes. Same size limits as real headlines, but
// without the newsletter-boilerplate ban list (a fake about e-bike "upgrades"
// is fine; a real subscribe-link is not) — just game-breaking tells.
function validFake(t) {
  const words = t.split(' ');
  return (
    words.length >= 4 && words.length <= 18 &&
    t.length >= 24 && t.length <= 140 &&
    /^[A-Z0-9$‘'"“]/.test(t) &&
    !/https?:|btown brief|real or fake|\bfake\b/i.test(t)
  );
}

const newFakes = [];
for (const h of parsed) {
  if (typeof h !== 'string') continue;
  const t = h.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  if (!validFake(t)) { console.error(`rejected (shape): ${t}`); continue; }
  if (knownKeys.has(keyOf(t))) { console.error(`rejected (dupe): ${t}`); continue; }
  knownKeys.add(keyOf(t));
  newFakes.push({ headline: t, generated: new Date().toISOString().slice(0, 10) });
}
if (newFakes.length < N_FAKES) {
  console.error(`only ${newFakes.length}/${N_FAKES} fakes passed validation — committing nothing`);
  process.exit(1);
}

fake.push(...newFakes);
writeFileSync(REAL_PATH, JSON.stringify(real, null, 2) + '\n');
writeFileSync(FAKE_PATH, JSON.stringify(fake, null, 2) + '\n');
console.log(`Wrote ${added} new reals (total ${real.length}) and ${newFakes.length} new fakes (total ${fake.length}).`);
