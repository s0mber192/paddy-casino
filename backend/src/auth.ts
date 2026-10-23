import crypto from 'node:crypto';

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export class AuthError extends Error {}

/**
 * Проверка подписи Telegram initData (HMAC-SHA256).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number,
): TgUser {
  if (!initData) throw new AuthError('Empty initData');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new AuthError('No hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new AuthError('Invalid signature');
  }

  const authDate = Number(params.get('auth_date'));
  if (!authDate) throw new AuthError('No auth_date');
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSec || age < -60) throw new AuthError('initData expired');

  const userRaw = params.get('user');
  if (!userRaw) throw new AuthError('No user');
  try {
    const user = JSON.parse(userRaw) as TgUser;
    if (typeof user.id !== 'number') throw new Error();
    return user;
  } catch {
    throw new AuthError('Bad user payload');
  }
}