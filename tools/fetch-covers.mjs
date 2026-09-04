#!/usr/bin/env node
/**
 * fetch-covers.mjs
 * -----------------------------------------------------------------------------
 * Looks up an Open Library cover id (`cover_i`) for every book in
 * ../books-data.json and writes ../covers.json:
 *
 *   { "<title lowercased>::<author lowercased>": { "cover_i": 12345 } }
 *
 * The website reads covers.json and builds cover image URLs like
 *   https://covers.openlibrary.org/b/id/<cover_i>-L.jpg
 * Books with no match are simply left out of covers.json; the site then
 * renders its lettered placeholder for them.
 *
 * Re-run this any time you change books-data.json (add/remove books):
 *   node tools/fetch-covers.mjs
 *
 * It only hits the network for books not already in covers.json unless you
 * pass --force to re-check everything.
 * -----------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, "..", "books-data.json");
const OUT_PATH = join(HERE, "..", "covers.json");
const REPORT_PATH = join(HERE, "..", "covers.report.txt");

const FORCE = process.argv.includes("--force");
const UA =
  "TylerRowberryRecommendedBooks/1.0 (personal static site; contact tdrowberry@gmail.com)";
const DELAY_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Must match keyFor() in assets/data.js */
const keyFor = (title, author) =>
  `${String(title).trim().toLowerCase()}::${String(author).trim().toLowerCase()}`;

/** First real author name: strip "adapted by ...", take first of a list. */
function primaryAuthor(author) {
  return String(author)
    .split(/,\s*adapted by|,| and | & |;/i)[0]
    .replace(/\(.*?\)/g, "")
    .trim();
}

/** Progressively looser title variants to try. */
function titleVariants(title) {
  const raw = String(title).trim();
  const noParens = raw.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const noSubtitle = noParens.split(/[:—–]/)[0].trim();
  const noEditionWords = noParens
    .replace(/\b(illustrated edition|the \d{4} text|deluxe edition|anniversary edition)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([raw, noParens, noEditionWords, noSubtitle])].filter(Boolean);
}

async function ol(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function pickDoc(docs, wantAuthor) {
  if (!Array.isArray(docs)) return null;
  const withCover = docs.filter((d) => d && Number.isFinite(d.cover_i));
  if (!withCover.length) return null;
  const want = wantAuthor.toLowerCase();
  const authorMatch = withCover.find((d) =>
    (d.author_name || []).some(
      (a) => a.toLowerCase().includes(want) || want.includes(a.toLowerCase())
    )
  );
  return authorMatch || withCover[0];
}

async function lookup(title, author) {
  const author1 = primaryAuthor(author);
  const fields = "key,title,author_name,cover_i,edition_count,first_publish_year";

  for (const t of titleVariants(title)) {
    const url =
      `https://openlibrary.org/search.json?title=${encodeURIComponent(t)}` +
      `&author=${encodeURIComponent(author1)}&limit=5&fields=${fields}`;
    try {
      const data = await ol(url);
      const doc = pickDoc(data.docs, author1);
      if (doc) return { cover_i: doc.cover_i, via: `title+author "${t}"`, ol_title: doc.title };
    } catch (e) {
      console.warn("  ! " + e.message);
    }
    await sleep(DELAY_MS);
  }

  // Last resort: general query, title only.
  const t0 = titleVariants(title)[1] || title;
  try {
    const data = await ol(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(
        t0 + " " + author1
      )}&limit=5&fields=${fields}`
    );
    const doc = pickDoc(data.docs, author1);
    if (doc) return { cover_i: doc.cover_i, via: "q fallback", ol_title: doc.title };
  } catch (e) {
    console.warn("  ! " + e.message);
  }
  return null;
}

async function main() {
  const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const existing =
    !FORCE && existsSync(OUT_PATH)
      ? JSON.parse(readFileSync(OUT_PATH, "utf8"))
      : {};

  // Unique books across all categories.
  const books = new Map();
  for (const cat of data.categories) {
    for (const b of cat.books) books.set(keyFor(b.title, b.author), b);
  }

  const out = { ...existing };
  const hits = [];
  const misses = [];
  let i = 0;

  for (const [key, b] of books) {
    i++;
    const tag = `[${i}/${books.size}]`;
    if (out[key] && Number.isFinite(out[key].cover_i)) {
      console.log(`${tag} cached   ${b.title}`);
      continue;
    }
    process.stdout.write(`${tag} lookup   ${b.title} — ${b.author} ... `);
    try {
      const found = await lookup(b.title, b.author);
      if (found) {
        out[key] = { cover_i: found.cover_i };
        hits.push(`${b.title} — ${b.author}  ->  cover_i ${found.cover_i}  (${found.via})`);
        console.log(`cover_i ${found.cover_i}`);
      } else {
        misses.push(`${b.title} — ${b.author}`);
        console.log("NO MATCH (placeholder)");
      }
    } catch (e) {
      misses.push(`${b.title} — ${b.author}  (error: ${e.message})`);
      console.log("ERROR " + e.message);
    }
    await sleep(DELAY_MS);
  }

  // Stable key order.
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n");

  const report =
    `Cover lookup report — ${new Date().toISOString()}\n` +
    `${hits.length} matched, ${misses.length} without a cover (these use the lettered placeholder)\n\n` +
    `WITHOUT COVER:\n` +
    (misses.length ? misses.map((m) => "  - " + m).join("\n") : "  (none)") +
    `\n\nMATCHED THIS RUN:\n` +
    (hits.length ? hits.map((h) => "  - " + h).join("\n") : "  (none new)") +
    "\n";
  writeFileSync(REPORT_PATH, report);

  console.log(
    `\n${Object.keys(sorted).length} covers in covers.json, ` +
      `${misses.length} placeholders. See covers.report.txt.`
  );

  // Rebuild the bundled site data so the site picks up the new covers.
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [join(HERE, "build-data.mjs")], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
