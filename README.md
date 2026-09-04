# Rowberrys Reading Reviews

A small, warm, static website that shows your book recommendations, organized
into four shelves: **Professional**, **Junior**, **High School**, and **Adult**.

No backend, no database, no login, no build step. It's plain HTML, CSS, and
JavaScript — upload the folder to any static host and it works.

---

## Preview it on your computer

**The quick way:** double‑click `index.html`. It opens in your browser and
works as‑is.

**The nicer way (a real `http://` address):**

```bash
node tools/serve.mjs
```

Then open <http://localhost:4173>. Press `Ctrl+C` to stop. Pass a different port
with `node tools/serve.mjs 8080`.

---

## Put it on the internet (pick one — all free)

The whole folder is the website. There is nothing to compile.

### Netlify Drop (easiest)
1. Go to <https://app.netlify.com/drop>.
2. Drag this entire `recommended-books-site` folder onto the page.
3. You get a live link in a few seconds. Share it.

To use your own domain or update it later, make a free Netlify account and it
will keep the same link.

### GitHub Pages
1. Create a new repository and upload the contents of this folder (so
   `index.html` sits at the top of the repo).
2. Repo **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
4. Your site appears at `https://<your-username>.github.io/<repo-name>/` within a
   minute or two.

### Cloudflare Pages
1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Upload assets**.
2. Upload this folder. Build command: *(leave blank)*. Output directory: `/`.
3. Deploy.

---

## Editing the site

### The welcome message and shelf blurbs
- The personal hello on the home page is in **`index.html`**, marked with a big
  `<!-- WELCOME BLURB -->` comment so it's easy to find.
- Each shelf's one‑line intro is near the top of its page
  (`professional.html`, `junior.html`, `highschool.html`, `adult.html`),
  marked `<!-- EDIT: shelf blurb -->`.
- Change the text between the tags, save, reload. That's it.

### The books themselves
`books-data.json` is the source of truth for every title, author, rating,
review, and the "essential read" flag. It's a straight export of your Goodreads
shelves.

If you edit it (fix a rating, add a book, tweak a review), run:

```bash
node tools/build-data.mjs
```

That rebuilds `assets/site-data.js`, which is the bundle the pages actually
read. Reload the site to see the change.

> Why the extra step? Bundling the data into a `.js` file is what lets the site
> work when you just double‑click `index.html`, with no server.

### Covers for books you add
Covers come from the [Open Library](https://openlibrary.org) cover archive.
Existing books already have theirs (stored in `covers.json`). If you **add**
books to `books-data.json`, fetch covers for the new ones with:

```bash
node tools/fetch-covers.mjs
```

It only looks up books it doesn't already have (add `--force` to re‑check all),
and it runs `build-data.mjs` for you at the end. Any book it can't find a cover
for gets a nicely lettered fallback tile instead of a broken image — see
`covers.report.txt` for the current list (2 books, both obscure box‑set /
indie titles).

### Goodreads links for books you add
Every card ends with a **"More on Goodreads"** link. Goodreads search is full of
SEO "Summary of ‑‑‑" / "Study Guide" knockoffs that can outrank the real book,
so `tools/fetch-goodreads.mjs` doesn't just link to a search — it searches a few
ways, throws out anything that looks like a knockoff, and picks the real book by
matching title/author and preferring whichever edition has by far the most
ratings (the giveaway of the genuine, popular edition). Run it after adding
books:

```bash
node tools/fetch-goodreads.mjs
```

Same pattern as covers: only looks up new books (`--force` to redo all), runs
`build-data.mjs` at the end, and anything it isn't confident about just falls
back to a plain title+author search link instead of a wrong one — see
`goodreads.report.txt` for which books that applies to.

Goodreads currently has **60 of 120** books matched to their real page; the
other 60 use the search-link fallback for now (still a working link, just not
a guaranteed direct one). That's not a data problem — mid-run, Goodreads
started showing its bot-verification challenge page, and this tool stops
cleanly rather than trying to get past that. Just re-run
`node tools/fetch-goodreads.mjs` another day; it picks up right where it left
off and only spends requests on books still missing a direct link.

### Hiding a book, or hiding just its review
Open **`assets/app.js`**. Right at the top, under **EDITORIAL CONTROLS**, are two
short lists:

- `HIDE_BOOKS` — drop a book from the site entirely.
- `HIDE_REVIEW` — keep the book, but don't print its review text.

Each entry is `"Exact Title::Exact Author"`. Save and reload — no rebuild needed.

---

## Editorial notes (things from your data worth a look)

These came out of the `notes` in `books-data.json`. None of them break the site;
they're judgment calls that are yours to make.

1. ***The Warded Man* (Peter V. Brett), Adult shelf — removed.**
   You rated it 1 star, which for you means "don't recommend" regardless of
   Goodreads shelf tags, and your own review separately flagged disturbing
   sexual‑violence content. It's excluded via `HIDE_BOOKS` in `assets/app.js`
   rather than deleted from `books-data.json`, so your Goodreads export stays
   intact and it won't reappear if you re‑export later. To bring it back,
   delete its line from `HIDE_BOOKS`.

2. **The Holy Bible: King James Version — not on the site.**
   It's on your Goodreads "have‑to‑read" shelf but was never filed under any of
   the four shelf categories, so it isn't in `books-data.json` and isn't shown.
   If you want it, add it to the relevant category's `books` array in
   `books-data.json` (with `"have_to_read": true`), then run
   `node tools/fetch-covers.mjs`.

3. ***The Little Prince* — no rating.** You read it but never starred it, so its
   card shows the cover, title, and author with **no stars** (rather than an
   empty zero‑star row). Nothing to fix; just so you know why it looks different.

4. **Truncated reviews.** Goodreads cut off a couple of your longer reviews
   (e.g. *Die with Zero*). The site trims the "(truncated by Goodreads)" marker
   and ends the quote with an ellipsis. If you want the full text, paste it into
   that book's `review` in `books-data.json` and run `node tools/build-data.mjs`.

5. **Books you tagged "do‑not‑recommend"** were already removed from
   `books-data.json` before it got here (8 titles). They are not on the site and
   won't come back unless you add them by hand.

---

## What's in this folder

```
recommended-books-site/
├── index.html              Home page (title, welcome blurb, four shelf tiles)
├── professional.html        ┐
├── junior.html              │  One page per shelf. Each is a small shell;
├── highschool.html          │  the book grid is filled in by assets/app.js.
├── adult.html               ┘
├── books-data.json          Source of truth: every book, rating, review, flag
├── covers.json              Open Library cover IDs (generated)
├── covers.report.txt        Which books have no cover (generated)
├── goodreads.json           Real Goodreads book-page URLs (generated)
├── goodreads.report.txt     Which books fall back to a search link (generated)
├── assets/
│   ├── styles.css           All styling
│   ├── app.js               Page logic + the EDITORIAL CONTROLS at the top
│   └── site-data.js          books-data.json + covers.json + goodreads.json bundled (generated)
├── tools/
│   ├── serve.mjs            Tiny local preview server (optional)
│   ├── build-data.mjs       Rebuild site-data.js after editing books-data.json
│   ├── fetch-covers.mjs     Look up covers for newly added books
│   └── fetch-goodreads.mjs  Look up Goodreads book pages for newly added books
└── README.md
```

`site-data.js`, `covers.json`, `covers.report.txt`, `goodreads.json`, and
`goodreads.report.txt` are all generated. If they ever look out of sync, run
`node tools/fetch-covers.mjs && node tools/fetch-goodreads.mjs` to rebuild
everything.

---

## Features

- Fully responsive — built to be opened on a phone as often as a laptop.
- Each shelf page has a **"Must‑reads only"** toggle and a **Sort** menu
  (rating, shelf order, title, author) — sorted by rating high‑to‑low by
  default, so your top picks lead each shelf. Your choice is saved in the
  page's web address, so a filtered view can be bookmarked or shared.
- **Essential reads** (your Goodreads "have‑to‑read" shelf) get a gold frame
  and an "Essential Read" corner ribbon.
- Book covers load from Open Library; anything without a cover gets a lettered
  fallback tile, never a broken image.
- Every card ends with a **"More on Goodreads"** link (opens in a new tab) for
  anyone who wants details, other readers' reviews, or to add it to their own
  shelf. It links straight to the real book page wherever `goodreads.json`
  found a confident match; the rest fall back to a title+author search
  (see `goodreads.report.txt` for exactly which).
- Works with no internet for everything except the cover images.
- No analytics, no tracking, no cookies.

---

## Credits

- Book ratings, reviews, and shelves: your Goodreads library.
- Cover images: the [Open Library](https://openlibrary.org) Covers API
  (Internet Archive).
- "More on Goodreads" links point back to [goodreads.com](https://www.goodreads.com).
- Fonts: Playfair Display and Source Serif 4, served by Google Fonts. To avoid
  that one external request, download the font files, drop them in `assets/`,
  and replace the `<link>` tags in the HTML `<head>` with a local `@font-face`
  block. The site already falls back to system serif fonts if Google Fonts is
  blocked.
