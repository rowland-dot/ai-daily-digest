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

URL_RE = re.compile(r"https?://\S+|www\.\S+")
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


def clean_for_tts(text: str) -> str:
    """Strip URLs, markdown, tags, hashtags, timestamps, emoji, code, etc.
    Keep prose suitable for being read aloud."""
    if not text:
        return ""
    s = text
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


def tts_segment(text: str, voice: str, out: Path) -> bool:
    """Render `text` to `out` MP3 using edge-tts. Returns True on success."""
    text = text.strip()
    if not text:
        return False
    try:
        subprocess.run(
            ["edge-tts", "--voice", voice, "--text", text, "--write-media", str(out)],
            check=True,
            capture_output=True,
            text=True,
        )
        return out.exists() and out.stat().st_size > 0
    except subprocess.CalledProcessError as e:
        print(f"[err] edge-tts failed for {out.name}: {e.stderr[:200] if e.stderr else e}", file=sys.stderr)
        return False


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


def build_aihot_section_text(label: str, items: list[dict]) -> str:
    """Stitch Chinese items into one read-aloud passage."""
    parts: list[str] = []
    lbl = clean_for_tts(label)
    if lbl:
        parts.append(lbl + "。")
    for item in items:
        title = field(item, "title")
        summary = field(item, "summary", limit=200)
        if title:
            parts.append(title + "。")
        if summary:
            parts.append(summary + "。")
    return " ".join(parts)


def build_lab_section_text(items: list[dict]) -> str:
    parts = ["Lab announcements from OpenAI."]
    for it in items[:OTHER_CAP]:
        title = field(it, "title")
        desc = field(it, "description", limit=220)
        if title:
            parts.append(title + ".")
        if desc:
            parts.append(desc + ".")
    return " ".join(parts)


def build_simon_section_text(entries: list[dict]) -> str:
    parts = ["Builder writing, from Simon Willison's weblog."]
    for e in entries[:OTHER_CAP]:
        title = field(e, "title")
        summary = field(e, "summary", limit=220)
        if title:
            parts.append(title + ".")
        if summary:
            parts.append(summary + ".")
    return " ".join(parts)


def build_gh_section_text(repos: list[dict]) -> str:
    parts = ["Trending on GitHub today."]
    for r in repos[:OTHER_CAP]:
        owner = clean_for_tts(r.get("owner") or "")
        name = clean_for_tts(r.get("name") or "")
        desc = field(r, "description", limit=180)
        stars_today = r.get("starsToday")
        if owner and name:
            # Speak as "owner slash name" so model IDs don't get munged
            parts.append(f"{owner} slash {name}.")
        if desc:
            parts.append(desc + ".")
        if stars_today:
            parts.append(f"{stars_today} stars today.")
    return " ".join(parts)


def build_hn_section_text(items: list[dict]) -> str:
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
        return ""
    parts = ["Top AI stories from Hacker News today."]
    for it in filtered:
        title = field(it, "title")
        score = it.get("score") or 0
        comments = it.get("descendants") or 0
        if title:
            parts.append(title + ".")
        parts.append(f"With {score} points and {comments} comments.")
    return " ".join(parts)


def build_hf_section_text(models: list[dict]) -> str:
    parts = ["Most-loved models on HuggingFace."]
    for m in models[:OTHER_CAP]:
        mid = clean_for_tts(m.get("id") or "")
        likes = m.get("likes") or 0
        downloads = m.get("downloads") or 0
        if mid:
            parts.append(f"{mid}.")
        parts.append(f"{likes} likes, {downloads:,} downloads.")
    return " ".join(parts)


def build_follow_builders_x_text(x_feed: dict) -> str:
    """Tweets across all Follow Builders authors, sorted by likes."""
    all_tweets = []
    for author in x_feed.get("x", []) or []:
        for t in author.get("tweets", []) or []:
            all_tweets.append({**t, "_author": author.get("name", "")})
    all_tweets.sort(key=lambda t: t.get("likes") or 0, reverse=True)
    if not all_tweets:
        return ""
    parts = ["Builder voices from X."]
    for t in all_tweets:  # no cap on Follow Builders
        author = clean_for_tts(t.get("_author") or "")
        text = field(t, "text", limit=240)
        if author and text:
            parts.append(f"{author} says: {text}.")
    return " ".join(parts)


def build_follow_builders_podcasts_text(pod_feed: dict) -> str:
    episodes = pod_feed.get("podcasts", []) or []
    if not episodes:
        return ""
    parts = ["New AI podcast episodes."]
    for ep in episodes:  # no cap
        name = clean_for_tts(ep.get("name") or "")
        title = field(ep, "title")
        if name and title:
            parts.append(f"{name}: {title}.")
        elif title:
            parts.append(title + ".")
    return " ".join(parts)


def build_follow_builders_blogs_text(blog_feed: dict) -> str:
    blogs = blog_feed.get("blogs", []) or []
    if not blogs:
        return ""
    parts = ["Builder blog posts."]
    for b in blogs:  # no cap
        name = clean_for_tts(b.get("name") or "")
        title = field(b, "title")
        if name and title:
            parts.append(f"{name}: {title}.")
        elif title:
            parts.append(title + ".")
    return " ".join(parts)


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


def add_section(sections: list, text: str, voice: str) -> None:
    """Append (text, voice) pairs to `sections`, chunking long text."""
    for chunk in chunk_text(text):
        sections.append((chunk, voice))


def main() -> int:
    manifest = load("manifest.json") or {}
    date_utc = manifest.get("date_utc") or "today"

    sections: list[tuple[str, str]] = []  # (text, voice)

    # Intro
    add_section(
        sections,
        (
            f"Welcome to the AI Daily Digest for {date_utc}. "
            f"Here's what shipped, what trended, and what AI builders are saying."
        ),
        EN_VOICE,
    )

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
        ("aihot-ai-models.json", "模型发布与更新", "模型"),
        ("aihot-ai-products.json", "产品与应用", "产品"),
        ("aihot-industry.json", "行业动态", "行业"),
        ("aihot-paper.json", "研究亮点", "论文"),
    ]
    for filename, display_label, fallback_hint in aihot_categories:
        cat = load(filename)
        items = (cat.get("items") if cat else None) or daily_section(fallback_hint)
        # AIHOT: 24h filter, no count cap on top.
        items = filter_recent(items, "publishedAt")
        if not items:
            continue
        text = build_aihot_section_text(display_label, items)
        if text:
            add_section(sections, text, ZH_VOICE)

    # OpenAI lab — 24h filter, then OTHER_CAP inside builder
    oai = load("openai-blog.json")
    if oai and oai.get("items"):
        items = filter_recent(oai["items"], "pubDate")
        if items:
            text = build_lab_section_text(items)
            if text:
                add_section(sections, text, EN_VOICE)

    # Simon Willison — 24h filter, then OTHER_CAP
    sw = load("simon-willison.json")
    if sw and sw.get("entries"):
        entries = filter_recent(sw["entries"], "updated")
        if entries:
            text = build_simon_section_text(entries)
            if text:
                add_section(sections, text, EN_VOICE)

    # GitHub trending — no date filter (URL already ?since=daily); OTHER_CAP only
    gh = load("github-trending.json")
    if gh and gh.get("repos"):
        text = build_gh_section_text(gh["repos"])
        if text:
            add_section(sections, text, EN_VOICE)

    # HN top AI — 24h filter (time is unix epoch), then OTHER_CAP
    hn = load("hn-top.json")
    if hn and hn.get("items"):
        items = [it for it in hn["items"] if it and within_window(it.get("time"))]
        text = build_hn_section_text(items)
        if text:
            add_section(sections, text, EN_VOICE)

    # HF popular — no date filter ("trending overall", not chrono); OTHER_CAP only
    hf = load("hf-popular.json")
    if hf and hf.get("models"):
        text = build_hf_section_text(hf["models"])
        if text:
            add_section(sections, text, EN_VOICE)

    # Follow Builders — 24h filter, no count cap
    x_feed = load("follow-builders-x.json")
    if x_feed:
        # Filter tweets per-author before flattening
        filtered_authors = []
        for author in x_feed.get("x", []) or []:
            recent = [t for t in (author.get("tweets") or []) if within_window(t.get("createdAt"))]
            if recent:
                filtered_authors.append({**author, "tweets": recent})
        if filtered_authors:
            text = build_follow_builders_x_text({"x": filtered_authors})
            if text:
                add_section(sections, text, EN_VOICE)
    pod_feed = load("follow-builders-podcasts.json")
    if pod_feed:
        episodes = filter_recent(pod_feed.get("podcasts") or [], "publishedAt")
        if episodes:
            text = build_follow_builders_podcasts_text({"podcasts": episodes})
            if text:
                add_section(sections, text, EN_VOICE)
    blog_feed = load("follow-builders-blogs.json")
    if blog_feed:
        posts = filter_recent(blog_feed.get("blogs") or [], "publishedAt")
        if posts:
            text = build_follow_builders_blogs_text({"blogs": posts})
            if text:
                add_section(sections, text, EN_VOICE)

    # Outro
    add_section(
        sections,
        "That's all for today's digest. Full details, links, and the latest trends are on the page.",
        EN_VOICE,
    )

    print(f"Generating {len(sections)} audio segments...")
    segment_files: list[Path] = []
    for i, (text, voice) in enumerate(sections):
        out = SEGS / f"{i:03d}.mp3"
        ok = tts_segment(text, voice, out)
        if ok:
            segment_files.append(out)
            print(f"  [{i:03d}] {voice}: {len(text)} chars -> {out.stat().st_size} bytes")
        else:
            print(f"  [{i:03d}] skipped (empty or failed)")

    if not segment_files:
        print("[err] no segments rendered; aborting", file=sys.stderr)
        return 1

    # Concatenate via ffmpeg concat demuxer
    concat_list = Path("audio-concat.txt")
    concat_list.write_text(
        "\n".join(f"file '{f.resolve().as_posix()}'" for f in segment_files),
        encoding="utf-8",
    )

    output = SITE / "digest.mp3"
    try:
        # Re-encode during concat. Per-segment MP3s from edge-tts have
        # slightly different encoder parameters, and stream-copy concat
        # produces a frame-aligned-but-misframed stream that some players
        # silently seek past (browsers skip the intro and jump to a later
        # frame boundary). Re-encoding to a single, consistent MP3
        # eliminates that. ~3-5s slower on the runner; reliable playback.
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "concat", "-safe", "0",
                "-i", str(concat_list),
                "-c:a", "libmp3lame",
                "-b:a", "64k",
                "-ar", "24000",
                "-ac", "1",
                str(output),
            ],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"[err] ffmpeg concat failed: {e}", file=sys.stderr)
        return 2

    size_kb = output.stat().st_size / 1024
    print(f"[ok] wrote {output} ({size_kb:.0f} KB from {len(segment_files)} segments)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
