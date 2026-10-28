import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

export function readJson(request, schema) {
  return request.json().then((body) => schema.parse(body));
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function requestFailure(error) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Invalid request', issues: error.issues }, { status: 400 });
  }
  if (error?.code === '23505') return jsonError('The requested record conflicts with existing data.', 409);
  if (error?.code === '23503' || error?.code === '23514' || error?.code === '22P02') {
    return jsonError('The request references invalid data.', 400);
  }
  if (error instanceof SyntaxError) return jsonError('Request body must be valid JSON.', 400);
  // Avoid returning SQL, internal details, or stack traces to clients.
  console.error('API request failed:', error?.code || error?.name || 'unknown');
  return jsonError('The request could not be completed.', 500);
}

export function requireSameOrigin(request) {
  return sameOrigin(request) ? null : jsonError('Invalid request origin.', 403);
}
