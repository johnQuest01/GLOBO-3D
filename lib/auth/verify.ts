// lib/auth/verify.ts
// Verificação server-side de tokens do Neon Auth usando o JWKS público.
// Usado nas API routes para identificar o usuário autenticado (opcional).

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { NEON_AUTH_JWKS_URL, isJwtVerifyConfigured } from './config';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!isJwtVerifyConfigured || !NEON_AUTH_JWKS_URL) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
  }
  return jwks;
}

export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
}

/** Extrai o token Bearer do header Authorization. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Verifica um token do Neon Auth e retorna o usuário, ou null se inválido /
 * não configurado. Falha "fechada" (nunca lança) para não quebrar as rotas.
 */
export async function verifyAuthToken(token: string): Promise<AuthUser | null> {
  const set = getJwks();
  if (!set) return null;
  try {
    const { payload } = await jwtVerify(token, set);
    return payloadToUser(payload);
  } catch {
    return null;
  }
}

/** Conveniência: verifica o usuário direto a partir da request. */
export async function getUserFromRequest(req: Request): Promise<AuthUser | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  return verifyAuthToken(token);
}

function payloadToUser(payload: JWTPayload): AuthUser | null {
  const id = typeof payload.sub === 'string' ? payload.sub : null;
  if (!id) return null;
  const name =
    typeof payload.name === 'string'
      ? payload.name
      : typeof (payload as Record<string, unknown>).display_name === 'string'
        ? ((payload as Record<string, unknown>).display_name as string)
        : undefined;
  const email =
    typeof (payload as Record<string, unknown>).email === 'string'
      ? ((payload as Record<string, unknown>).email as string)
      : undefined;
  return { id, name, email };
}
