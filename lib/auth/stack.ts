// lib/auth/stack.ts
import 'server-only';
import { StackServerApp } from '@stackframe/stack';
import { isAuthConfigured } from './config';

/**
 * App do Stack Auth (motor do Neon Auth).
 * Só é construído quando as chaves estão configuradas — assim o build e o app
 * continuam funcionando (com login mock) enquanto o Neon Auth não está ligado.
 */
export const stackServerApp = isAuthConfigured
  ? new StackServerApp({ tokenStore: 'nextjs-cookie' })
  : null;
