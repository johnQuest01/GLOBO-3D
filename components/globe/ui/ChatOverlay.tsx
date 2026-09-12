'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';

import type { Mensagem } from '@/app/hooks/useConversas';
import {
  AUDIO_MAX_MS,
  BYTES_MAX,
  cabeComoVideo,
  duracaoDe,
  formatoDeAudio,
  prepararImagem,
  tamanhoLegivel,
  type TipoDeMidia,
} from '@/lib/chat/midia';

/**
 * A conversa, em tela cheia, com o globo desfocado por baixo.
 *
 * A tela não depende de conexão viva: ela abre com a outra pessoa offline,
 * guarda o que foi dito e continua lá depois de recarregar a página.
 *
 * O AVISO DIZ A VERDADE: enquanto nada era gravado, ele dizia isso. Agora o
 * servidor guarda a mensagem até entregar — então é isso que está escrito.
 *
 * DENUNCIAR E BLOQUEAR continuam a um clique, sem menu escondido.
 */

interface Props {
  aberta: boolean;
  nome: string;
  mensagens: Mensagem[];
  online: boolean;
  videoRemoto?: MediaStream | null;
  videoLocal?: MediaStream | null;
  /** O outro lado está escrevendo agora. */
  digitando?: boolean;
  onEnviarTexto: (texto: string) => boolean;
  /** Chamada a cada tecla. O freio de rede é de quem recebe esta chamada. */
  onDigitando?: () => void;
  onEnviarMidia: (
    tipo: TipoDeMidia,
    blob: Blob,
    mime: string,
    duracaoMs?: number,
  ) => Promise<boolean>;
  onMarcarLidas: () => void;
  onFechar: () => void;
  onChamarVideo?: () => void;
  onDenunciar: (motivo: string) => void;
  onBloquear: () => void;
}

const hora = (quando: number) =>
  new Date(quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const dia = (quando: number) =>
  new Date(quando).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

const duracaoLegivel = (ms?: number) => {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * O tique.
 *
 * Três estados e não dois, porque "o servidor pegou" e "o aparelho dela pegou"
 * são coisas diferentes — a primeira acontece na hora, a segunda pode acontecer
 * amanhã.
 */
const Recibo: FC<{ estado?: Mensagem['entrega'] }> = ({ estado }) => {
  if (!estado) return null;
  if (estado === 'falhou') return <span className="text-red-300">!</span>;
  if (estado === 'enviando') return <span className="text-white/30">◌</span>;
  if (estado === 'enviada') return <span className="text-white/50">✓</span>;
  return <span className={estado === 'lida' ? 'text-cyan-300' : 'text-white/50'}>✓✓</span>;
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
  digitando,
  onEnviarTexto,
  onDigitando,
  onEnviarMidia,
  onMarcarLidas,
  onFechar,
  onChamarVideo,
  onDenunciar,
  onBloquear,
}) => {
  const [texto, setTexto] = useState('');
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [preparando, setPreparando] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const fim = useRef<HTMLDivElement>(null);
  const videoRemotoRef = useRef<HTMLVideoElement>(null);
  const videoLocalRef = useRef<HTMLVideoElement>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const cancelarRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const quantidade = mensagens.length;

  useEffect(() => {
    if (aberta) fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [quantidade, aberta]);

  /**
   * Marca como lido só com a janela à vista.
   *
   * Sem a checagem de `visibilityState`, uma aba em segundo plano marcaria tudo
   * como lido e o ✓✓ azul do outro lado seria mentira.
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
      if (e.key !== 'Escape') return;
      if (ampliada) setAmpliada(null);
      else onFechar();
    };
    if (aberta) window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, onFechar, ampliada]);

  // Microfone preso com a tela fechada seria o pior tipo de surpresa.
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const g = gravadorRef.current;
      if (g && g.state !== 'inactive') {
        cancelarRef.current = true;
        g.stop();
      }
    },
    [],
  );

  // --- Envio de arquivo ------------------------------------------------------

  const escolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;

    setProblema(null);
    setPreparando('Preparando a foto…');
    try {
      // Encolher no navegador é o que faz a foto de 4 MB da câmera virar
      // mensagem. O arquivo original nunca sai do aparelho.
      const pronta = await prepararImagem(arquivo);
      if (!pronta) {
        setProblema('Não consegui preparar essa imagem.');
        return;
      }
      await onEnviarMidia('imagem', pronta.blob, pronta.mime);
    } finally {
      setPreparando(null);
    }
  };

  const escolherVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;

    setProblema(null);
    if (!cabeComoVideo(arquivo)) {
      setProblema(
        `Esse vídeo tem ${tamanhoLegivel(arquivo.size)} e o limite é ${tamanhoLegivel(
          BYTES_MAX,
        )}. Mande um trecho mais curto.`,
      );
      return;
    }

    setPreparando('Preparando o vídeo…');
    try {
      const duracaoMs = await duracaoDe(arquivo);
      await onEnviarMidia('video', arquivo, arquivo.type || 'video/mp4', duracaoMs);
    } finally {
      setPreparando(null);
    }
  };

  // --- Gravação de áudio -----------------------------------------------------

  const pararDeGravar = useCallback((cancelar: boolean) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelarRef.current = cancelar;
    const g = gravadorRef.current;
    if (g && g.state !== 'inactive') g.stop();
    setGravando(false);
    setSegundos(0);
  }, []);

  const comecarAGravar = useCallback(async () => {
    if (gravadorRef.current) return;
    setProblema(null);

    const mime = formatoDeAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const gravador = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      gravadorRef.current = gravador;
      pedacosRef.current = [];
      cancelarRef.current = false;
      inicioRef.current = Date.now();

      gravador.ondataavailable = (ev) => {
        if (ev.data.size > 0) pedacosRef.current.push(ev.data);
      };

      gravador.onstop = async () => {
        // O microfone precisa ser solto SEMPRE, inclusive quando a gravação foi
        // cancelada: parar o gravador não desliga o aparelho.
        for (const faixa of stream.getTracks()) faixa.stop();
        gravadorRef.current = null;

        const duracaoMs = Date.now() - inicioRef.current;
        const pedacos = pedacosRef.current;
        pedacosRef.current = [];

        if (cancelarRef.current || pedacos.length === 0) return;
        // Meio segundo é quase sempre o dedo escorregando no botão.
        if (duracaoMs < 500) return;

        const blob = new Blob(pedacos, { type: gravador.mimeType });
        if (blob.size > BYTES_MAX) {
          setProblema('Esse áudio ficou grande demais. Grave um mais curto.');
          return;
        }
        await onEnviarMidia('audio', blob, gravador.mimeType, duracaoMs);
      };

      gravador.start();
      setGravando(true);
      setSegundos(0);
      timerRef.current = setInterval(() => {
        setSegundos((s) => {
          const novo = s + 1;
          // Teto de duração: o envelope tem tamanho, e parar sozinho é melhor
          // que recusar depois de a pessoa ter falado dois minutos à toa.
          if (novo * 1000 >= AUDIO_MAX_MS) pararDeGravar(false);
          return novo;
        });
      }, 1000);
    } catch {
      setProblema('Microfone não liberado.');
    }
  }, [onEnviarMidia, pararDeGravar]);

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
            {/*
              O "digitando…" TOMA O LUGAR do estado de presença em vez de
              aparecer ao lado dele. Quem está escrevendo está online — dizer
              as duas coisas gastaria uma linha para repetir uma delas.
            */}
            {digitando ? (
              <p className="truncate text-xs text-cyan-300">
                digitando<span className="inline-block animate-pulse">…</span>
              </p>
            ) : (
              <p className="truncate text-xs text-white/45">
                {online ? 'online agora' : 'offline — vai receber quando voltar'}
              </p>
            )}
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

        {/* --- Vídeo da chamada --- */}
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
                    className={`max-w-[82%] px-1.5 py-1.5 text-[15px] leading-snug shadow-sm ${
                      minha
                        ? 'rounded-2xl rounded-br-md bg-cyan-600/90 text-white'
                        : 'rounded-2xl rounded-bl-md bg-white/[0.13] text-white/95'
                    }`}
                  >
                    {m.tipo === 'texto' && (
                      <p className="whitespace-pre-wrap break-words px-1.5">{m.texto}</p>
                    )}

                    {m.tipo === 'imagem' && m.midiaUrl && (
                      <button
                        type="button"
                        onClick={() => setAmpliada(m.midiaUrl!)}
                        className="block"
                        title="Ver maior"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.midiaUrl}
                          alt="foto da conversa"
                          className="max-h-72 rounded-xl"
                        />
                      </button>
                    )}

                    {m.tipo === 'video' && m.midiaUrl && (
                      <video
                        src={m.midiaUrl}
                        controls
                        playsInline
                        className="max-h-72 rounded-xl"
                      />
                    )}

                    {m.tipo === 'audio' && m.midiaUrl && (
                      <div className="flex items-center gap-2 px-1">
                        <audio src={m.midiaUrl} controls className="h-10 max-w-[13rem]" />
                        {m.duracaoMs ? (
                          <span className="text-[11px] text-white/60">
                            {duracaoLegivel(m.duracaoMs)}
                          </span>
                        ) : null}
                      </div>
                    )}

                    <div className="mt-0.5 flex items-center justify-end gap-1 px-1.5 text-[10px] text-white/50">
                      <span>{hora(m.quando)}</span>
                      {minha && <Recibo estado={m.entrega} />}
                    </div>

                    {m.entrega === 'falhou' && (
                      <p className="px-1.5 pb-1 text-[11px] text-red-200">
                        {ERRO_EM_PORTUGUES[m.erro ?? ''] ?? 'Não foi enviada.'}
                      </p>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/*
            A BOLHA DE "DIGITANDO", no fim da conversa.
            O aviso ja aparecia no cabecalho, mas o cabecalho fica longe de
            onde os olhos estao: quem espera resposta olha para a ultima
            mensagem. Aqui ele aparece no lugar onde a resposta vai nascer, com
            a forma da bolha de quem esta escrevendo — e por isso empurra a
            conversa para baixo, levando a rolagem junto.
          */}
          {digitando && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-3 ring-1 ring-white/10">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
              </div>
            </div>
          )}

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
            {gravando ? (
              <div className="flex items-center gap-3 rounded-2xl bg-red-500/15 px-4 py-2.5 ring-1 ring-red-400/30">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
                <span className="flex-1 text-sm text-white">
                  Gravando… {duracaoLegivel(segundos * 1000)}
                </span>
                <button
                  type="button"
                  onClick={() => pararDeGravar(true)}
                  className="text-sm text-white/60 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => pararDeGravar(false)}
                  className="rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-cyan-500"
                >
                  Enviar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <label
                  className="cursor-pointer rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  title="Enviar foto"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10" r="1.5" />
                    <path d="M21 16l-5-5-4 4-2-2-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <input type="file" accept="image/*" onChange={escolherFoto} className="hidden" />
                </label>

                <label
                  className="cursor-pointer rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  title="Enviar vídeo"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 3.5V7z" strokeLinejoin="round" />
                  </svg>
                  <input type="file" accept="video/*" onChange={escolherVideo} className="hidden" />
                </label>

                <button
                  type="button"
                  onClick={comecarAGravar}
                  title="Gravar áudio"
                  aria-label="Gravar áudio"
                  className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                  </svg>
                </button>

                <input
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    if (e.target.value) onDigitando?.();
                  }}
                  placeholder="Escreva uma mensagem…"
                  maxLength={4000}
                  enterKeyHint="send"
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
                  /*
                   * NÃO TIRE O FOCO DO CAMPO AO TOCAR AQUI.
                   *
                   * No celular, tocar num botão tira o foco do campo de texto,
                   * o teclado começa a fechar e a barra de escrever desce
                   * JUNTO — no meio do toque. O dedo desceu num botão que,
                   * quando levantou, já não estava mais ali: o clique nunca
                   * acontece, a mensagem não sai e o texto fica no campo.
                   *
                   * Impedir o padrão do `pointerdown` mantém o foco onde está.
                   * O teclado não fecha, nada se mexe, o clique chega — e de
                   * quebra dá para escrever a próxima mensagem em seguida, que
                   * é como todo aplicativo de conversa se comporta.
                   */
                  onPointerDown={(e) => e.preventDefault()}
                  title="Enviar"
                  aria-label="Enviar mensagem"
                  className="rounded-full bg-cyan-600 p-2.5 text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 12l16-8-6 16-2.5-6.5z" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            )}

            {preparando && (
              <p className="mt-2 text-center text-xs text-cyan-200/80">{preparando}</p>
            )}
            {problema && (
              <p className="mt-2 text-center text-xs text-red-300">{problema}</p>
            )}

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

      {/* Foto ampliada. Fecha com Esc ou clique, como qualquer visualizador. */}
      {ampliada && (
        <div
          className="absolute inset-0 z-[220] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setAmpliada(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada} alt="foto ampliada" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
};

export default ChatOverlay;
