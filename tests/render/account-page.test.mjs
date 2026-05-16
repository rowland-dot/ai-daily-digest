import { describe, it, expect } from 'vitest';
import { renderAccountPage } from '../../scripts/lib/account-page.mjs';

describe('renderAccountPage — BACKEND_LIVE=false', () => {
  it('returns empty string (page not rendered) when backend is off', () => {
    // Per plan: BACKEND_LIVE=false → docs/account/index.html NOT written
    // The helper signals this by returning null/empty
    const result = renderAccountPage({ backendLive: false });
    expect(result == null || result === '').toBe(true);
  });
});

describe('renderAccountPage — BACKEND_LIVE=true, linked-active (mockup 17)', () => {
  const opts = { backendLive: true, auth: 'linked', newsletterState: 'subscribed', language: 'en' };

  it('contains data-testid="account-page"', () => {
    const html = renderAccountPage(opts);
    expect(html).toContain('data-testid="account-page"');
  });

  it('has data-newsletter-state="subscribed"', () => {
    const html = renderAccountPage(opts);
    expect(html).toContain('data-newsletter-state="subscribed"');
  });

  it('shows newsletter-status "Subscribed"', () => {
    const html = renderAccountPage(opts);
    expect(html).toContain('data-testid="newsletter-status"');
    expect(html).toContain('Subscribed');
  });

  it('shows language preference toggle with data-testid="lang-pref"', () => {
    const html = renderAccountPage(opts);
    expect(html).toContain('data-testid="lang-pref"');
    expect(html).toContain('data-testid="lang-pref-en"');
    expect(html).toContain('data-testid="lang-pref-zh"');
  });

  it('EN lang-pref button is aria-pressed="true" when language=en', () => {
    const html = renderAccountPage(opts);
    expect(html).toContain('data-testid="lang-pref-en"');
    // The EN button should be the selected one
    expect(html).toMatch(/data-testid="lang-pref-en"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="lang-pref-en"/);
  });

  it('shows delete-data button in danger zone', () => {
    const html = renderAccountPage(opts);
    expect(html).toContain('data-testid="delete-data-btn"');
  });

  it('has delete-confirm-modal closed (not rendered in static HTML) per mockup 22', () => {
    const html = renderAccountPage(opts);
    expect(html).not.toContain('data-testid="delete-confirm-modal"');
  });

  it('has aria-modal declaration absent in initial load (modal is client-side)', () => {
    const html = renderAccountPage(opts);
    // The modal is only injected client-side; static HTML must not contain it
    expect(html).not.toContain('role="dialog"');
  });
});

describe('renderAccountPage — linked-unsubscribed (mockup 18)', () => {
  it('shows "Unsubscribed" status and resubscribe button', () => {
    const html = renderAccountPage({ backendLive: true, auth: 'linked', newsletterState: 'unsubscribed', language: 'en' });
    expect(html).toContain('Unsubscribed');
    expect(html).toContain('data-testid="resubscribe-btn"');
  });

  it('does NOT show unsubscribe button when already unsubscribed', () => {
    const html = renderAccountPage({ backendLive: true, auth: 'linked', newsletterState: 'unsubscribed', language: 'en' });
    expect(html).not.toContain('data-testid="unsubscribe-btn"');
  });
});
