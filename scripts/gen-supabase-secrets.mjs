// Generates POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY for self-hosted Supabase.
import { randomBytes, createHmac } from 'node:crypto';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const sign = (header, payload, secret) => {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const s = b64url(createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
};

const postgresPassword = randomBytes(24).toString('base64');
const jwtSecret = randomBytes(48).toString('base64');

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365 * 10;
const header = { alg: 'HS256', typ: 'JWT' };
const base = { iss: 'supabase', ref: 'self-hosted', iat, exp };

const anonKey = sign(header, { ...base, role: 'anon' }, jwtSecret);
const serviceRoleKey = sign(header, { ...base, role: 'service_role' }, jwtSecret);

process.stdout.write(
  `POSTGRES_PASSWORD=${postgresPassword}\n` +
    `JWT_SECRET=${jwtSecret}\n` +
    `ANON_KEY=${anonKey}\n` +
    `SERVICE_ROLE_KEY=${serviceRoleKey}\n`,
);
