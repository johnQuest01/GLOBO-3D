// lib/supabase/client.ts
'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase com DEGRADAÇÃO GRACIOSA.
 *
 * Se as variáveis de ambiente não estiverem definidas, `supabase` é `null`
 * e `isSupabaseEnabled` é `false` — o app continua funcionando 100% em modo
 * local (sem persistência/realtime). Assim que você preencher o `.env.local`
 * com as credenciais do seu projeto Supabase, a rede social liga sozinha.
 *
 * Veja docs/BACKEND_SETUP.md para o passo a passo.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Singleton — evita criar múltiplos clientes/conexões realtime.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseEnabled) return null;
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}
