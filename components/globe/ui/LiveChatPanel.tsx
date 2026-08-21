'use client';

import React, { FC, useEffect, useRef, useState } from 'react';

import type { EstadoDoRealtime } from '@/app/hooks/useLiveRealtime';

/**
 * O painel da conversa ao vivo.
 *
 * TUDO AQUI É EFÊMERO. Não existe gravação: fechar o painel apaga a conversa,
 * e nem o servidor nem o banco têm cópia. É por isso que o aviso disso fica
 * visível na própria tela — a pessoa precisa saber, antes de escrever, que
 * aquilo não volta.
 *
 * DENUNCIAR E BLOQUEAR ficam à mão, não escondidos num menu. Conversa com
 * estranho sem uma saída de um clique é um convite ao abuso, e o brief tratou
 * isso como pré-requisito do vídeo — não como melhoria futura.
 */

interface Props {
  estado: EstadoDoRealtime;
  onEnviarTexto: (texto: string) => boolean;
  onEnviarImagem: (arquivo: Blob) => Promise<boolean>;
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

const LiveChatPanel: FC<Props> = ({
  estado,
  onEnviarTexto,
  onEnviarImagem,
  onAlternarVideo,
  onEncerrar,
  onDenunciar,
  onBloquear,
}) => {
  const [texto, setTexto] = useState('');
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const videoRemotoRef = useRef<HTMLVideoElement>(null);
  const videoLocalRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [estado.mensagens.length]);

  // O elemento de vídeo recebe o stream por propriedade, não por atributo:
  // `src` não aceita MediaStream.
  useEffect(() => {
    if (videoRemotoRef.current) {
      videoRemotoRef.current.srcObject = estado.videoRemoto;
    }
  }, [estado.videoRemoto]);

  useEffect(() => {
    if (videoLocalRef.current) {
      videoLocalRef.current.srcObject = estado.videoLocal;
    }
  }, [estado.videoLocal]);

  if (!estado.emChamada) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (onEnviarTexto(texto)) setTexto('');
  };

  const escolherImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) await onEnviarImagem(arquivo);
    e.target.value = '';
  };

  return (
    <div className="absolute bottom-4 left-4 z-[130] w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-stone-900/95 backdrop-blur-sm ring-1 ring-cyan-700/50 shadow-2xl flex flex-col overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <span className="h-2 w-2 rounded-full bg-cyan-400" />
        <span className="text-sm font-semibold text-white flex-1 truncate">
          Conversa ao vivo
        </span>
        <span className="text-[11px] text-cyan-300/80">
          {ROTULO_ESTADO[estado.estadoDaChamada ?? 'conectando'] ?? ''}
        </span>
        <button
          type="button"
          onClick={onEncerrar}
          className="text-white/60 hover:text-white px-1"
          title="Encerrar"
        >
          ✕
        </button>
      </div>

      {estado.videoRemoto || estado.videoLocal ? (
        <div className="relative bg-black">
          <video
            ref={videoRemotoRef}
            autoPlay
            playsInline
            className="w-full max-h-56 object-contain"
          />
          {estado.videoLocal && (
            <video
              ref={videoLocalRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-2 right-2 w-20 rounded-lg ring-1 ring-white/20"
            />
          )}
        </div>
      ) : null}

      {/* Mensagens */}
      <div className="flex-1 max-h-64 overflow-y-auto px-3 py-2 space-y-2">
        <p className="text-[11px] text-white/40 text-center">
          Esta conversa é direta entre vocês dois e não fica gravada em lugar
          nenhum.
        </p>
        {estado.mensagens.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.de === 'eu' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-3 py-1.5 text-sm ${
                m.de === 'eu'
                  ? 'bg-cyan-700 text-white'
                  : 'bg-white/10 text-white/90'
              }`}
            >
              {m.texto}
              {m.imagemUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={m.imagemUrl}
                  alt="imagem enviada"
                  className="rounded-lg max-w-full"
                />
              )}
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      {/* Denúncia */}
      {pedindoMotivo ? (
        <div className="px-3 py-2 border-t border-white/10 space-y-2">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="O que aconteceu?"
            maxLength={300}
            className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onDenunciar(motivo || 'sem descrição');
                setPedindoMotivo(false);
                setMotivo('');
              }}
              className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-semibold text-white"
            >
              Denunciar e sair
            </button>
            <button
              type="button"
              onClick={() => setPedindoMotivo(false)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/80"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="px-3 py-2 border-t border-white/10">
          <div className="flex items-center gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva…"
              maxLength={4000}
              className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none"
            />
            <label
              className="cursor-pointer text-white/70 hover:text-white px-1"
              title="Enviar imagem"
            >
              🖼
              <input
                type="file"
                accept="image/*"
                onChange={escolherImagem}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={onAlternarVideo}
              className={`px-1 ${estado.videoLocal ? 'text-cyan-300' : 'text-white/70 hover:text-white'}`}
              title={estado.videoLocal ? 'Desligar vídeo' : 'Ligar vídeo'}
            >
              🎥
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white"
            >
              Enviar
            </button>
          </div>

          <div className="mt-2 flex gap-3 text-[11px]">
            <button
              type="button"
              onClick={() => setPedindoMotivo(true)}
              className="text-red-300/80 hover:text-red-200"
            >
              Denunciar
            </button>
            <button
              type="button"
              onClick={onBloquear}
              className="text-white/50 hover:text-white/80"
            >
              Bloquear
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default LiveChatPanel;
