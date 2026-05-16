export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  RESEND_API_KEY: string;
  BEEHIIV_API_KEY: string;
  BEEHIIV_PUB_ID: string;
  SITE_ORIGIN: string;
}

export interface ApiError {
  error: string;
  message: string;
}
