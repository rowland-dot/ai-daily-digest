# State Index — backend-and-editorial-layer mockups

Auto-generated mirror of each per-state file's `data-mockup-state`
attribute. Used by `/mockup-parity --write` (Step 4) to derive per-state
declarations on the spec.

| File | State slug | Tier | Entry-point | Capture |
|---|---|---|---|---|
| `01-subscribe-form-idle.html` | `subscribe-form-idle` | A | `none` | `[data-testid='subscribe-form']` |
| `02-subscribe-form-submitting.html` | `subscribe-form-submitting` | B | `subscribe-form-idle` | `[data-testid='subscribe-form']` |
| `03-subscribe-form-link-sent.html` | `subscribe-form-link-sent` | B | `subscribe-form-submitting` | `[data-testid='subscribe-form']` |
| `04-subscribe-form-error-invalid-email.html` | `subscribe-form-error-invalid-email` | B | `subscribe-form-idle` | `[data-testid='subscribe-form']` |
| `05-subscribe-form-error-network.html` | `subscribe-form-error-network` | B | `subscribe-form-submitting` | `[data-testid='subscribe-form']` |
| `06-favourite-star-empty.html` | `favourite-star-empty` | A | `none` | `[data-testid='fav-star']` |
| `07-favourite-star-filled.html` | `favourite-star-filled` | A | `favourite-star-empty` | `[data-testid='fav-star'][aria-pressed='true']` |
| `08-favourite-star-syncing.html` | `favourite-star-syncing` | B | `favourite-star-empty` | `[data-testid='fav-star'][data-syncing='true']` |
| `09-favourites-ghpages-empty-no-saves.html` | `favourites-ghpages-empty-no-saves` | A | `none` | `[data-testid='favourites-page']` |
| `10-favourites-ghpages-populated.html` | `favourites-ghpages-populated` | A | `none` | `[data-testid='favourites-page']` |
| `11-favourites-cloudflare-anonymous-with-sync-prompt.html` | `favourites-cloudflare-anonymous-with-sync-prompt` | A | `none` | `[data-testid='favourites-page']` |
| `12-favourites-cloudflare-linked-and-populated.html` | `favourites-cloudflare-linked-and-populated` | A | `none` | `[data-testid='favourites-page']` |
| `13-sync-favourites-prompt-collapsed.html` | `sync-favourites-prompt-collapsed` | A | `none` | `[data-testid='sync-prompt']` |
| `14-sync-favourites-prompt-open-email-input.html` | `sync-favourites-prompt-open-email-input` | A | `sync-favourites-prompt-collapsed` | `[data-testid='sync-prompt']` |
| `15-sync-favourites-link-sent-confirmation.html` | `sync-favourites-link-sent-confirmation` | B | `sync-favourites-prompt-open-email-input` | `[data-testid='sync-prompt']` |
| `16-sync-favourites-error.html` | `sync-favourites-error` | B | `sync-favourites-prompt-open-email-input` | `[data-testid='sync-prompt']` |
| `17-account-linked-active.html` | `account-linked-active` | A | `none` | `[data-testid='account-page']` |
| `18-account-linked-unsubscribed.html` | `account-linked-unsubscribed` | A | `none` | `[data-testid='account-page']` |
| `19-account-language-saving.html` | `account-language-saving` | B | `account-linked-active` | `[data-testid='lang-pref']` |
| `20-account-language-saved-toast.html` | `account-language-saved-toast` | B | `account-language-saving` | `[data-testid='toast']` |
| `21-account-delete-confirm-modal-open.html` | `account-delete-confirm-modal-open` | A | `account-linked-active` | `[data-testid='delete-confirm-modal']` |
| `22-account-delete-confirm-modal-closed.html` | `account-delete-confirm-modal-closed` | A | `none` | `[data-testid='account-page']` |
| `23-editors-cut-cut-with-en-commentary.html` | `editors-cut-cut-with-en-commentary` | A | `none` | `[data-testid='editors-cut']` |
| `24-editors-cut-cut-with-zh-commentary.html` | `editors-cut-cut-with-zh-commentary` | A | `editors-cut-cut-with-en-commentary` | `[data-testid='editors-cut']` |
| `25-editors-cut-cut-zh-fallback-to-en.html` | `editors-cut-cut-zh-fallback-to-en` | B | `editors-cut-cut-with-en-commentary` | `[data-testid='editors-cut']` |
| `26-editors-cut-not-cut-no-box.html` | `editors-cut-not-cut-no-box` | A | `none` | `[data-testid='card-not-cut']` |
| `27-email-en.html` | `email-en` | A | `server-triggered` | `[data-testid='email-body']` |
| `28-email-zh.html` | `email-zh` | A | `server-triggered` | `[data-testid='email-body']` |
| `29-article-translation-populated.html` | `article-translation-populated` | A | `none` | `[data-testid='translation-article']` |
| `30-article-translation-pending-placeholder.html` | `article-translation-pending-placeholder` | A | `none` | `[data-testid='translation-placeholder']` |

**Counts:** 30 states / 9 surfaces (1 file × 1 state each).
Tier A: 20 / Tier B: 10. No Tier C edge cases in this scaffold.
