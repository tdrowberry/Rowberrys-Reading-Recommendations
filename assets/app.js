/* =============================================================================
   Rowberry's Reading Recs — page logic
   Plain browser JavaScript, no framework, no build step.
   Reads window.SITE_DATA (from assets/site-data.js) and renders:
     • the four shelf tiles on the home page
     • the book grid + filter/sort toolbar on each category page
   ============================================================================= */
(function () {
  "use strict";

  var DATA = window.SITE_DATA || { books: { categories: [] }, covers: {}, goodreads: {} };
  var CATEGORIES = (DATA.books && DATA.books.categories) || [];
  var COVERS = DATA.covers || {};
  var GOODREADS = DATA.goodreads || {};

  /* ---------------------------------------------------------------------------
     EDITORIAL CONTROLS  —  safe to edit; just reload the page afterward.
     --------------------------------------------------------------------------- */

  // Hide a book from the site completely. Format: "Exact Title::Exact Author".
  // "The Warded Man" is hidden: Tyler rates it 1 star, which for him means
  // "don't recommend" regardless of Goodreads shelf tags — and its own review
  // separately flagged disturbing sexual-violence content (see README →
  // "Editorial notes").
  var HIDE_BOOKS = [
    "The Warded Man (Demon Cycle #1)::Peter V. Brett",
  ];

  // Keep a book's card, but don't print its review text.
  var HIDE_REVIEW = [];

  /* --------------------------------------------------------------------------- */

  var SHORT_LABEL = {
    professional: "Professional",
    junior: "Junior",
    highschool: "High School",
    adult: "Adult"
  };
  var ROMAN = ["I", "II", "III", "IV"];
  var HOME_ORDER = ["professional", "junior", "highschool", "adult"];

  var hideBooks = new Set(HIDE_BOOKS.map(function (s) { return s.toLowerCase(); }));
  var hideReview = new Set(HIDE_REVIEW.map(function (s) { return s.toLowerCase(); }));

  /* ---- helpers ------------------------------------------------------------- */

  // Must match keyFor() in tools/fetch-covers.mjs and tools/build-data.mjs.
  function keyFor(title, author) {
    return String(title).trim().toLowerCase() + "::" + String(author).trim().toLowerCase();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function coverSrc(title, author) {
    var hit = COVERS[keyFor(title, author)];
    return hit && typeof hit.cover_i === "number"
      ? "https://covers.openlibrary.org/b/id/" + hit.cover_i + "-L.jpg"
      : null;
  }

  var PH_COLORS = ["#3c5a45", "#5f2a2f", "#3f4a3a", "#6b4a2b", "#4a3550", "#334a4a", "#5a3d24"];
  function phColor(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return PH_COLORS[h % PH_COLORS.length];
  }

  function cleanReview(text) {
    if (text == null) return null;
    var raw = String(text).trim();
    if (!raw) return null;
    var wasTruncated = /\(truncated by Goodreads\)/i.test(raw);
    var t = raw
      .replace(/\s*\(truncated by Goodreads\)\s*$/i, "")
      .replace(/\s*\.\.\.\s*more\s*$/i, "")
      .replace(/\s*[.…]{2,}\s*$/, "…")
      .replace(/\s+$/, "");
    if (wasTruncated && !/…$/.test(t)) t += "…";
    return t || null;
  }

  function starsMarkup(rating) {
    if (rating == null) return "";
    var r = Math.max(0, Math.min(5, Math.round(rating)));
    var out = '<span class="stars" role="img" aria-label="Tyler’s rating: ' +
      r + ' out of 5">';
    for (var i = 1; i <= 5; i++) {
      out += i <= r
        ? '<span class="is-full" aria-hidden="true">★</span>'
        : '<span class="is-empty" aria-hidden="true">☆</span>';
    }
    return out + "</span>";
  }

  function primaryAuthor(author) {
    return String(author).split(/,\s*adapted by|,| and | & |;/i)[0].trim();
  }
  function sortName(author) {
    var parts = primaryAuthor(author).split(/\s+/);
    return (parts[parts.length - 1] || author).toLowerCase();
  }
  function titleSortKey(title) {
    return String(title).replace(/^(the|a|an)\s+/i, "").toLowerCase();
  }

  // Prefer the real Goodreads book page (looked up ahead of time by
  // tools/fetch-goodreads.mjs into goodreads.json, since Goodreads search is
  // full of "Summary of ..." knockoffs that can outrank the real book). Any
  // book that script couldn't confidently match falls back to a plain
  // title+author search link.
  function goodreadsUrl(title, author) {
    var hit = GOODREADS[keyFor(title, author)];
    if (hit && hit.url) return hit.url;
    var q = String(title) + " " + primaryAuthor(author);
    return "https://www.goodreads.com/search?q=" + encodeURIComponent(q);
  }

  function placeholderHtml(book) {
    return '<div class="card__ph" style="--ph:' + phColor(book.title || "") + '" ' +
      'role="img" aria-label="No cover image for ' + escapeHtml(book.title) + '">' +
      '<span class="card__ph-title">' + escapeHtml(book.title) + '</span>' +
      '<span class="card__ph-rule"></span>' +
      '<span class="card__ph-author">' + escapeHtml(book.author) + '</span>' +
      '</div>';
  }

  function cardMarkup(book, catId) {
    var key = keyFor(book.title, book.author);
    var essential = !!book.have_to_read;
    var src = coverSrc(book.title, book.author);
    var review = hideReview.has(key) ? null : cleanReview(book.review);

    var cover = src
      ? '<img class="card__cover" src="' + src + '" loading="lazy" decoding="async" ' +
        'alt="Book cover: ' + escapeHtml(book.title) + '" ' +
        'data-title="' + escapeHtml(book.title) + '" ' +
        'data-author="' + escapeHtml(book.author) + '">'
      : placeholderHtml(book);

    return '' +
      '<li class="card' + (essential ? ' is-essential' : '') + '">' +
        (essential
          ? '<div class="card__ribbon-wrap" aria-hidden="true">' +
            '<span class="card__ribbon">Essential Read</span></div>'
          : '') +
        '<figure class="card__cover-wrap">' +
          cover +
          '<span class="card__badge badge--' + catId + '">' +
            escapeHtml(SHORT_LABEL[catId] || catId) + '</span>' +
        '</figure>' +
        '<div class="card__body">' +
          '<h3 class="card__title">' + escapeHtml(book.title) + '</h3>' +
          '<p class="card__author">' + escapeHtml(book.author) + '</p>' +
          starsMarkup(book.rating) +
          (review
            ? '<blockquote class="review is-clamped"><p>' + escapeHtml(review) + '</p></blockquote>'
            : '') +
          '<a class="card__more" href="' + goodreadsUrl(book.title, book.author) + '" ' +
            'target="_blank" rel="noopener noreferrer" ' +
            'aria-label="More about ' + escapeHtml(book.title) + ' on Goodreads">' +
            'More on Goodreads<span aria-hidden="true"> ↗</span></a>' +
        '</div>' +
      '</li>';
  }

  /* ---- reviews: add a Read more toggle only where text is actually clipped -- */

  function hydrateReviews(scope) {
    var run = function () {
      var clamped = scope.querySelectorAll(".review.is-clamped");
      for (var i = 0; i < clamped.length; i++) {
        var bq = clamped[i];
        if (bq.querySelector(".review__toggle")) continue;
        var p = bq.querySelector("p");
        if (p.scrollHeight - p.clientHeight > 4) addToggle(bq);
      }
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(run);
    }
    requestAnimationFrame(run);
  }

  function addToggle(blockquote) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "review__toggle";
    btn.textContent = "Read more";
    btn.addEventListener("click", function () {
      var stillClamped = blockquote.classList.toggle("is-clamped");
      btn.textContent = stillClamped ? "Read more" : "Show less";
    });
    blockquote.appendChild(btn);
  }

  /* ---- covers that fail to load fall back to the lettered placeholder ------ */

  function wireCoverFallback(grid) {
    grid.addEventListener(
      "error",
      function (e) {
        var img = e.target;
        if (!img || img.tagName !== "IMG" || !img.classList.contains("card__cover")) return;
        var fig = img.parentNode;
        var book = { title: img.dataset.title, author: img.dataset.author };
        img.remove();
        fig.insertAdjacentHTML("afterbegin", placeholderHtml(book));
      },
      true // capture: image load errors don't bubble
    );
  }

  /* ---- home page -------------------------------------------------------------*/

  function renderHome() {
    var wrap = document.querySelector("[data-tiles]");
    if (!wrap) return;
    wrap.innerHTML = HOME_ORDER.map(function (id, idx) {
      var cat = CATEGORIES.find(function (c) { return c.id === id; });
      if (!cat) return "";
      var visible = cat.books.filter(function (b) {
        return !hideBooks.has(keyFor(b.title, b.author));
      });
      var essential = visible.filter(function (b) { return b.have_to_read; }).length;
      return '' +
        '<a class="tile" href="' + id + '.html">' +
          '<span class="tile__index">Shelf ' + ROMAN[idx] + '</span>' +
          '<span class="tile__name">' + escapeHtml(cat.label) + '</span>' +
          '<span class="tile__meta">' +
            '<span class="tile__count">' + visible.length + ' books</span>' +
            (essential
              ? '<span class="tile__essential">✦ ' + essential + ' essential</span>'
              : '') +
          '</span>' +
          '<span class="tile__cta">Browse the shelf →</span>' +
        '</a>';
    }).join("");
  }

  /* ---- category page --------------------------------------------------------*/

  function sortBooks(list, mode) {
    var arr = list.slice();
    var ratedDesc = function (r) { return r == null ? -1 : r; };
    var ratedAsc = function (r) { return r == null ? 99 : r; };
    switch (mode) {
      case "rating-desc":
        return arr.sort(function (a, b) {
          return ratedDesc(b.rating) - ratedDesc(a.rating) ||
            titleSortKey(a.title).localeCompare(titleSortKey(b.title));
        });
      case "rating-asc":
        return arr.sort(function (a, b) {
          return ratedAsc(a.rating) - ratedAsc(b.rating) ||
            titleSortKey(a.title).localeCompare(titleSortKey(b.title));
        });
      case "title":
        return arr.sort(function (a, b) {
          return titleSortKey(a.title).localeCompare(titleSortKey(b.title));
        });
      case "author":
        return arr.sort(function (a, b) {
          return sortName(a.author).localeCompare(sortName(b.author)) ||
            titleSortKey(a.title).localeCompare(titleSortKey(b.title));
        });
      default:
        return arr; // shelf order (as exported from Goodreads)
    }
  }

  function renderCategory() {
    var catId = document.body.dataset.category;
    var cat = CATEGORIES.find(function (c) { return c.id === catId; });
    var grid = document.querySelector("[data-grid]");
    if (!cat || !grid) return;

    var books = cat.books.filter(function (b) {
      return !hideBooks.has(keyFor(b.title, b.author));
    });
    var essentialTotal = books.filter(function (b) { return b.have_to_read; }).length;

    var toolbar = document.querySelector("[data-toolbar]");
    var mustEl = document.querySelector("[data-must]");
    var sortEl = document.querySelector("[data-sort]");
    var countEl = document.querySelector("[data-count]");
    var viewBtns = document.querySelectorAll("[data-view-btn]");

    var params = new URLSearchParams(location.search);
    if (mustEl) mustEl.checked = params.get("must") === "1";
    if (sortEl && params.get("sort")) sortEl.value = params.get("sort");
    var view = params.get("view") === "list" ? "list" : "card";
    if (toolbar) toolbar.hidden = false;

    wireCoverFallback(grid);

    function setView(next) {
      view = next === "list" ? "list" : "card";
      grid.dataset.view = view;
      for (var i = 0; i < viewBtns.length; i++) {
        var isActive = viewBtns[i].dataset.viewBtn === view;
        viewBtns[i].setAttribute("aria-pressed", String(isActive));
      }
    }

    function apply() {
      var list = books.slice();
      if (mustEl && mustEl.checked) {
        list = list.filter(function (b) { return b.have_to_read; });
      }
      list = sortBooks(list, sortEl ? sortEl.value : "shelf");

      grid.innerHTML = list.length
        ? list.map(function (b) { return cardMarkup(b, catId); }).join("")
        : '<li class="book-grid__empty">No books match this filter yet.</li>';
      hydrateReviews(grid);

      if (countEl) {
        var showing = list.length === books.length
          ? "Showing all " + books.length + " books"
          : "Showing " + list.length + " of " + books.length + " books";
        countEl.textContent = showing +
          (essentialTotal
            ? " · " + essentialTotal + " essential read" + (essentialTotal === 1 ? "" : "s")
            : "");
      }

      var next = new URLSearchParams();
      if (mustEl && mustEl.checked) next.set("must", "1");
      if (sortEl && sortEl.value !== "rating-desc") next.set("sort", sortEl.value);
      if (view !== "card") next.set("view", view);
      var qs = next.toString();
      history.replaceState(null, "", qs ? "?" + qs : location.pathname);
    }

    setView(view);
    for (var i = 0; i < viewBtns.length; i++) {
      viewBtns[i].addEventListener("click", function () {
        setView(this.dataset.viewBtn);
        apply();
      });
    }
    if (mustEl) mustEl.addEventListener("change", apply);
    if (sortEl) sortEl.addEventListener("change", apply);
    apply();
  }

  /* ---- boot --------------------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", function () {
    var yearEl = document.querySelector("[data-year]");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    if (document.body.dataset.page === "home") renderHome();
    if (document.body.dataset.category) renderCategory();
  });
})();
