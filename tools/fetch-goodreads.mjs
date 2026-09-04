#!/usr/bin/env node
/**
 * fetch-goodreads.mjs
 * -----------------------------------------------------------------------------
 * Looks up a real Goodreads book-page URL for every book in ../books-data.json
 * and writes ../goodreads.json:
 *
 *   { "<title lowercased>::<author lowercased>": { "url": "https://www.goodreads.com/book/show/..." } }
 *
 * Goodreads search is heavily polluted with SEO "Summary of <bestseller>" /
 * "Study Guide" / "Workbook" knockoffs that outrank the real book for popular
 * titles — a naive "first search result" link sends people to a spam page as
 * often as not. This instead:
 *   1. runs a few query variants per book (title alone strips subtitles/series
 *      numbers, since including them sometimes feeds the spam even harder),
 *   2. drops any result whose title matches a "summary / study guide /
 *      analysis / workbook / ..." pattern,
 *   3. among what's left, scores by how well the title+author match, then
 *      breaks ties by rating count (the real book is virtually always the
 *      most-rated edition; knockoffs sit at 0–10 ratings).
 *
 * Books with no confident match are simply left out of goodreads.json; the
 * site then falls back to a plain title+author search link for them.
 *
 * Re-run this any time you change books-data.json (add/remove books):
 *   node tools/fetch-goodreads.mjs
 *
 * Only hits the network for books not already in goodreads.json unless you
 * pass --force to re-check everything.
 * -----------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, "..", "books-data.json");
const OUT_PATH = join(HERE, "..", "goodreads.json");
const REPORT_PATH = join(HERE, "..", "goodreads.report.txt");

const FORCE = process.argv.includes("--force");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";
const DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Must match keyFor() in assets/app.js and tools/fetch-covers.mjs. */
const keyFor = (title, author) =>
  `${String(title).trim().toLowerCase()}::${String(author).trim().toLowerCase()}`;

function primaryAuthor(author) {
  return String(author)
    .split(/,\s*adapted by|,| and | & |;/i)[0]
    .replace(/\(.*?\)/g, "")
    .trim();
}

/** Title with series/edition parentheticals and any subtitle stripped. */
function shortTitle(title) {
  return String(title)
    .replace(/\s*\(.*?\)\s*/g, " ")
    .split(/[:—–]/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—");
}

function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[:'’—\-–,.!?()]/g, " ")
    .replace(/\b(a|an|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function lastName(author) {
  const parts = primaryAuthor(author).trim().split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

// SEO knockoffs: summaries, study guides, workbooks, "analysis" cram-books.
// None of the real titles in this catalog contain these words.
const SPAM_RE =
  /\b(summary|study guide|summary and analysis|analysis|workbook|companion(?:\s+guide)?|book analysis|guide to|cliff\s?notes|sparknotes|quicklet|instaread|conversation starters|key ideas|key takeaways|blinkist)\b/i;

function parseSearchResults(html) {
  const rows = html.split('<tr itemscope itemtype="http://schema.org/Book">').slice(1);
  const out = [];
  for (const row of rows) {
    const chunk = row.split("</tr>")[0];
    const hrefM = chunk.match(/class="bookTitle"[^>]*href="([^"?]+)/);
    const titleM = chunk.match(/class="bookTitle"[\s\S]{0,300}?<span[^>]*>([^<]+)<\/span>/);
    const authorM = chunk.match(/class="authorName"[\s\S]{0,200}?<span itemprop="name">([^<]+)<\/span>/);
    const ratingM = chunk.match(/([\d.]+)\s+avg rating\s*&mdash;\s*([\d,]+)\s+ratings?/);
    if (hrefM && titleM) {
      out.push({
        href: "https://www.goodreads.com" + decodeEntities(hrefM[1]),
        title: decodeEntities(titleM[1]).trim(),
        author: authorM ? decodeEntities(authorM[1]).trim() : "",
        ratingCount: ratingM ? parseInt(ratingM[2].replace(/,/g, ""), 10) : 0,
      });
    }
  }
  return out;
}

// Goodreads sits behind AWS WAF. If it ever starts answering with its bot
// challenge page (this is a "prove you're not a robot" JS/CAPTCHA gate), we
// stop immediately rather than solving or working around it — see the
// WafChallenge handling in main(). This tool must never try to defeat that
// challenge; it only recognizes it so it can back off cleanly.
class WafChallenge extends Error {}

async function searchOnce(q) {
  const url = "https://www.goodreads.com/search?q=" + encodeURIComponent(q);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (res.headers.get("x-amzn-waf-action") === "challenge") {
    throw new WafChallenge("Goodreads returned its bot-verification challenge page");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  if (/window\.gokuProps|AwsWafIntegration/.test(html)) {
    throw new WafChallenge("Goodreads returned its bot-verification challenge page");
  }
  return parseSearchResults(html);
}

function scoreCandidates(results, wantTitle, wantAuthor) {
  const wt = norm(shortTitle(wantTitle));
  const wa = lastName(wantAuthor);
  return results
    .filter((r) => !SPAM_RE.test(r.title))
    .map((r) => {
      const rt = norm(shortTitle(r.title));
      const titleHit =
        rt === wt ? 3 : rt.startsWith(wt) || wt.startsWith(rt) ? 2 : rt.includes(wt) || wt.includes(rt) ? 1 : 0;
      const authorHit = lastName(r.author) === wa ? 1 : 0;
      return { r, score: titleHit * 10 + authorHit * 5 };
    })
    .filter((s) => s.score >= 10) // require at least a title match; author alone isn't enough
    .sort((a, b) => b.score - a.score || b.r.ratingCount - a.r.ratingCount);
}

/**
 * Tries query variants one at a time (cheapest/most targeted first) and
 * stops as soon as one gives a confident, clearly-popular match — most books
 * resolve on the first query. Only the handful of titles that are drowned in
 * SEO-summary spam (see file header) need the extra variants. Throws
 * WafChallenge if Goodreads starts challenging us, so the caller can abort
 * the whole run instead of burning through every remaining book as a miss.
 */
async function resolveBook(title, author) {
  const st = shortTitle(title);
  const a1 = primaryAuthor(author);
  const queries = [...new Set([`${st} ${a1}`, `${title} ${a1}`, st])];
  const seen = new Map();
  for (let i = 0; i < queries.length; i++) {
    const results = await searchOnce(queries[i]);
    for (const r of results) if (!seen.has(r.href)) seen.set(r.href, r);
    const scored = scoreCandidates([...seen.values()], title, author);
    const top = scored[0];
    const isLastQuery = i === queries.length - 1;
    if (top && (isLastQuery || (top.score >= 15 && top.r.ratingCount >= 25))) return top.r;
    if (!isLastQuery) await sleep(DELAY_MS);
  }
  return null;
}

async function main() {
  const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const existing = !FORCE && existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, "utf8")) : {};

  const books = new Map();
  for (const cat of data.categories) {
    for (const b of cat.books) books.set(keyFor(b.title, b.author), b);
  }

  const out = { ...existing };
  const hits = [];
  const misses = [];
  let i = 0;
  let stoppedEarly = false;

  for (const [key, b] of books) {
    i++;
    const tag = `[${i}/${books.size}]`;
    if (out[key] && out[key].url) {
      console.log(`${tag} cached   ${b.title}`);
      continue;
    }
    process.stdout.write(`${tag} lookup   ${b.title} — ${b.author} ... `);
    try {
      const best = await resolveBook(b.title, b.author);
      if (best) {
        out[key] = { url: best.href.split("?")[0] };
        hits.push(`${b.title} — ${b.author}  ->  ${out[key].url}  (${best.ratingCount} ratings)`);
        console.log(`${best.ratingCount} ratings -> ${out[key].url}`);
      } else {
        misses.push(`${b.title} — ${b.author}`);
        console.log("NO CONFIDENT MATCH (falls back to a search link)");
      }
    } catch (e) {
      if (e instanceof WafChallenge) {
        console.log("\n\nGoodreads is showing its bot-verification challenge page.");
        console.log("Stopping here rather than trying to get past it — that's not something");
        console.log("this tool will do. Everything found so far is saved; the remaining");
        console.log(`${books.size - i + 1} book(s) keep using the search-link fallback until you`);
        console.log("re-run this script later (it skips books it already resolved).");
        misses.push(`${b.title} — ${b.author}  (stopped: Goodreads bot-check)`);
        stoppedEarly = true;
        break;
      }
      misses.push(`${b.title} — ${b.author}  (error: ${e.message})`);
      console.log("ERROR " + e.message);
    }
    await sleep(DELAY_MS);
  }

  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n");

  const report =
    `Goodreads link report — ${new Date().toISOString()}\n` +
    `${hits.length} matched to a direct book page, ${misses.length} fall back to a search link\n` +
    (stoppedEarly
      ? "\nStopped early: Goodreads showed its bot-verification challenge page partway\n" +
        "through. Re-run `node tools/fetch-goodreads.mjs` later (e.g. tomorrow) to pick\n" +
        "up more — it only looks up books that are still missing from goodreads.json.\n"
      : "") +
    `\nFALL BACK TO SEARCH LINK:\n` +
    (misses.length ? misses.map((m) => "  - " + m).join("\n") : "  (none)") +
    `\n\nMATCHED THIS RUN:\n` +
    (hits.length ? hits.map((h) => "  - " + h).join("\n") : "  (none new)") +
    "\n";
  writeFileSync(REPORT_PATH, report);

  console.log(
    `\n${Object.keys(sorted).length} direct links in goodreads.json, ` +
      `${misses.length} using the search-link fallback. See goodreads.report.txt.`
  );

  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [join(HERE, "build-data.mjs")], { stdio: "inherit" });
  process.exit(r.status ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
