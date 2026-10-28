import { SignJWT, jwtVerify } from 'jose';
import { query } from './db.js';

export const SESSION_COOKIE = 'hospital_session';
const TOKEN_TTL_SECONDS = 60 * 60;

function authSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes.');
  }
  return new TextEncoder().encode(value);
}

export function assertAuthConfigured() {
  authSecret();
}

export async function createSessionToken(userId, role) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .setIssuer('hospital-management-system')
    .setAudience('hospital-management-system-api')
    .sign(authSecret());
}

export async function verifySessionToken(token) {
  const { payload } = await jwtVerify(token, authSecret(), {
    algorithms: ['HS256'],
    issuer: 'hospital-management-system',
    audience: 'hospital-management-system-api',
  });
  if (typeof payload.sub !== 'string' || !['admin', 'doctor', 'patient'].includes(payload.role)) {
    throw new Error('Invalid session claims.');
  }
  return { userId: payload.sub, role: payload.role };
}

export async function getActor(request) {
  const token = request.cookies?.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let claims;
  try {
    claims = await verifySessionToken(token);
  } catch {
    return null;
  }
  const { rows } = await query(
    `SELECT u.user_id, u.role::text AS role,
            d.doctor_id, p.patient_id
     FROM APP_USER AS u
     LEFT JOIN DOCTOR AS d ON d.doctor_id = u.user_id
     LEFT JOIN PATIENT AS p ON p.patient_id = u.user_id
     WHERE u.user_id = $1`,
    [claims.userId],
  );
  const user = rows[0];
  if (!user || user.role !== claims.role) return null;
  if ((user.role === 'doctor' && !user.doctor_id) || (user.role === 'patient' && !user.patient_id)) return null;
  return { userId: user.user_id, role: user.role, doctorId: user.doctor_id, patientId: user.patient_id };
}

export function setSessionCookie(response, token) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
  });
  return response;
}

export function clearSessionCookie(response) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
