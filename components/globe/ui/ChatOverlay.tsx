'use client';

import React, { FC, useEffect, useRef, useState } from 'react';

import type { Mensagem } from '@/app/hooks/useConversas';

/**
 * A conversa, em tela cheia, com o globo desfocado por baixo.
 *
 * O QUE MUDOU NESTA FASE: a tela não depende mais de uma conexão viva. Antes
 * ela só existia enquanto o canal P2P estivesse de pé, e fechar apagava tudo.
 * Agora a conversa é um lugar: abre com a pessoa offline, guarda o que foi dito
 * e continua lá depois de recarregar a página.
 *
 * E O AVISO MUDOU JUNTO. Enquanto nada era gravado, a tela dizia isso. Agora o
 * servidor guarda a mensagem até entregar — então ela diz ISSO, e não a frase
 * antiga, que ficaria bonita e mentirosa.
 *
 * DENUNCIAR E BLOQUEAR continuam a um clique, sem menu escondido.
 */

interface Props {
  aberta: boolean;
  /** O nickname de quem está do outro lado. */
  nome: string;
  mensagens: Mensagem[];
  /** Online agora? Muda só o pontinho e o texto do cabeçalho. */
  online: boolean;
  /** Estado da chamada de vídeo, quando há uma. */
  videoRemoto?: MediaStream | null;
  videoLocal?: MediaStream | null;
  onEnviarTexto: (texto: string) => boolean;
  onMarcarLidas: () => void;
  onFechar: () => void;
  onChamarVideo?: () => void;
  onDenunciar: (motivo: string) => void;
  onBloquear: () => void;
}

const hora = (quando: number) =>
  new Date(quando).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const dia = (quando: number) =>
  new Date(quando).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });

/**
 * O tique.
 *
 * Três estados e não dois, porque "o servidor pegou" e "o aparelho dela pegou"
 * são coisas diferentes — e é exatamente a diferença que a caixa postal
 * introduziu: a primeira acontece na hora, a segunda pode acontecer amanhã.
 */
const Recibo: FC<{ estado?: Mensagem['entrega'] }> = ({ estado }) => {
  if (!estado) return null;
  if (estado === 'falhou') return <span className="text-red-300">!</span>;
  if (estado === 'enviando') return <span className="text-white/30">◌</span>;
  if (estado === 'enviada') return <span className="text-white/50">✓</span>;
  return (
    <span className={estado === 'lida' ? 'text-cyan-300' : 'text-white/50'}>✓✓</span>
  );
};

const ERRO_EM_PORTUGUES: Record<string, string> = {
  SEM_DESTINATARIO: 'Esse nickname não existe mais.',
  BLOQUEADO: 'Vocês não podem mais se falar.',
  GRANDE_DEMAIS: 'Conteúdo grande demais.',
  INDISPONIVEL: 'As mensagens estão indisponíveis agora.',
  SEM_CONTA: 'Escolha um nickname para poder conversar.',
};

const ChatOverlay: FC<Props> = ({
  aberta,
  nome,
  mensagens,
  online,
  videoRemoto,
  videoLocal,
  onEnviarTexto,
  onMarcarLidas,
  onFechar,
  onChamarVideo,
  onDenunciar,
  onBloquear,
}) => {
  const [texto, setTexto] = useState('');
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const fim = useRef<HTMLDivElement>(null);
  const videoRemotoRef = useRef<HTMLVideoElement>(null);
  const videoLocalRef = useRef<HTMLVideoElement>(null);

  const quantidade = mensagens.length;

  useEffect(() => {
    if (aberta) fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [quantidade, aberta]);

  /**
   * Marca como lido só com a janela à vista.
   *
   * A checagem de `visibilityState` não é preciosismo: sem ela, uma aba em
   * segundo plano marcaria tudo como lido e o ✓✓ azul do outro lado seria
   * mentira — justamente o detalhe que faz alguém confiar ou não no recibo.
   */
  useEffect(() => {
    if (!aberta) return;
    const marcar = () => {
      if (document.visibilityState === 'visible') onMarcarLidas();
    };
    marcar();
    document.addEventListener('visibilitychange', marcar);
    window.addEventListener('focus', marcar);
    return () => {
      document.removeEventListener('visibilitychange', marcar);
      window.removeEventListener('focus', marcar);
    };
  }, [quantidade, aberta, onMarcarLidas]);

  // O elemento de vídeo recebe o stream por propriedade: `src` não aceita
  // MediaStream.
  useEffect(() => {
    if (videoRemotoRef.current) videoRemotoRef.current.srcObject = videoRemoto ?? null;
  }, [videoRemoto]);

  useEffect(() => {
    if (videoLocalRef.current) videoLocalRef.current.srcObject = videoLocal ?? null;
  }, [videoLocal]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    if (aberta) window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, onFechar]);

  if (!aberta) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (onEnviarTexto(texto)) setTexto('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${nome}`}
      className="fixed inset-0 z-[200] flex items-center justify-center"
    >
      {/* O desfoque: o globo continua reconhecível atrás e para de disputar
          clique, porque esta camada cobre tudo e recebe os eventos. */}
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-2xl backdrop-saturate-150"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden
                   bg-white/[0.07] ring-1 ring-white/15 shadow-2xl
                   sm:h-[min(88vh,46rem)] sm:w-[min(92vw,34rem)] sm:rounded-3xl"
      >
        {/* --- Cabeçalho --- */}
        <header className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/90 to-blue-600/90 text-base font-semibold text-white">
              {nome.charAt(0).toUpperCase()}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-slate-900 ${
                online ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-white">@{nome}</p>
            <p className="truncate text-xs text-white/45">
              {online ? 'online agora' : 'offline — vai receber quando voltar'}
            </p>
          </div>

          {onChamarVideo && (
            <button
              type="button"
              onClick={onChamarVideo}
              disabled={!online}
              title={online ? 'Chamar em vídeo' : 'Só dá para chamar quem está online'}
              aria-label="Chamar em vídeo"
              className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-white/20 disabled:hover:bg-transparent"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 3.5V7z" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={onFechar}
            title="Fechar (Esc)"
            aria-label="Fechar conversa"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* --- Vídeo, quando há chamada --- */}
        {(videoRemoto || videoLocal) && (
          <div className="relative bg-black/60">
            <video ref={videoRemotoRef} autoPlay playsInline className="max-h-52 w-full object-contain" />
            {videoLocal && (
              <video
                ref={videoLocalRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-2 right-2 w-24 rounded-xl ring-1 ring-white/25"
              />
            )}
          </div>
        )}

        {/* --- Mensagens --- */}
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          <p className="mx-auto max-w-sm rounded-2xl bg-black/25 px-3 py-2 text-center text-[11px] leading-relaxed text-white/45">
            O servidor guarda a mensagem só até entregar, e apaga depois. O
            histórico fica neste aparelho.
          </p>

          {mensagens.length === 0 && (
            <p className="py-8 text-center text-sm text-white/35">
              Nenhuma mensagem ainda. Escreva a primeira —{' '}
              {online ? 'ela chega agora.' : 'ela espera essa pessoa voltar.'}
            </p>
          )}

          {mensagens.map((m, i) => {
            const minha = m.de === 'eu';
            const anterior = mensagens[i - 1];
            const trocouODia =
              !anterior ||
              new Date(anterior.quando).toDateString() !==
                new Date(m.quando).toDateString();

            return (
              <React.Fragment key={m.id}>
                {trocouODia && (
                  <p className="py-1 text-center text-[10px] uppercase tracking-wide text-white/30">
                    {dia(m.quando)}
                  </p>
                )}
                <div className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[82%] px-3 py-2 text-[15px] leading-snug shadow-sm ${
                      minha
                        ? 'rounded-2xl rounded-br-md bg-cyan-600/90 text-white'
                        : 'rounded-2xl rounded-bl-md bg-white/[0.13] text-white/95'
                    }`}
                  >
                    {m.tipo === 'texto' && (
                      <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                    )}

                    {m.tipo === 'imagem' && m.midiaUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={m.midiaUrl} alt="imagem da conversa" className="max-h-64 rounded-xl" />
                    )}

                    {m.tipo === 'audio' && m.midiaUrl && (
                      <audio src={m.midiaUrl} controls className="h-9 max-w-[12rem]" />
                    )}

                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-white/50">
                      <span>{hora(m.quando)}</span>
                      {minha && <Recibo estado={m.entrega} />}
                    </div>

                    {m.entrega === 'falhou' && (
                      <p className="mt-1 text-[11px] text-red-200">
                        {ERRO_EM_PORTUGUES[m.erro ?? ''] ?? 'Não foi enviada.'}
                      </p>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={fim} />
        </div>

        {/* --- Denúncia --- */}
        {pedindoMotivo ? (
          <div className="space-y-2 border-t border-white/10 px-4 py-3">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="O que aconteceu?"
              maxLength={300}
              autoFocus
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-cyan-400/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onDenunciar(motivo || 'sem descrição');
                  setPedindoMotivo(false);
                  setMotivo('');
                }}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Denunciar e sair
              </button>
              <button
                type="button"
                onClick={() => setPedindoMotivo(false)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={enviar}
            className="border-t border-white/10 bg-white/[0.04] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva uma mensagem…"
                maxLength={4000}
                /*
                 * A tecla do teclado do celular vira "enviar" em vez de
                 * "nova linha". E' o caminho que a maioria usa no celular — e
                 * funciona mesmo se o botao estiver escondido por qualquer
                 * motivo.
                 */
                enterKeyHint="send"
                /* Com o teclado aberto, garante que o campo fique a vista. */
                onFocus={(e) =>
                  setTimeout(
                    () => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }),
                    300,
                  )
                }
                className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-[15px] text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-cyan-400/50"
              />
              <button
                type="submit"
                disabled={!texto.trim()}
                title="Enviar"
                aria-label="Enviar mensagem"
                className="rounded-full bg-cyan-600 p-2.5 text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 12l16-8-6 16-2.5-6.5z" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="mt-2 flex justify-center gap-4 text-[11px]">
              <button
                type="button"
                onClick={() => setPedindoMotivo(true)}
                className="text-red-300/70 hover:text-red-200"
              >
                Denunciar
              </button>
              <button
                type="button"
                onClick={onBloquear}
                className="text-white/40 hover:text-white/70"
              >
                Bloquear
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChatOverlay;
