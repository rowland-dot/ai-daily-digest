"""Generate a daily digest narration MP3 from the bridged JSON snapshots.

Uses Microsoft Edge TTS (the free `edge-tts` Python lib) to render each
section with an appropriate voice — Mandarin (zh-CN-XiaoxiaoNeural) for
AIHOT items, English (en-US-AriaNeural) for everything else — then
concatenates the per-section MP3s into docs/digest.mp3.

Requires: `pip install edge-tts` + ffmpeg on PATH.

The workflow runs this between fetch-sources.mjs and render-site.mjs so
the MP3 lives alongside the rendered HTML in the Pages artifact.
"""
from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = Path("data")
SITE = Path("docs")
SITE.mkdir(parents=True, exist_ok=True)
SEGS = Path("audio-segments")
SEGS.mkdir(exist_ok=True)

EN_VOICE = "en-US-AriaNeural"
ZH_VOICE = "zh-CN-XiaoxiaoNeural"

# Three tracks, one per language mode. Each entry: (lang_code, voice)
LANGUAGE_TRACKS = [
    ("mix", None),   # Mix uses original voice per segment
    ("en", EN_VOICE),
    ("zh", ZH_VOICE),
]

# --- Translation ---

_TRANS_CACHE_FILE = Path("data/translation-cache.json")
_trans_cache: dict[str, str] = {}


def _load_trans_cache() -> dict[str, str]:
    global _trans_cache
    if _trans_cache:
        return _trans_cache
    if _TRANS_CACHE_FILE.exists():
        try:
            _trans_cache = json.loads(_TRANS_CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            _trans_cache = {}
    return _trans_cache


def _save_trans_cache():
    try:
        _TRANS_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _TRANS_CACHE_FILE.write_text(json.dumps(_trans_cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception as e:
        print(f"[warn] could not save translation cache: {e}", file=sys.stderr)


def is_chinese(text: str) -> bool:
    return any("一" <= c <= "鿿" for c in (text or ""))


def translate(text: str, target_lang: str) -> str:
    """Translate text to target_lang ('en' or 'zh').
    Skips no-op cases (target lang matches source).
    Caches results across runs via data/translation-cache.json.
    Falls back to original text on failure."""
    if not text or not text.strip():
        return text
    text_has_zh = is_chinese(text)
    if target_lang == "en" and not text_has_zh:
        return text
    if target_lang == "zh" and text_has_zh:
        return text
    cache = _load_trans_cache()
    key = f"{target_lang}::{text}"
    if key in cache:
        return cache[key]
    try:
        from deep_translator import GoogleTranslator
        src = "zh-CN" if text_has_zh else "auto"
        tgt = "en" if target_lang == "en" else "zh-CN"
        translated = GoogleTranslator(source=src, target=tgt).translate(text)
        if translated:
            cache[key] = translated
            return translated
    except Exception as e:
        print(f"[warn] translate({target_lang}) failed for {text[:60]!r}: {e}", file=sys.stderr)
    return text

# Date-window: only items from the last LOOKBACK_HOURS are included.
# Applied to every chronological source (AIHOT, Follow Builders, OpenAI,
# Simon Willison, HN). NOT applied to GitHub Trending (URL already
# ?since=daily) or HuggingFace popular (overall trending, not chrono).
LOOKBACK_HOURS = 24

# AIHOT and Follow Builders: no count cap on top of date filter.
# Other sources: cap at OTHER_CAP after date filter.
OTHER_CAP = 16

NOW = datetime.now(timezone.utc)
CUTOFF = NOW - timedelta(hours=LOOKBACK_HOURS)


def _parse_dt(value):
    """Best-effort parse of ISO / RFC-2822 / unix-epoch into aware UTC datetime."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        ts = value if value > 1e12 else value * 1000
        try:
            return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        except (OSError, OverflowError, ValueError):
            return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        pass
    try:
        from email.utils import parsedate_to_datetime
        d = parsedate_to_datetime(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except (TypeError, ValueError):
        return None


def within_window(value) -> bool:
    """True if value is within LOOKBACK_HOURS of now; True if unparseable
    (defensive — better to over-include than silently drop)."""
    if value is None:
        return True
    dt = _parse_dt(value)
    if dt is None:
        return True
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt >= CUTOFF


def filter_recent(items: list[dict], date_key: str) -> list[dict]:
    return [it for it in (items or []) if within_window((it or {}).get(date_key))]


# --- Text cleanup before TTS ---
# URLs, markdown markers, bracketed metadata, dangling timestamps, etc. all
# read aloud terribly. Strip them aggressively before sending to edge-tts.

URL_RE = re.compile(
    r"(?:https?://|ftp://)\S+"                    # full URLs
    r"|www\.\S+"                                  # www-prefixed
    r"|\b(?:[a-z][a-z0-9-]*\.)+"                  # bare domains, e.g. openai.com/blog
    r"(?:com|net|org|io|co|ai|dev|app|so|me|sh|tv|tech|xyz|news|today|press|"
    r"cn|jp|uk|au|de|fr|us|info|ly|gg|gov|edu|name|cc|to|fyi|sub)"
    r"(?:/\S*)?\b",                               # optional path
    re.IGNORECASE,
)
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")            # [text](url) -> text
MARKDOWN_IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")              # ![alt](url) -> ""
BRACKET_META_RE = re.compile(r"\[(?:via|source|update|note|edit)[^\]]*\]", re.IGNORECASE)
PAREN_DATE_RE = re.compile(r"\((?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w+\s+\d{2,4}|GMT|UTC)[^)]*\)")
ISO_TIMESTAMP_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\S*")
TIME_HMS_RE = re.compile(r"\b\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|UTC|GMT)?\b", re.IGNORECASE)
CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```")
INLINE_CODE_RE = re.compile(r"`([^`]+)`")
HTML_TAG_RE = re.compile(r"<[^>]+>")
HTML_ENTITY_RE = re.compile(r"&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);")
HASHTAG_RE = re.compile(r"(?<!\w)#(\w+)")                          # #foo -> foo
HANDLE_RE = re.compile(r"(?<!\w)@(\w+)")                           # @foo -> foo
EMOJI_RE = re.compile(
    "["                                                            # broad emoji ranges
    "\U0001F300-\U0001F6FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA70-\U0001FAFF"
    "☀-➿"
    "]+",
    flags=re.UNICODE,
)
WHITESPACE_RE = re.compile(r"\s+")
TRAILING_PUNCT_RE = re.compile(r"[\s,;:\-_/|]+$")


FULLWIDTH_PUNCT_MAP = str.maketrans({
    "：": ":",   # fullwidth colon (U+FF1A)
    "／": "/",   # fullwidth slash (U+FF0F)
    "．": ".",   # fullwidth period (U+FF0E)
    "－": "-",   # fullwidth hyphen-minus (U+FF0D)
    "～": "~",   # fullwidth tilde (U+FF5E)
    "？": "?",   # fullwidth question
    "！": "!",   # fullwidth exclamation
    "＠": "@",   # fullwidth at
    "＃": "#",   # fullwidth hash
})


def clean_for_tts(text: str) -> str:
    """Strip URLs, markdown, tags, hashtags, timestamps, emoji, code, etc.
    Keep prose suitable for being read aloud."""
    if not text:
        return ""
    # Normalise fullwidth CJK punctuation -> ASCII so URL/timestamp/etc.
    # regexes (which use ASCII : / .) can match e.g. "https：//foo" too.
    s = text.translate(FULLWIDTH_PUNCT_MAP)
    s = CODE_BLOCK_RE.sub(" ", s)
    s = MARKDOWN_IMG_RE.sub(" ", s)
    s = MARKDOWN_LINK_RE.sub(r"\1", s)
    s = HTML_TAG_RE.sub(" ", s)
    s = HTML_ENTITY_RE.sub(" ", s)
    s = URL_RE.sub(" ", s)
    s = ISO_TIMESTAMP_RE.sub(" ", s)
    s = PAREN_DATE_RE.sub(" ", s)
    s = TIME_HMS_RE.sub(" ", s)
    s = BRACKET_META_RE.sub(" ", s)
    s = INLINE_CODE_RE.sub(r"\1", s)
    s = HASHTAG_RE.sub(r"\1", s)
    s = HANDLE_RE.sub(r"\1", s)
    s = EMOJI_RE.sub("", s)
    # Replace bare slashes with " slash " when between word characters (model IDs)
    s = re.sub(r"(?<=\w)/(?=\w)", " slash ", s)
    # Strip stray bullets/markers and trim
    s = re.sub(r"^[\s•·\-*]+", "", s)
    s = WHITESPACE_RE.sub(" ", s).strip()
    s = TRAILING_PUNCT_RE.sub("", s)
    return s


def load(name: str) -> dict | None:
    p = DATA / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[warn] could not parse {name}: {e}", file=sys.stderr)
        return None


async def tts_async(text: str, voice: str, out: Path) -> bool:
    """Async TTS via edge_tts Python library (parallelisable). Falls back
    to the CLI on import error."""
    text = text.strip()
    if not text:
        return False
    try:
        import edge_tts
    except ImportError:
        # Fall back to CLI
        return _tts_subprocess(text, voice, out)
    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(out))
        return out.exists() and out.stat().st_size > 0
    except Exception as e:
        print(f"[err] edge-tts failed for {out.name}: {e}", file=sys.stderr)
        return False


def _tts_subprocess(text: str, voice: str, out: Path) -> bool:
    try:
        subprocess.run(
            ["edge-tts", "--voice", voice, "--text", text, "--write-media", str(out)],
            check=True, capture_output=True, text=True,
        )
        return out.exists() and out.stat().st_size > 0
    except subprocess.CalledProcessError as e:
        print(f"[err] edge-tts CLI failed: {e.stderr[:200] if e.stderr else e}", file=sys.stderr)
        return False


async def render_all_segments(jobs: list[tuple[str, str, Path]], concurrency: int = 5):
    """Parallel TTS with bounded concurrency to avoid rate limits."""
    sem = asyncio.Semaphore(concurrency)
    results: list[bool] = [False] * len(jobs)
    async def run_one(i, text, voice, out):
        async with sem:
            results[i] = await tts_async(text, voice, out)
    await asyncio.gather(*(run_one(i, t, v, o) for i, (t, v, o) in enumerate(jobs)))
    return results


def field(d: dict, *keys: str, limit: int = 0) -> str:
    """Get and clean a string field from a dict; optionally cap length."""
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            out = clean_for_tts(v)
            if limit and len(out) > limit:
                out = out[:limit].rsplit(" ", 1)[0]
            return out
    return ""


# Per-article segment builders. Each returns a list of (anchor, text, voice)
# tuples. Anchor is the page-side element id we want to scroll to when this
# segment is being narrated; None means "no scroll" (used for intros).

NEXT_ZH = "下一篇，"
NEXT_EN = "Next,"


def build_aihot_segments(label: str, items: list[dict], section_anchor: str) -> list:
    segs = []
    if label:
        segs.append((None, clean_for_tts(label) + "。", ZH_VOICE))
    for idx, item in enumerate(items):
        parts = []
        if idx > 0:
            parts.append(NEXT_ZH)
        title = field(item, "title")
        summary = field(item, "summary", limit=200)
        if title:
            parts.append(title + "。")
        if summary:
            parts.append(summary + "。")
        if parts:
            segs.append((f"article-{section_anchor}-{idx}", " ".join(parts), ZH_VOICE))
    return segs


def _en_seg(intro: str, items_with_anchors: list[tuple[str, str]]) -> list:
    """Build per-article English segments: intro (no anchor) + one segment
    per article. Each article's text gets a leading 'Next,' from index 1."""
    segs = []
    if intro:
        segs.append((None, intro, EN_VOICE))
    for idx, (anchor, text) in enumerate(items_with_anchors):
        if not text:
            continue
        if idx > 0:
            text = NEXT_EN + " " + text
        segs.append((anchor, text, EN_VOICE))
    return segs


def build_lab_segments(items: list[dict]) -> list:
    rows = []
    for idx, it in enumerate(items[:OTHER_CAP]):
        title = field(it, "title")
        desc = field(it, "description", limit=220)
        parts = []
        if title:
            parts.append(title + ".")
        if desc:
            parts.append(desc + ".")
        rows.append((f"article-labs-{idx}", " ".join(parts)))
    return _en_seg("Lab announcements from OpenAI.", rows)


def build_simon_segments(entries: list[dict]) -> list:
    rows = []
    for idx, e in enumerate(entries[:OTHER_CAP]):
        title = field(e, "title")
        summary = field(e, "summary", limit=220)
        parts = []
        if title:
            parts.append(title + ".")
        if summary:
            parts.append(summary + ".")
        rows.append((f"article-writing-{idx}", " ".join(parts)))
    return _en_seg("Builder writing, from Simon Willison's weblog.", rows)


def build_gh_segments(repos: list[dict]) -> list:
    rows = []
    for idx, r in enumerate(repos[:OTHER_CAP]):
        owner = clean_for_tts(r.get("owner") or "")
        name = clean_for_tts(r.get("name") or "")
        desc = field(r, "description", limit=180)
        stars_today = r.get("starsToday")
        parts = []
        if owner and name:
            parts.append(f"{owner} slash {name}.")
        if desc:
            parts.append(desc + ".")
        if stars_today:
            parts.append(f"{stars_today} stars today.")
        rows.append((f"article-trending-{idx}", " ".join(parts)))
    return _en_seg("Trending on GitHub today.", rows)


def build_hn_segments(items: list[dict]) -> list:
    ai_keywords = (
        "ai", "llm", "gpt", "claude", "gemini", "anthropic", "openai",
        "model", "agent", "prompt", "embedding", "rag", "transformer",
        "neural", "inference", "fine-tun", "train",
    )
    filtered = [
        it for it in items
        if it and it.get("title")
        and any(k in it["title"].lower() for k in ai_keywords)
    ][:OTHER_CAP]
    if not filtered:
        return []
    rows = []
    for idx, it in enumerate(filtered):
        title = field(it, "title")
        score = it.get("score") or 0
        comments = it.get("descendants") or 0
        parts = []
        if title:
            parts.append(title + ".")
        parts.append(f"With {score} points and {comments} comments.")
        rows.append((f"article-hn-{idx}", " ".join(parts)))
    return _en_seg("Top AI stories from Hacker News today.", rows)


def build_hf_segments(models: list[dict]) -> list:
    rows = []
    for idx, m in enumerate(models[:OTHER_CAP]):
        mid = clean_for_tts(m.get("id") or "")
        likes = m.get("likes") or 0
        downloads = m.get("downloads") or 0
        parts = []
        if mid:
            parts.append(f"{mid}.")
        parts.append(f"{likes} likes, {downloads:,} downloads.")
        rows.append((f"article-hf-{idx}", " ".join(parts)))
    return _en_seg("Most-loved models on HuggingFace.", rows)


def build_fb_x_segments(x_feed: dict) -> list:
    all_tweets = []
    for author in x_feed.get("x", []) or []:
        for t in author.get("tweets", []) or []:
            all_tweets.append({**t, "_author": author.get("name", "")})
    all_tweets.sort(key=lambda t: t.get("likes") or 0, reverse=True)
    if not all_tweets:
        return []
    rows = []
    for idx, t in enumerate(all_tweets):
        author = clean_for_tts(t.get("_author") or "")
        text = field(t, "text", limit=240)
        if author and text:
            rows.append((f"article-builders-x-{idx}", f"{author} says: {text}."))
    return _en_seg("Builder voices from X.", rows)


def build_fb_pod_segments(pod_feed: dict) -> list:
    episodes = pod_feed.get("podcasts", []) or []
    if not episodes:
        return []
    rows = []
    for idx, ep in enumerate(episodes):
        name = clean_for_tts(ep.get("name") or "")
        title = field(ep, "title")
        text = ""
        if name and title:
            text = f"{name}: {title}."
        elif title:
            text = title + "."
        if text:
            rows.append((f"article-builders-pod-{idx}", text))
    return _en_seg("New AI podcast episodes.", rows)


def build_fb_blog_segments(blog_feed: dict) -> list:
    blogs = blog_feed.get("blogs", []) or []
    if not blogs:
        return []
    rows = []
    for idx, b in enumerate(blogs):
        name = clean_for_tts(b.get("name") or "")
        title = field(b, "title")
        text = ""
        if name and title:
            text = f"{name}: {title}."
        elif title:
            text = title + "."
        if text:
            rows.append((f"article-builders-blog-{idx}", text))
    return _en_seg("Builder blog posts.", rows)


# edge-tts handles a few thousand chars per call reliably; beyond that
# the service occasionally truncates or rate-limits. Split long section
# text into ~3500-char chunks at sentence boundaries so every item gets
# narrated even when a section has 50+ items.
MAX_TTS_CHARS = 3500


def chunk_text(text: str, max_chars: int = MAX_TTS_CHARS) -> list[str]:
    """Split text at sentence boundaries (。 or .) so chunks stay below max_chars."""
    text = text.strip()
    if len(text) <= max_chars:
        return [text] if text else []
    chunks: list[str] = []
    # Split on sentence-ending punctuation, keeping the punctuation attached.
    parts = re.split(r"(?<=[。.!?！？])\s+", text)
    current = ""
    for p in parts:
        if not p:
            continue
        if len(current) + len(p) + 1 > max_chars and current:
            chunks.append(current.strip())
            current = p
        else:
            current = (current + " " + p) if current else p
    if current.strip():
        chunks.append(current.strip())
    return chunks




def main() -> int:
    manifest = load("manifest.json") or {}
    date_utc = manifest.get("date_utc") or "today"

    # Each entry: (anchor or None, text, voice). One TTS call per entry.
    segments: list[tuple[str | None, str, str]] = []

    # Intro (no anchor — page top stays put)
    segments.append((
        None,
        (
            f"Welcome to the AI Daily Digest for {date_utc}. "
            f"Here's what shipped, what trended, and what AI builders are saying."
        ),
        EN_VOICE,
    ))

    # AIHOT — Chinese
    # Use the per-category items endpoints (same source as the rendered
    # page), falling back to the daily aggregate's sections if a category
    # file is missing. Order matches the page: models → products →
    # industry → papers.
    aihot_daily = load("aihot-daily.json")

    def daily_section(label_hint: str) -> list[dict]:
        if not aihot_daily or not aihot_daily.get("sections"):
            return []
        for sec in aihot_daily["sections"]:
            if label_hint in (sec.get("label") or ""):
                return sec.get("items") or []
        return []

    aihot_categories = [
        ("aihot-ai-models.json", "模型发布与更新", "模型", "models"),
        ("aihot-ai-products.json", "产品与应用", "产品", "products"),
        ("aihot-industry.json", "行业动态", "行业", "industry"),
        ("aihot-paper.json", "研究亮点", "论文", "papers"),
    ]
    for filename, display_label, fallback_hint, anchor in aihot_categories:
        cat = load(filename)
        items = (cat.get("items") if cat else None) or daily_section(fallback_hint)
        items = filter_recent(items, "publishedAt")
        if items:
            segments.extend(build_aihot_segments(display_label, items, anchor))

    oai = load("openai-blog.json")
    if oai and oai.get("items"):
        items = filter_recent(oai["items"], "pubDate")
        if items:
            segments.extend(build_lab_segments(items))

    sw = load("simon-willison.json")
    if sw and sw.get("entries"):
        entries = filter_recent(sw["entries"], "updated")
        if entries:
            segments.extend(build_simon_segments(entries))

    gh = load("github-trending.json")
    if gh and gh.get("repos"):
        segments.extend(build_gh_segments(gh["repos"]))

    hn = load("hn-top.json")
    if hn and hn.get("items"):
        items = [it for it in hn["items"] if it and within_window(it.get("time"))]
        segments.extend(build_hn_segments(items))

    hf = load("hf-popular.json")
    if hf and hf.get("models"):
        segments.extend(build_hf_segments(hf["models"]))

    x_feed = load("follow-builders-x.json")
    if x_feed:
        filtered_authors = []
        for author in x_feed.get("x", []) or []:
            recent = [t for t in (author.get("tweets") or []) if within_window(t.get("createdAt"))]
            if recent:
                filtered_authors.append({**author, "tweets": recent})
        if filtered_authors:
            segments.extend(build_fb_x_segments({"x": filtered_authors}))
    pod_feed = load("follow-builders-podcasts.json")
    if pod_feed:
        episodes = filter_recent(pod_feed.get("podcasts") or [], "publishedAt")
        if episodes:
            segments.extend(build_fb_pod_segments({"podcasts": episodes}))
    blog_feed = load("follow-builders-blogs.json")
    if blog_feed:
        posts = filter_recent(blog_feed.get("blogs") or [], "publishedAt")
        if posts:
            segments.extend(build_fb_blog_segments({"blogs": posts}))

    segments.append((
        None,
        "That's all for today's digest. Full details, links, and the latest trends are on the page.",
        EN_VOICE,
    ))

    def probe_seconds(p: Path) -> float:
        try:
            res = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
                check=True, capture_output=True, text=True,
            )
            return float(res.stdout.strip())
        except Exception as e:
            print(f"[warn] ffprobe failed on {p.name}: {e}", file=sys.stderr)
            return 0.0

    def render_track(track_lang: str, fixed_voice: str | None, out_mp3: Path, cues_out: Path):
        """Render one full track (mix / en / zh).
        For 'mix': use each segment's original voice; no translation.
        For 'en' / 'zh': translate non-target text to target lang;
        use the fixed voice for ALL segments in the track."""
        print(f"\n--- Track [{track_lang}] -> {out_mp3.name} ---")
        # Build per-track jobs
        seg_dir = SEGS / track_lang
        seg_dir.mkdir(parents=True, exist_ok=True)
        jobs: list[tuple[str, str, Path]] = []
        anchors: list[str | None] = []
        for i, (anchor, text, orig_voice) in enumerate(segments):
            if track_lang == "mix":
                t = text
                v = orig_voice
            else:
                target = "en" if track_lang == "en" else "zh"
                t = translate(text, target)
                v = fixed_voice
            jobs.append((t, v, seg_dir / f"{i:04d}.mp3"))
            anchors.append(anchor)

        results = asyncio.run(render_all_segments(jobs, concurrency=5))
        segment_files: list[Path] = []
        segment_anchors: list[str | None] = []
        for i, ok in enumerate(results):
            if ok:
                segment_files.append(jobs[i][2])
                segment_anchors.append(anchors[i])
            else:
                print(f"  [{i:04d}] FAILED — {jobs[i][0][:60]}")

        if not segment_files:
            print(f"[err] track {track_lang} produced no segments")
            return False

        # Build cues per track
        cumulative = 0.0
        cues: list[dict] = []
        for path, anchor in zip(segment_files, segment_anchors):
            dur = probe_seconds(path)
            seg_start = cumulative
            cumulative += dur
            if anchor:
                cues.append({"anchor": anchor, "start": seg_start, "end": cumulative})

        cues_out.write_text(
            json.dumps({"total_duration": cumulative, "cues": cues}, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"[ok] wrote {cues_out} ({len(cues)} cues, total {cumulative:.1f}s)")

        concat_list = Path(f"audio-concat-{track_lang}.txt")
        concat_list.write_text(
            "\n".join(f"file '{f.resolve().as_posix()}'" for f in segment_files),
            encoding="utf-8",
        )
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error",
                    "-f", "concat", "-safe", "0",
                    "-i", str(concat_list),
                    "-c:a", "libmp3lame", "-b:a", "64k",
                    "-ar", "24000", "-ac", "1",
                    str(out_mp3),
                ],
                check=True,
            )
        except subprocess.CalledProcessError as e:
            print(f"[err] ffmpeg concat for {track_lang} failed: {e}", file=sys.stderr)
            return False

        print(f"[ok] wrote {out_mp3} ({out_mp3.stat().st_size // 1024} KB from {len(segment_files)} segments)")
        return True

    # Render each track
    ok_mix = render_track("mix", None, SITE / "digest.mp3", SITE / "audio-cues.json")
    ok_en = render_track("en", EN_VOICE, SITE / "digest-en.mp3", SITE / "audio-cues-en.json")
    ok_zh = render_track("zh", ZH_VOICE, SITE / "digest-zh.mp3", SITE / "audio-cues-zh.json")

    _save_trans_cache()

    if not ok_mix:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
