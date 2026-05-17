/**
 * Subscribe form rendering tests (H1).
 *
 * Requirements:
 *  - renderSubscribeForm() emits idle-state form matching mockup 01:
 *    <form data-testid="subscribe-form" data-form-state="idle">
 *    with email input and submit button.
 *  - render-site.mjs includes the form section when BACKEND_LIVE=true.
 *  - render-site.mjs omits the form section when BACKEND_LIVE=false.
 *  - SUBSCRIBE_FORM_SCRIPT is included in the page when BACKEND_LIVE=true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const { renderSubscribeForm, SUBSCRIBE_FORM_SCRIPT } = await import('../../scripts/lib/subscribe-form.mjs');

const renderSiteSrc = readFileSync('./scripts/render-site.mjs', 'utf8');

describe('renderSubscribeForm — idle state (mockup 01)', () => {
  const html = renderSubscribeForm();

  it('emits data-testid="subscribe-form"', () => {
    expect(html).toContain('data-testid="subscribe-form"');
  });

  it('idle state: data-form-state="idle"', () => {
    expect(html).toContain('data-form-state="idle"');
  });

  it('has email input with data-testid="subscribe-email-input"', () => {
    expect(html).toContain('data-testid="subscribe-email-input"');
    expect(html).toContain('type="email"');
  });

  it('has submit button with data-testid="subscribe-submit-btn"', () => {
    expect(html).toContain('data-testid="subscribe-submit-btn"');
    expect(html).toContain('class="btn-primary"');
  });

  it('has a <label> for the email input', () => {
    expect(html).toContain('<label');
    expect(html).toContain('for="subscribe-email"');
  });

  it('uses novalidate on the form (client-side validation handles feedback)', () => {
    expect(html).toContain('novalidate');
  });

  it('is wrapped in a section.block with subscribe section id', () => {
    expect(html).toContain('<section');
    expect(html).toContain('class="block"');
    expect(html).toContain('id="subscribe"');
  });
});

describe('SUBSCRIBE_FORM_SCRIPT — client behaviour wiring', () => {
  it('is a non-empty string', () => {
    expect(typeof SUBSCRIBE_FORM_SCRIPT).toBe('string');
    expect(SUBSCRIBE_FORM_SCRIPT.length).toBeGreaterThan(100);
  });

  it('targets subscribe-form and subscribe-email-input by testid', () => {
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('subscribe-form');
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('subscribe-email-input');
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('subscribe-submit-btn');
  });

  it('POSTs to /api/subscribe', () => {
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('/api/subscribe');
    expect(SUBSCRIBE_FORM_SCRIPT).toContain("method: 'POST'");
  });

  it('handles link-sent success state', () => {
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('link-sent');
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('is-success');
  });

  it('handles error-network state', () => {
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('error-network');
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('is-error');
  });

  it('handles client-side email validation (error-invalid-email state)', () => {
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('error-invalid-email');
    expect(SUBSCRIBE_FORM_SCRIPT).toContain('aria-invalid');
  });
});

describe('render-site.mjs — subscribe form gated by BACKEND_LIVE', () => {
  it('import of renderSubscribeForm is present in render-site.mjs', () => {
    expect(renderSiteSrc).toContain("from \"./lib/subscribe-form.mjs\"");
  });

  it('import of SUBSCRIBE_FORM_SCRIPT is present in render-site.mjs', () => {
    expect(renderSiteSrc).toContain('SUBSCRIBE_FORM_SCRIPT');
  });

  it('subscribe form is rendered conditionally on BACKEND_LIVE', () => {
    expect(renderSiteSrc).toContain('BACKEND_LIVE ? renderSubscribeForm()');
  });

  it('SUBSCRIBE_FORM_SCRIPT is injected conditionally on BACKEND_LIVE', () => {
    // The script tag injection is also gated
    expect(renderSiteSrc).toContain('BACKEND_LIVE ?');
    expect(renderSiteSrc).toContain('SUBSCRIBE_FORM_SCRIPT');
  });
});
