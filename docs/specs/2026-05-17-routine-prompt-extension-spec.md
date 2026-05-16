# Routine Prompt Extension — Reference Spec

**Scope:** This document defines the three new output blocks the Claude routine must produce alongside the existing per-article `summaries` map. It is the canonical reference for anyone updating the routine prompt.

---

## New output blocks

The routine's JSON output must include three top-level keys in addition to the existing `summaries` map:

### 1. `editorial.overall_en` and `editorial.overall_zh`

**Type:** `string` (both)

A 2–4 sentence editorial narrative covering the day's most significant themes. Written in the voice of a senior AI analyst. Not a list of headlines — a coherent paragraph that gives the reader a frame for the day.

- `overall_en` — always required.
- `overall_zh` — required when token budget allows. Drop this first if the budget is tight.

**Example:**
```json
{
  "editorial": {
    "overall_en": "Today's digest is defined by a race to context...",
    "overall_zh": "今日精选的核心主题是上下文窗口之争..."
  }
}
```

---

### 2. `editorial.cuts[]`

**Type:** `Array<{ article_id, commentary_en, commentary_zh? }>`

An ordered list of articles the editor selected as "Editor's Cut". Each cut gets a 1–3 sentence commentary explaining *why* this article matters beyond its headline.

| Field | Type | Required | Notes |
|---|---|---|---|
| `article_id` | `string` | Yes | Must match `article_id` field on the corresponding article item |
| `commentary_en` | `string` | Yes | 1–3 sentences in English |
| `commentary_zh` | `string` | No | 1–3 sentences in Chinese. Omit (or set null) when token budget is tight — renderer shows "(English only today)" fallback per mockup 25 |

**Token-budget drop order:**
1. Drop `commentary_zh` on individual cuts first (set to null or omit).
2. Drop `editorial.overall_zh` next.
3. Never drop `commentary_en`, `overall_en`, or any `translations[]` entry.

**Target:** 2–5 cuts per day. More than 8 cuts should be avoided — the Editor's Cut is a curated highlight, not a second list.

**Example:**
```json
{
  "editorial": {
    "cuts": [
      {
        "article_id": "aihot-a3f12b8c",
        "commentary_en": "The 1M context window matters less for 'fits a novel'...",
        "commentary_zh": "100万上下文窗口的意义不在于..."
      },
      {
        "article_id": "aihot-b7e29d1f",
        "commentary_en": "DeepSeek's response shows competitive dynamics heating up.",
        "commentary_zh": null
      }
    ]
  }
}
```

---

### 3. `translations[]`

**Type:** `Array<{ article_id, slug, title, source, originalUrl, publishedAt, excerpt_en }>`

CN-source articles that receive an English translation excerpt page at `/articles/<slug>/`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `article_id` | `string` | Yes | Must match `article_id` on the article item |
| `slug` | `string` | Yes | Stable URL slug — use `translationSlug(source, title, url)` from `scripts/lib/translations.mjs` |
| `title` | `string` | Yes | Article title (original or cleaned) |
| `source` | `string` | Yes | Source identifier (e.g. `AIHOT`) |
| `originalUrl` | `string` | Yes | Canonical URL of the CN-source article |
| `publishedAt` | `string` | Yes | ISO 8601 date/time |
| `excerpt_en` | `string \| null` | Yes | 3–5 paragraph English excerpt. Set to `null` when translation is not ready — renderer shows placeholder per mockup 30 |

**Legal note:** Excerpt-only. The full article is never reproduced. The canonical link always points to the CN source. The `isBasedOn` JSON-LD field marks the original as the authoritative source.

**Target:** All CN-source articles in the digest (typically from AIHOT). The routine should include every AIHOT item that received a Claude summary.

**Example:**
```json
{
  "translations": [
    {
      "article_id": "aihot-a3f12b8c",
      "slug": "aihot-claude-4-7-launches-a3f12b8c",
      "title": "Claude 4.7 launches",
      "source": "AIHOT",
      "originalUrl": "https://www.aihot.com/a/1",
      "publishedAt": "2026-05-17T10:00:00Z",
      "excerpt_en": "Anthropic has launched Claude 4.7...\n\nThe new model demonstrates...\n\nBenchmark results show..."
    }
  ]
}
```

---

## Complete output schema

```json
{
  "summaries": { ... },
  "editorial": {
    "overall_en": "string — required",
    "overall_zh": "string — drop first if budget tight",
    "cuts": [
      {
        "article_id": "string",
        "commentary_en": "string — required",
        "commentary_zh": "string | null"
      }
    ]
  },
  "translations": [
    {
      "article_id": "string",
      "slug": "string",
      "title": "string",
      "source": "string",
      "originalUrl": "string",
      "publishedAt": "string (ISO 8601)",
      "excerpt_en": "string | null"
    }
  ]
}
```

---

## Renderer behaviour reference

| Field | Absent | Present |
|---|---|---|
| `editorial` block | No Editor's Cut boxes rendered | Boxes rendered on cut cards |
| `commentary_zh` | `commentary_zh_fallback=true` set by `normaliseSummaries()`; mockup 25 fallback shown | ZH text swapped in on lang toggle |
| `overall_zh` | EN overall shown in ZH email | ZH overall shown in ZH email |
| `translations[]` | No `/articles/<slug>/` pages generated | Pages generated; CN card titles dual-linked |
| `excerpt_en` = null | Placeholder page (mockup 30) | Populated translation page (mockup 29) |
