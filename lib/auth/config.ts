// lib/auth/config.ts
// Configuração central de autenticação (Neon Auth / Stack Auth).
// Tudo com degradação graciosa: sem as variáveis, o app usa o login mock.

// Chaves do Stack Auth (fornecidas pelo console do Neon > Auth)
export const STACK_PROJECT_ID = process.env.NEXT_PUBLIC_STACK_PROJECT_ID;
export const STACK_PUBLISHABLE_CLIENT_KEY =
  process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY;

// URL do JWKS do Neon Auth (para verificar tokens no servidor)
export const NEON_AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL;

/** True quando o login real (Stack Auth) está configurado. */
export const isAuthConfigured = Boolean(
  STACK_PROJECT_ID && STACK_PUBLISHABLE_CLIENT_KEY,
);

/** True quando dá para verificar tokens no servidor (JWKS presente). */
export const isJwtVerifyConfigured = Boolean(NEON_AUTH_JWKS_URL);
