import crypto from 'crypto';

export const SESSION_COOKIE = 'stj_session';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'change-me-now';

export function getAuthConfig() {
  const password = process.env.JOURNAL_PASSWORD || DEFAULT_PASSWORD;
  const sessionSecret =
    process.env.JOURNAL_SESSION_SECRET ||
    process.env.JOURNAL_PASSWORD ||
    DEFAULT_PASSWORD;
  const isUsingDefaultPassword = password === DEFAULT_PASSWORD;
  const isUsingDefaultSessionSecret = sessionSecret === DEFAULT_PASSWORD;
  const requireConfiguredAuth = process.env.NODE_ENV === 'production';

  return {
    username: process.env.JOURNAL_USERNAME || DEFAULT_USERNAME,
    password,
    sessionSecret,
    secureCookies: process.env.JOURNAL_SECURE_COOKIES === 'true',
    isUsingDefaultPassword,
    isAuthConfigured:
      !requireConfiguredAuth || (!isUsingDefaultPassword && !isUsingDefaultSessionSecret),
  };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyCredentials(username: string, password: string) {
  const config = getAuthConfig();
  return safeEqual(username, config.username) && safeEqual(password, config.password);
}

function sign(payload: string) {
  return crypto
    .createHmac('sha256', getAuthConfig().sessionSecret)
    .update(payload)
    .digest('base64url');
}

export function createSessionValue() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `local-admin.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(value?: string | null) {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;

  const [uid, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (uid !== 'local-admin' || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  return safeEqual(signature, sign(`${uid}.${expiresAtRaw}`));
}

export function getSessionCookieOptions(maxAge = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: getAuthConfig().secureCookies,
    path: '/',
    maxAge,
  };
}
