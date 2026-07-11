#!/usr/bin/env node
// One-time archive builder for REAL OR FAKE: BTV HEADLINES.
//
// Crawls every BTown Brief edition listed in the sitemap, extracts the
// story-level headlines from each edition's "Local News" section, and
// writes them to data/real-headlines.json. Polite: one fetch at a time
// with a delay. Run manually:  node scripts/build-archive.mjs
//
// No dependencies — plain Node 18+.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITEMAP = 'https://www.btownbrief.com/sitemap.xml';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'real-headlines.json');
const DELAY_MS = 650;
const UA = 'btown-games-real-or-fake-archive-builder (one-time build)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ').trim();

// Headline-shaped: multi-word, starts strong, not newsletter boilerplate.
export function looksLikeHeadline(t) {
  const words = t.split(' ');
  return (
    words.length >= 4 && words.length <= 18 &&
    t.length >= 24 && t.length <= 140 &&
    /^[A-Z0-9$‘'"“]/.test(t) &&
    !/instagram|facebook|subscribe|sign.?up|read more|click here|sponsor|advertis|quiz|btown brief|newsletter|merch|core reader|becoming a|support the|donate|upgrade|full list|keep reading|powered by/i.test(t)
  );
}

const externalOk = (href) =>
  /^https?:\/\//.test(href) &&
  !/btownbrief\.com|beehiiv\.com|forms\.gle|instagram\.com|reddit\.com/i.test(href);

function extractHeadlines(html) {
  // Slice from the "Local News" heading (h1-h3 depending on era; the space is
  // sometimes a non-breaking space, which \s covers) to the next heading.
  const start = html.search(/<h[123][^>]*>(?:<[^>]+>)*[^<]*Local\sNews/i);
  if (start === -1) return extractH1Stories(html);
  const rest = html.slice(start + 10);
  const end = rest.search(/<h[123][^>]/i);
  const section = end === -1 ? rest : rest.slice(0, end);

  const out = [];
  for (const m of section.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    // Real stories link out to external press; skip anchors + own-site links.
    if (!externalOk(m[1])) continue;
    const t = decode(m[2]);
    if (looksLikeHeadline(t)) out.push(t);
  }
  return out;
}

// Earliest editions have no "Local News" heading: each story is an <h1>
// wrapping an external link.
function extractH1Stories(html) {
  const out = [];
  for (const b of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)) {
    const href = (b[1].match(/href="([^"]+)"/) || [])[1];
    if (!href || !externalOk(decode(href))) continue;
    const t = decode(b[1]);
    if (looksLikeHeadline(t)) out.push(t);
  }
  return out;
}

const res = await fetch(SITEMAP, { headers: { 'user-agent': UA } });
if (!res.ok) { console.error(`sitemap fetch failed: ${res.status}`); process.exit(1); }
const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .filter((u) => u.includes('/p/'));
console.log(`${urls.length} edition URLs in sitemap`);

const seen = new Set();
const rows = [];
let fetched = 0, misses = [];

for (const url of urls) {
  await sleep(DELAY_MS);
  let html;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (!r.ok) { misses.push(`${url} → HTTP ${r.status}`); continue; }
    html = await r.text();
  } catch (e) {
    misses.push(`${url} → ${e.message}`);
    continue;
  }
  fetched++;
  const date = (html.match(/property="article:published_time" content="([^"]+)"/) || [])[1]?.slice(0, 10) || null;
  const hs = extractHeadlines(html);
  if (hs.length === 0) misses.push(`${url} → no Local News headlines`);
  for (const h of hs) {
    const key = h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ headline: h, editionUrl: url, date });
  }
  process.stdout.write(`\r${fetched}/${urls.length} fetched, ${rows.length} headlines`);
}
console.log();

rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
console.log(`Wrote ${rows.length} headlines to data/real-headlines.json`);
console.log(`Date range: ${rows.at(-1)?.date} … ${rows[0]?.date}`);
if (misses.length) {
  console.log(`\n${misses.length} pages with issues:`);
  for (const m of misses.slice(0, 40)) console.log('  ' + m);
}
