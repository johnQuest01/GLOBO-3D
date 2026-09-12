'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';

import type { EstadoDoRealtime } from '@/app/hooks/useLiveRealtime';

/**
 * A conversa, em tela cheia, com o globo desfocado por baixo.
 *
 * POR QUE TELA CHEIA E NÃO UM CARTÃO NO CANTO: conversa é a tarefa inteira
 * enquanto dura. O painel pequeno de antes disputava atenção e clique com o
 * globo girando atrás; o desfoque resolve os dois de uma vez — o globo
 * continua lá, reconhecível, e para de competir.
 *
 * TUDO AQUI É EFÊMERO. Não existe gravação: fechar a conversa apaga tudo, e
 * nem o servidor nem o banco têm cópia. O aviso disso fica na própria tela — a
 * pessoa precisa saber, antes de escrever, que aquilo não volta.
 *
 * DENUNCIAR E BLOQUEAR ficam à mão, não escondidos num menu. Conversa com
 * estranho sem uma saída de um clique é um convite ao abuso.
 */

interface Props {
  estado: EstadoDoRealtime;
  onEnviarTexto: (texto: string) => boolean;
  onEnviarImagem: (arquivo: Blob) => Promise<boolean>;
  onEnviarAudio: (arquivo: Blob, duracaoMs: number) => Promise<boolean>;
  onDigitando: (ativo: boolean) => void;
  onMarcarLidas: () => void;
  onAlternarVideo: () => void;
  onEncerrar: () => void;
  onDenunciar: (motivo: string) => void;
  onBloquear: () => void;
}

const ROTULO_ESTADO: Record<string, string> = {
  conectando: 'conectando…',
  conectado: 'conectado',
  reconectando: 'reconectando…',
  encerrado: 'encerrado',
  falhou: 'não foi possível conectar',
};

const hora = (quando: number) =>
  new Date(quando).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

const duracaoLegivel = (ms?: number) => {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * O ✓ e o ✓✓.
 *
 * Um traço visual, e não texto: "entregue" escrito ao lado de cada mensagem
 * roubaria a linha inteira numa conversa de frases curtas.
 */
const Recibo: FC<{ estado?: string }> = ({ estado }) => {
  if (!estado) return null;
  if (estado === 'enviando') return <span className="text-white/40">✓</span>;
  return (
    <span className={estado === 'lido' ? 'text-cyan-300' : 'text-white/50'}>✓✓</span>
  );
};

const ChatOverlay: FC<Props> = ({
  estado,
  onEnviarTexto,
  onEnviarImagem,
  onEnviarAudio,
  onDigitando,
  onMarcarLidas,
  onAlternarVideo,
  onEncerrar,
  onDenunciar,
  onBloquear,
}) => {
  const [texto, setTexto] = useState('');
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);
  const [segundosGravados, setSegundosGravados] = useState(0);
  const [erroDeMicrofone, setErroDeMicrofone] = useState<string | null>(null);

  const fim = useRef<HTMLDivElement>(null);
  const videoRemotoRef = useRef<HTMLVideoElement>(null);
  const videoLocalRef = useRef<HTMLVideoElement>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const inicioGravacaoRef = useRef(0);
  const cancelarGravacaoRef = useRef(false);
  const timerGravacaoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const quantidade = estado.mensagens.length;

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [quantidade, estado.digitando]);

  /**
   * Marca como lido quando a tela está de fato visível.
   *
   * A checagem de `visibilityState` não é preciosismo: sem ela, uma aba em
   * segundo plano marcaria tudo como lido, e o ✓✓ azul do outro lado seria
   * mentira — exatamente o tipo de detalhe que faz alguém confiar ou não no
   * recibo.
   */
  useEffect(() => {
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
  }, [quantidade, onMarcarLidas]);

  // O elemento de vídeo recebe o stream por propriedade, não por atributo:
  // `src` não aceita MediaStream.
  useEffect(() => {
    if (videoRemotoRef.current) videoRemotoRef.current.srcObject = estado.videoRemoto;
  }, [estado.videoRemoto]);

  useEffect(() => {
    if (videoLocalRef.current) videoLocalRef.current.srcObject = estado.videoLocal;
  }, [estado.videoLocal]);

  // Sair pelo Esc. Uma tela que cobre tudo e só fecha no X é uma armadilha.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEncerrar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onEncerrar]);

  // Se o componente sair do ar no meio de uma gravação, o microfone precisa
  // ser solto — senão a luz da câmera/mic fica acesa com a tela fechada.
  useEffect(
    () => () => {
      if (timerGravacaoRef.current) clearInterval(timerGravacaoRef.current);
      const g = gravadorRef.current;
      if (g && g.state !== 'inactive') {
        cancelarGravacaoRef.current = true;
        g.stop();
      }
    },
    [],
  );

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (onEnviarTexto(texto)) setTexto('');
  };

  const escolherImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) await onEnviarImagem(arquivo);
    e.target.value = '';
  };

  // --- Gravação de áudio ----------------------------------------------------

  const comecarAGravar = useCallback(async () => {
    if (gravadorRef.current) return;
    setErroDeMicrofone(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const gravador = new MediaRecorder(stream);
      gravadorRef.current = gravador;
      pedacosRef.current = [];
      cancelarGravacaoRef.current = false;
      inicioGravacaoRef.current = Date.now();

      gravador.ondataavailable = (ev) => {
        if (ev.data.size > 0) pedacosRef.current.push(ev.data);
      };

      gravador.onstop = async () => {
        // O microfone precisa ser solto SEMPRE, inclusive quando a gravação
        // foi cancelada: parar o gravador não desliga o dispositivo.
        for (const faixa of stream.getTracks()) faixa.stop();
        gravadorRef.current = null;

        const duracaoMs = Date.now() - inicioGravacaoRef.current;
        const pedacos = pedacosRef.current;
        pedacosRef.current = [];

        if (cancelarGravacaoRef.current || pedacos.length === 0) return;
        // Áudio de menos de meio segundo é quase sempre o dedo escorregando no
        // botão, não uma mensagem.
        if (duracaoMs < 500) return;

        await onEnviarAudio(new Blob(pedacos, { type: gravador.mimeType }), duracaoMs);
      };

      gravador.start();
      setGravando(true);
      setSegundosGravados(0);
      timerGravacaoRef.current = setInterval(
        () => setSegundosGravados((s) => s + 1),
        1000,
      );
    } catch {
      setErroDeMicrofone('Microfone não liberado.');
    }
  }, [onEnviarAudio]);

  const pararDeGravar = useCallback((cancelar: boolean) => {
    if (timerGravacaoRef.current) {
      clearInterval(timerGravacaoRef.current);
      timerGravacaoRef.current = null;
    }
    cancelarGravacaoRef.current = cancelar;
    const g = gravadorRef.current;
    if (g && g.state !== 'inactive') g.stop();
    setGravando(false);
    setSegundosGravados(0);
  }, []);

  if (!estado.emChamada) return null;

  const nome = estado.parNome ?? 'Conversa ao vivo';
  const inicial = (estado.parNome ?? '?').charAt(0).toUpperCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${nome}`}
      className="fixed inset-0 z-[200] flex items-center justify-center"
    >
      {/*
        O DESFOQUE. É esta camada que transforma o globo em fundo: ele continua
        girando e reconhecível atrás, e para de disputar clique — a camada
        cobre tudo e recebe os eventos.
      */}
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-2xl backdrop-saturate-150"
        onClick={onEncerrar}
        aria-hidden="true"
      />

      <div
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden
                   bg-white/[0.07] ring-1 ring-white/15 shadow-2xl
                   sm:h-[min(88vh,46rem)] sm:w-[min(92vw,34rem)] sm:rounded-3xl"
      >
        {/* --- Cabeçalho --- */}
        <header className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/90 to-blue-600/90 text-base font-semibold text-white">
            {inicial}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-white">{nome}</p>
            <p className="truncate text-xs text-cyan-300/80">
              {estado.digitando ? (
                <span className="inline-flex items-center gap-1">
                  digitando
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-300" />
                  </span>
                </span>
              ) : (
                (ROTULO_ESTADO[estado.estadoDaChamada ?? 'conectando'] ?? '')
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onAlternarVideo}
            title={estado.videoLocal ? 'Desligar vídeo' : 'Ligar vídeo'}
            aria-label={estado.videoLocal ? 'Desligar vídeo' : 'Ligar vídeo'}
            className={`rounded-full p-2 transition-colors ${
              estado.videoLocal
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 3.5V7z" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onEncerrar}
            title="Encerrar conversa (Esc)"
            aria-label="Encerrar conversa"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-red-500/20 hover:text-red-300"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* --- Vídeo --- */}
        {(estado.videoRemoto || estado.videoLocal) && (
          <div className="relative bg-black/60">
            <video
              ref={videoRemotoRef}
              autoPlay
              playsInline
              className="max-h-52 w-full object-contain"
            />
            {estado.videoLocal && (
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
          <p className="mx-auto max-w-xs rounded-full bg-black/25 px-3 py-1 text-center text-[11px] leading-relaxed text-white/45">
            Esta conversa vai direto de um aparelho ao outro. Nada fica gravado —
            nem no servidor, nem aqui depois que você fechar.
          </p>

          {estado.mensagens.map((m) => {
            const minha = m.de === 'eu';
            return (
              <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
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
                    <img
                      src={m.midiaUrl}
                      alt="imagem enviada na conversa"
                      className="max-h-64 rounded-xl"
                    />
                  )}

                  {m.tipo === 'audio' && m.midiaUrl && (
                    <div className="flex items-center gap-2">
                      <audio src={m.midiaUrl} controls className="h-9 max-w-[12rem]" />
                      {m.duracaoMs ? (
                        <span className="text-[11px] text-white/60">
                          {duracaoLegivel(m.duracaoMs)}
                        </span>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-white/50">
                    <span>{hora(m.quando)}</span>
                    {minha && <Recibo estado={m.entrega} />}
                  </div>
                </div>
              </div>
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
            {gravando ? (
              <div className="flex items-center gap-3 rounded-2xl bg-red-500/15 px-4 py-2.5 ring-1 ring-red-400/30">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
                <span className="flex-1 text-sm text-white">
                  Gravando… {duracaoLegivel(segundosGravados * 1000)}
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
              <div className="flex items-center gap-2">
                <label
                  className="cursor-pointer rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  title="Enviar foto"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="8.5" cy="10" r="1.5" />
                    <path d="M21 16l-5-5-4 4-2-2-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={escolherImagem}
                    className="hidden"
                  />
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
                    // O estrangulamento fica no peer: aqui a cada tecla, lá um
                    // pacote a cada segundo e meio.
                    onDigitando(e.target.value.length > 0);
                  }}
                  onBlur={() => onDigitando(false)}
                  placeholder="Escreva uma mensagem…"
                  maxLength={4000}
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
            )}

            {erroDeMicrofone && (
              <p className="mt-2 text-center text-xs text-red-300">{erroDeMicrofone}</p>
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
    </div>
  );
};

export default ChatOverlay;
