// lib/supabase/regionMessages.ts
'use client';

import { getSupabase } from './client';

export interface RegionMessageRow {
  id: string;
  client_id: string;
  text: string;
  lat: number;
  lon: number;
  region_key: string | null;
  author_name: string | null;
  created_at: string;
}

export interface NewRegionMessage {
  client_id: string;
  text: string;
  lat: number;
  lon: number;
  region_key?: string | null;
  author_name?: string | null;
}

const TABLE = 'region_messages';

/**
 * Insere uma nova mensagem de região (fire-and-forget).
 */
export async function insertRegionMessage(msg: NewRegionMessage): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).insert(msg);
  if (error) console.warn('[regionMessages] falha ao inserir:', error.message);
}

/**
 * Assina INSERTs em tempo real. Retorna uma função para cancelar a assinatura.
 */
export function subscribeToRegionMessages(
  onInsert: (row: RegionMessageRow) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel('region_messages_stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE },
      (payload) => {
        onInsert(payload.new as RegionMessageRow);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
