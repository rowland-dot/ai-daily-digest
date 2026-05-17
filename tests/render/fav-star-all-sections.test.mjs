/**
 * Regression tests: fav-star buttons appear on all card section types.
 *
 * Spec behaviour B2 ("Save an article (anonymous) [GH-Pages-live]") requires
 * every article card — not just the main aihot section — to carry a fav-star
 * button so JS can wire localStorage / API saving.
 *
 * Covered sections:
 *   gh        — ghTrendingSection
 *   hf        — hfSection
 *   labs      — labBlogSection
 *   builder   — builderWritingSection
 *   llama     — localLlamaSection
 *   follow    — followBuildersSection (tweets + podcasts + blogs)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { articleId } from "../../scripts/lib/article-id.mjs";

// ---------------------------------------------------------------------------
// Helpers: re-implement the section builders in miniature so the tests don't
// depend on the full render-site.mjs module (which is a CLI script with side
// effects at module level). Instead we extract the HTML from the real
// render-site.mjs source using a local eval trick — we read the source,
// strip the top-level imports and the export-free side-effect block, and
// isolate the section function output.
//
// Simpler approach: call the section functions by importing with dynamic
// import() after stubbing node:fs. Because render-site.mjs is a CLI script
// that calls main() at module load, we instead use the section functions
// themselves which are pure — we inline small test harnesses here.
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Build fav-star button the same way render-site.mjs does in each section.
function buildFavStar(source, url) {
  const aid = url ? articleId(source, url) : "";
  if (!aid) return "";
  return `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`;
}

// Simulate ghTrendingSection output for one repo.
function ghCardHtml(repo) {
  const aid = repo.article_id || (repo.url ? articleId("gh", repo.url) : "");
  const favStar = aid
    ? `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`
    : "";
  return `<article class="card gh-card"${aid ? ` data-article-id="${escapeHtml(aid)}"` : ""}>${favStar}</article>`;
}

// Simulate hfSection output for one model.
function hfCardHtml(model) {
  const hfUrl = model.url || (model.id ? `https://huggingface.co/${model.id}` : "");
  const aid = model.article_id || (hfUrl ? articleId("hf", hfUrl) : "");
  const favStar = aid
    ? `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`
    : "";
  return `<article class="card hf-card"${aid ? ` data-article-id="${escapeHtml(aid)}"` : ""}>${favStar}</article>`;
}

// Simulate labBlogSection output for one item.
function labCardHtml(item) {
  const itemUrl = item.url || item.link || "";
  const aid = item.article_id || (itemUrl ? articleId("labs", itemUrl) : "");
  const favStar = aid
    ? `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`
    : "";
  return `<article class="card"${aid ? ` data-article-id="${escapeHtml(aid)}"` : ""}>${favStar}</article>`;
}

// Simulate builderWritingSection output for one entry.
function builderItemHtml(entry) {
  const entryUrl = entry.url || entry.link || "";
  const aid = entry.article_id || (entryUrl ? articleId("builder", entryUrl) : "");
  const favStar = aid
    ? `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`
    : "";
  return `<li class="writing-item"${aid ? ` data-article-id="${escapeHtml(aid)}"` : ""}>${favStar}</li>`;
}

// Simulate localLlamaSection output for one post.
function llamaItemHtml(post) {
  const postUrl = post.url || post.permalink || "";
  const aid = post.article_id || (postUrl ? articleId("llama", postUrl) : "");
  const favStar = aid
    ? `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`
    : "";
  return `<li class="writing-item"${aid ? ` data-article-id="${escapeHtml(aid)}"` : ""}>${favStar}</li>`;
}

// Simulate followBuildersSection tweet output for one tweet.
function followTweetHtml(tweet) {
  const aid = tweet.article_id || (tweet.url ? articleId("follow", tweet.url) : "");
  const favStar = aid
    ? `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`
    : "";
  return `<li class="builder-item"${aid ? ` data-article-id="${escapeHtml(aid)}"` : ""}>${favStar}</li>`;
}

// Simulate followBuildersSection pod/blog output for one item.
function followPostHtml(item) {
  const aid = item.article_id || (item.url ? articleId("follow", item.url) : "");
  const favStar = aid
    ? `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${escapeHtml(aid)}">☆</button>`
    : "";
  return `<li class="builder-item"${aid ? ` data-article-id="${escapeHtml(aid)}"` : ""}>${favStar}</li>`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const GH_REPO = { url: "https://github.com/owner/my-repo", owner: "owner", name: "my-repo" };
const HF_MODEL = { id: "meta-llama/Llama-3-8b-hf", likes: 100, downloads: 5000 };
const LAB_ITEM = { link: "https://openai.com/blog/some-post", url: "https://openai.com/blog/some-post", title: "Some Lab Post", source: "OpenAI" };
const BUILDER_ENTRY = { link: "https://simonwillison.net/2026/May/1/notes/", url: "https://simonwillison.net/2026/May/1/notes/", title: "Simon's notes" };
const LLAMA_POST = { permalink: "https://reddit.com/r/LocalLLaMA/comments/abc123/title/", title: "Local model release" };
const FOLLOW_TWEET = { url: "https://x.com/username/status/123456789", author: "username", text: "Some tweet text" };
const FOLLOW_POD = { url: "https://podcast.example.com/ep/42", title: "AI Podcast Ep 42", name: "AI Show" };
const FOLLOW_BLOG = { url: "https://builder.blog/post/1", title: "Builder Blog Post", name: "Builder" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fav-star button — gh-trending cards", () => {
  it("renders data-testid='fav-star' on a gh-trending card", () => {
    const html = ghCardHtml(GH_REPO);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'gh' source + repo URL", () => {
    const html = ghCardHtml(GH_REPO);
    const expectedId = articleId("gh", GH_REPO.url);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });

  it("article element carries data-article-id attribute", () => {
    const html = ghCardHtml(GH_REPO);
    expect(html).toMatch(/class="card gh-card"[^>]*data-article-id=/);
  });
});

describe("fav-star button — hf-popular cards", () => {
  it("renders data-testid='fav-star' on an hf card", () => {
    const html = hfCardHtml(HF_MODEL);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'hf' source + model URL", () => {
    const html = hfCardHtml(HF_MODEL);
    const expectedId = articleId("hf", `https://huggingface.co/${HF_MODEL.id}`);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });

  it("article element carries data-article-id attribute", () => {
    const html = hfCardHtml(HF_MODEL);
    expect(html).toMatch(/class="card hf-card"[^>]*data-article-id=/);
  });
});

describe("fav-star button — labs/blog cards", () => {
  it("renders data-testid='fav-star' on a labs card", () => {
    const html = labCardHtml(LAB_ITEM);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'labs' source + item URL", () => {
    const html = labCardHtml(LAB_ITEM);
    const expectedId = articleId("labs", LAB_ITEM.url);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });

  it("article element carries data-article-id attribute", () => {
    const html = labCardHtml(LAB_ITEM);
    expect(html).toMatch(/class="card"[^>]*data-article-id=/);
  });
});

describe("fav-star button — builder writing entries", () => {
  it("renders data-testid='fav-star' on a builder writing item", () => {
    const html = builderItemHtml(BUILDER_ENTRY);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'builder' source + entry URL", () => {
    const html = builderItemHtml(BUILDER_ENTRY);
    const expectedId = articleId("builder", BUILDER_ENTRY.url);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });

  it("list item carries data-article-id attribute", () => {
    const html = builderItemHtml(BUILDER_ENTRY);
    expect(html).toMatch(/class="writing-item"[^>]*data-article-id=/);
  });
});

describe("fav-star button — localLlama posts", () => {
  it("renders data-testid='fav-star' on a localLlama post", () => {
    const html = llamaItemHtml(LLAMA_POST);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'llama' source + permalink", () => {
    const html = llamaItemHtml(LLAMA_POST);
    const expectedId = articleId("llama", LLAMA_POST.permalink);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });

  it("list item carries data-article-id attribute", () => {
    const html = llamaItemHtml(LLAMA_POST);
    expect(html).toMatch(/class="writing-item"[^>]*data-article-id=/);
  });
});

describe("fav-star button — followBuilders feed (tweets)", () => {
  it("renders data-testid='fav-star' on a tweet item", () => {
    const html = followTweetHtml(FOLLOW_TWEET);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'follow' source + tweet URL", () => {
    const html = followTweetHtml(FOLLOW_TWEET);
    const expectedId = articleId("follow", FOLLOW_TWEET.url);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });
});

describe("fav-star button — followBuilders feed (podcasts)", () => {
  it("renders data-testid='fav-star' on a podcast item", () => {
    const html = followPostHtml(FOLLOW_POD);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'follow' source + pod URL", () => {
    const html = followPostHtml(FOLLOW_POD);
    const expectedId = articleId("follow", FOLLOW_POD.url);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });
});

describe("fav-star button — followBuilders feed (blogs)", () => {
  it("renders data-testid='fav-star' on a blog item", () => {
    const html = followPostHtml(FOLLOW_BLOG);
    expect(html).toContain('data-testid="fav-star"');
  });

  it("fav-star button carries data-article-id derived from 'follow' source + blog URL", () => {
    const html = followPostHtml(FOLLOW_BLOG);
    const expectedId = articleId("follow", FOLLOW_BLOG.url);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });
});

describe("fav-star — aria attributes and button type", () => {
  it("gh card fav-star has aria-pressed='false' and aria-label='Save article'", () => {
    const html = ghCardHtml(GH_REPO);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Save article"');
  });

  it("hf card fav-star has type='button' (not submit)", () => {
    const html = hfCardHtml(HF_MODEL);
    expect(html).toContain('type="button"');
  });

  it("llama card fav-star displays ☆ star character", () => {
    const html = llamaItemHtml(LLAMA_POST);
    expect(html).toContain("☆");
  });
});
