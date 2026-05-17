export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  RESEND_API_KEY: string;
  BEEHIIV_API_KEY: string;
  BEEHIIV_PUB_ID: string;
  SITE_ORIGIN: string;
  /** When 'true', disables the in-memory rate limiter (test environments) */
  RATE_LIMIT_DISABLED?: string;
  /** Secret header value for test bypass: X-Test-Bypass-RateLimit: <token> */
  RATE_LIMIT_BYPASS_TOKEN?: string;
}

export interface ApiError {
  error: string;
  message: string;
}
