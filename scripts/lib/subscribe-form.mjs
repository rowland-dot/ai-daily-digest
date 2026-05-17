/**
 * Subscribe form helper.
 * renderSubscribeForm() → HTML section string for the idle subscribe form.
 *
 * Covers mockups 01-05 (idle / submitting / link-sent / error-invalid /
 * error-network). Server renders the idle state (mockup 01); the Tier B
 * states (02-05) are driven by the inline client script exported as
 * SUBSCRIBE_FORM_SCRIPT.
 *
 * Usage in render-site.mjs:
 *   - Render the form section into <main> gated by BACKEND_LIVE.
 *   - Inline SUBSCRIBE_FORM_SCRIPT in a <script> tag at end of <body>.
 *
 * CSP note: this project does not set a CSP header, so inline <script>
 * is acceptable. If a CSP is introduced in future, move to a bundled file.
 */

export function renderSubscribeForm() {
  return `
    <section id="subscribe" class="block">
      <h2><span class="section-icon">📬</span> Subscribe to the daily email</h2>
      <p class="section-sub">One email per day at 07:00 Sydney. Bilingual support. Unsubscribe any time.</p>
      <form class="subscribe-form"
            data-testid="subscribe-form"
            data-form-state="idle"
            novalidate>
        <label for="subscribe-email">Your email</label>
        <input id="subscribe-email"
               name="email"
               type="email"
               placeholder="you@example.com"
               autocomplete="email"
               data-testid="subscribe-email-input">
        <button type="submit"
                class="btn-primary"
                data-testid="subscribe-submit-btn">Subscribe</button>
      </form>
    </section>`;
}

/**
 * Minimal inline script that drives subscribe form state transitions.
 * Runs without bundling — plain JS, no module imports.
 *
 * States driven:
 *   idle       → submitting  (on submit, before fetch)
 *   submitting → link-sent   (on 200 from POST /api/subscribe)
 *   submitting → error-*     (on non-200 or network failure)
 *   error-*    → idle        (on retry — form re-enables)
 */
export const SUBSCRIBE_FORM_SCRIPT = `
(function () {
  var form = document.querySelector('[data-testid="subscribe-form"]');
  if (!form) return;
  var input = form.querySelector('[data-testid="subscribe-email-input"]');
  var btn   = form.querySelector('[data-testid="subscribe-submit-btn"]');

  function setState(state) {
    form.dataset.formState = state;
  }

  function showMsg(cls, html) {
    var existing = form.querySelector('.form-msg');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.className = 'form-msg ' + cls;
    div.setAttribute('role', 'alert');
    div.innerHTML = html;
    form.appendChild(div);
  }

  function setInputs(disabled) {
    if (input) input.disabled = disabled;
    if (btn)   btn.disabled   = disabled;
  }

  function resetForm() {
    setState('idle');
    setInputs(false);
    var msg = form.querySelector('.form-msg');
    if (msg) msg.remove();
    if (input) input.removeAttribute('aria-invalid');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = input ? input.value.trim() : '';

    // Client-side validation
    if (!email || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {
      if (input) input.setAttribute('aria-invalid', 'true');
      setState('error-invalid-email');
      showMsg('is-error', 'Please enter a valid email address (e.g. you@example.com).');
      if (input) input.focus();
      return;
    }

    // Transition to submitting
    if (input) input.removeAttribute('aria-invalid');
    setState('submitting');
    setInputs(true);
    if (btn) btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending link…';

    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    })
      .then(function (res) {
        if (res.ok) {
          setState('link-sent');
          // Replace form content with success message per mockup 03
          form.innerHTML =
            '<div class="form-msg is-success" role="status" aria-live="polite">' +
            '<strong>\\u2713 Check your inbox.</strong> We sent a confirmation link to <strong>' +
            email.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
            '</strong>. Click it to finish subscribing \\u2014 the link expires in 30 minutes.' +
            '</div>';
        } else {
          setState('error-network');
          setInputs(false);
          if (btn) btn.textContent = 'Try again';
          showMsg('is-error',
            '<strong>Couldn\'t send the link.</strong> ' +
            (res.status === 422 ? 'That email address doesn\'t look right.' : 'Network error — please try again.') +
            ' Your subscription hasn\'t changed.');
        }
      })
      .catch(function () {
        setState('error-network');
        setInputs(false);
        if (btn) btn.textContent = 'Try again';
        showMsg('is-error',
          '<strong>Couldn\'t send the link.</strong> Network error — please try again. ' +
          'Your subscription hasn\'t changed.');
      });
  });
})();
`;
