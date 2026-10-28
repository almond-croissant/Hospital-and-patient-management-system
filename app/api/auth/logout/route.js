import { NextResponse } from 'next/server';
import { clearSessionCookie } from '../../../../lib/auth.js';
import { requireSameOrigin } from '../../../../lib/api.js';

export async function POST(request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
