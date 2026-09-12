'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';

import type { PessoaEncontrada } from '@/app/hooks/useLiveRealtime';
import type { Presence } from '@/realtime/shared/protocol';

/**
 * A lupa: procurar alguém pelo nickname e, achando, ir até a pessoa no globo.
 *
 * A BUSCA TEM DUAS METADES e esta tela junta as duas:
 *
 *   1. `/api/users/search` (Neon) — quem EXISTE com esse começo de nome. Vale
 *      inclusive para quem está offline, e é o que permite dizer "essa pessoa
 *      existe, mas não está online agora" em vez de "não encontrei".
 *   2. `directory:find` (realtime) — dessas pessoas, quem está online AGORA e
 *      em que coordenada. Isso não está no banco de propósito: presença muda a
 *      cada 15 segundos e não é dado de tabela.
 *
 * A busca no banco é ADIADA (300 ms). Uma requisição por tecla digitada é o
 * jeito mais fácil de transformar uma caixa de busca num pequeno ataque ao
 * próprio servidor.
 */

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** Só quem tem conta com nickname consegue ser encontrado — e encontrar. */
  meuNickname?: string;
  presencaPorNickname: Record<string, Presence | null>;
  /** Pergunta ao servidor de realtime quem, desta lista, está online. */
  onVerQuemEstaOnline: (nicknames: string[]) => void;
  /** Leva o globo até a pessoa (e marca o ponto). */
  onVerNoGlobo: (pessoa: PessoaEncontrada) => void;
  /** Pede conversa. Só faz sentido para quem está online. */
  onConectar: (pessoa: PessoaEncontrada) => void;
}

const ESPERA_MS = 300;

const lugarDe = (p: { city: string | null; state: string | null; country: string | null }) =>
  [p.city, p.state, p.country].filter(Boolean).join(', ') || 'lugar não informado';

const PeopleSearchPanel: FC<Props> = ({
  aberto,
  onFechar,
  meuNickname,
  presencaPorNickname,
  onVerQuemEstaOnline,
  onVerNoGlobo,
  onConectar,
}) => {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<
    { nickname: string; country: string | null; state: string | null; city: string | null }[]
  >([]);
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const entradaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) entradaRef.current?.focus();
  }, [aberto]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    if (aberto) window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  const buscar = useCallback(
    async (q: string, cancelado: () => boolean) => {
      setBuscando(true);
      setMensagem(null);
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (cancelado()) return;

        if (r.status === 401) {
          setResultados([]);
          setMensagem('Entre na sua conta para procurar pessoas.');
          return;
        }
        if (r.status === 429) {
          setMensagem('Muitas buscas seguidas. Espere um instante.');
          return;
        }
        if (!r.ok) {
          setMensagem('A busca está indisponível agora.');
          return;
        }

        const dados = (await r.json()) as { resultados?: typeof resultados };
        if (cancelado()) return;

        const achados = dados.resultados ?? [];
        setResultados(achados);
        if (achados.length === 0) setMensagem('Ninguém com esse nickname.');
        // Só agora pergunta ao realtime quem está online — em UM evento para a
        // lista toda, e não um por pessoa.
        else onVerQuemEstaOnline(achados.map((p) => p.nickname));
      } catch {
        if (!cancelado()) setMensagem('Não foi possível buscar agora.');
      } finally {
        if (!cancelado()) setBuscando(false);
      }
    },
    [onVerQuemEstaOnline],
  );

  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) {
      setResultados([]);
      setMensagem(q.length === 0 ? null : 'Digite pelo menos 2 letras.');
      return;
    }

    // A resposta de uma busca ABANDONADA não pode sobrescrever a da busca
    // atual: quem digita "ana" depois de "an" veria o resultado de "an" se a
    // primeira resposta chegasse atrasada.
    let morto = false;
    const t = setTimeout(() => void buscar(q, () => morto), ESPERA_MS);
    return () => {
      morto = true;
      clearTimeout(t);
    };
  }, [termo, buscar]);

  if (!aberto) return null;

  const comPresenca = (p: (typeof resultados)[number]): PessoaEncontrada => ({
    ...p,
    presenca: presencaPorNickname[p.nickname] ?? null,
  });

  return (
    <div className="fixed inset-0 z-[160] flex items-start justify-center pt-[10vh] sm:pt-[12vh]">
      <div
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Procurar pessoas"
        className="relative w-[min(94vw,30rem)] overflow-hidden rounded-3xl bg-white/[0.08] shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-white/50">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>

          <input
            ref={entradaRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value.toLowerCase().replace(/\s/g, ''))}
            placeholder="procurar por nickname…"
            maxLength={20}
            autoCapitalize="none"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder-white/40 outline-none"
          />

          {buscando && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300" />
          )}

          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar busca"
            className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!meuNickname && (
          <p className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200/90">
            Sua conta ainda não tem nickname, então ninguém consegue te achar
            aqui. Crie uma conta nova com nickname para aparecer na busca.
          </p>
        )}

        <div className="max-h-[50vh] overflow-y-auto">
          {mensagem && resultados.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-white/45">{mensagem}</p>
          )}

          {resultados.map((p) => {
            const pessoa = comPresenca(p);
            const online = Boolean(pessoa.presenca);
            return (
              <div
                key={p.nickname}
                className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0"
              >
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/80 to-blue-600/80 text-sm font-semibold text-white">
                    {p.nickname.charAt(0).toUpperCase()}
                  </div>
                  <span
                    title={online ? 'online agora' : 'offline'}
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-slate-900 ${
                      online ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-white">
                    @{p.nickname}
                  </p>
                  <p className="truncate text-xs text-white/45">{lugarDe(p)}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onVerNoGlobo(pessoa)}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20"
                >
                  Ver no globo
                </button>

                {/*
                  "Conectar" só aparece para quem está online, e isso não é
                  detalhe de interface: a conversa é ponta a ponta, então não
                  existe a quem entregar nada se a outra aba estiver fechada.
                  Um botão que falharia sempre é pior que botão nenhum.
                */}
                <button
                  type="button"
                  disabled={!online}
                  onClick={() => onConectar(pessoa)}
                  title={online ? 'Pedir conversa' : 'Essa pessoa não está online agora'}
                  className="rounded-full bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
                >
                  Conectar
                </button>
              </div>
            );
          })}
        </div>

        <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-white/35">
          A conversa é direta entre os dois navegadores. Nada fica gravado.
        </p>
      </div>
    </div>
  );
};

export default PeopleSearchPanel;
