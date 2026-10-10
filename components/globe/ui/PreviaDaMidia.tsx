"use client";

import React, { FC, useEffect, useRef, useState } from "react";

/**
 * O que aparece quando a pessoa escolhe uma foto ou um vídeo.
 *
 * O QUE HAVIA ANTES: `foto.jpg  2.0 MB  tirar`. O nome do arquivo é a única
 * coisa que uma pessoa NÃO escolheu — ela escolheu uma imagem, e a tela
 * devolvia um texto. Com o nome genérico que a câmera dá (`IMG_20260214.jpg`),
 * nem dava para saber se era a foto certa sem publicar e conferir depois.
 *
 * O QUE APARECE AGORA: a imagem. Quem escolheu uma foto vê a foto; quem
 * escolheu um vídeo vê o primeiro quadro, com a duração e um triângulo. É a
 * confirmação que o gesto pedia — e ela é instantânea, porque o arquivo já
 * está no aparelho: nada sobe para isto acontecer.
 *
 * A PRÉVIA É O QUE SERÁ PUBLICADO, não um corte. O quadrado cortaria a foto em
 * pé do celular justamente no alto, que é onde costuma estar o assunto. Aqui a
 * mídia aparece inteira, com a altura que a proporção dela pedir, até um teto
 * — e o que a pessoa vê é o que vai.
 */

interface Props {
  arquivo: File;
  onTirar: () => void;
  /** De 0 a 1 enquanto o vídeo é recodificado; nulo quando não há preparo. */
  preparo?: number | null;
}

/**
 * O tamanho na unidade em que ele é legível.
 *
 * `(bytes / 1048576).toFixed(1)` transforma todo arquivo pequeno em "0.0 MB",
 * que a pessoa lê como "deu errado" — e um número que parece erro ao lado de
 * uma foto que está certa faz ela desistir de publicar.
 */
function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** "1:23" — a duração dita como se lê num tocador. */
function duracaoLegivel(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/*
 * ONDE PROCURAR UM QUADRO QUE NÃO SEJA PRETO.
 *
 * Câmera de celular começa a gravar antes de o sensor se ajustar: o primeiro
 * meio segundo costuma ser preto, às vezes mais. Um salto fixo para 0,1 s
 * acerta num vídeo e erra no seguinte — e prévia preta não confirma nada, que
 * é o problema inteiro que esta tela existe para resolver.
 *
 * Então em vez de adivinhar um instante, a prévia TENTA e OLHA: desenha o
 * quadro num quadrado de 32 pixels, mede o brilho médio e, se for quase preto,
 * pula para o próximo instante. Quatro tentativas bastam; nenhuma delas custa
 * download, porque o arquivo já está no aparelho.
 */
const INSTANTES = [0.1, 0.6, 1.5, 3];
const ESCURO_DEMAIS = 14; // 0–255. Abaixo disto, a tela parece desligada.

const PreviaDaMidia: FC<Props> = ({ arquivo, onTirar, preparo }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [duracao, setDuracao] = useState<number | null>(null);
  const [medidas, setMedidas] = useState<{ l: number; a: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tentativa = useRef(0);

  /** O brilho médio do quadro que está na tela agora, de 0 a 255. */
  const brilhoDoQuadro = (v: HTMLVideoElement): number | null => {
    try {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 32;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return null;
      g.drawImage(v, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      let soma = 0;
      for (let i = 0; i < d.length; i += 4) {
        soma += (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
      }
      return soma / (d.length / 4);
    } catch {
      /* alguns formatos recusam a leitura; aí não dá para julgar */
      return null;
    }
  };

  /** Pula para o próximo instante da lista, se ainda houver. */
  const procurarQuadro = (v: HTMLVideoElement) => {
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    while (tentativa.current < INSTANTES.length) {
      const quando = INSTANTES[tentativa.current]!;
      tentativa.current += 1;
      if (dur === 0 || quando < dur * 0.9) {
        try {
          v.currentTime = quando;
          return true;
        } catch {
          /* o formato recusou o salto; tenta o próximo */
        }
      }
    }
    return false;
  };

  const ehVideo = (arquivo.type || "").startsWith("video/");

  /*
   * O ENDEREÇO É LOCAL, e por isso instantâneo: `createObjectURL` aponta para
   * os bytes que já estão na memória do aparelho. E ele é REVOGADO na limpeza —
   * sem isso, trocar de foto dez vezes deixa dez arquivos presos na memória
   * até a página fechar.
   */
  useEffect(() => {
    const endereco = URL.createObjectURL(arquivo);
    setUrl(endereco);
    setDuracao(null);
    setMedidas(null);
    tentativa.current = 0;
    return () => URL.revokeObjectURL(endereco);
  }, [arquivo]);

  return (
    <div className="mt-3">
      <div className="relative overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10">
        {url && ehVideo && (
          <video
            ref={videoRef}
            src={url}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (Number.isFinite(v.duration)) setDuracao(v.duration);
              if (v.videoWidth) setMedidas({ l: v.videoWidth, a: v.videoHeight });
              tentativa.current = 0;
              procurarQuadro(v);
            }}
            onSeeked={(e) => {
              const v = e.currentTarget;
              const brilho = brilhoDoQuadro(v);
              // Nulo = não deu para medir; então fica o que veio, que é melhor
              // que ficar saltando às cegas pelo vídeo inteiro.
              if (brilho !== null && brilho < ESCURO_DEMAIS) procurarQuadro(v);
            }}
            className="max-h-64 w-full object-contain"
          />
        )}

        {url && !ehVideo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="O que você escolheu"
            onLoad={(e) =>
              setMedidas({
                l: e.currentTarget.naturalWidth,
                a: e.currentTarget.naturalHeight,
              })
            }
            className="max-h-64 w-full object-contain"
          />
        )}

        {!url && <div className="h-40 w-full animate-pulse bg-white/5" />}

        {/* O triângulo e a duração: é vídeo, e tem este tamanho. */}
        {ehVideo && duracao !== null && (
          <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-slate-950/80 px-1.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {duracaoLegivel(duracao)}
          </span>
        )}

        {/*
          TIRAR FICA SOBRE A IMAGEM, no canto. Embaixo, como era, ele competia
          com o botão de publicar — e os dois juntos num celular são dois alvos
          a dois centímetros um do outro, com consequências opostas.
        */}
        <button
          type="button"
          onClick={onTirar}
          aria-label="Tirar este arquivo"
          className="absolute right-2 top-2 rounded-full bg-slate-950/80 p-1.5 text-white/80 ring-1 ring-white/20 backdrop-blur hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        {/*
          O PREPARO ACONTECE SOBRE A PRÓPRIA MÍDIA. Separado, ele era uma barra
          solta que não dizia do que estava falando; por cima, fica claro que o
          que está sendo preparado é aquilo que se está vendo.
        */}
        {preparo !== null && preparo !== undefined && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 backdrop-blur-sm">
            <span className="text-[12px] font-medium text-white/90">
              Preparando para caber… {Math.round(preparo * 100)}%
            </span>
            <span className="h-1 w-32 overflow-hidden rounded-full bg-white/15">
              <span
                className="block h-full rounded-full bg-emerald-400 transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(3, preparo * 100)}%` }}
              />
            </span>
            <span className="px-6 text-center text-[10px] leading-snug text-white/45">
              Um vídeo de um minuto leva cerca de um minuto. Deixe a tela aberta.
            </span>
          </div>
        )}
      </div>

      {/*
        OS NÚMEROS FICAM DISCRETOS, embaixo. Eles importam quando algo dá
        errado — "não consegui enviar (148 MB)" só é acionável se a pessoa
        souber o que são 148 MB —, mas não são o que ela veio ver.
      */}
      <p className="mt-1.5 flex items-center gap-2 px-0.5 text-[10px] text-white/35">
        <span>{tamanhoLegivel(arquivo.size)}</span>
        {medidas && (
          <span>
            · {medidas.l}×{medidas.a}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-white/25">
          {arquivo.name}
        </span>
      </p>
    </div>
  );
};

export default PreviaDaMidia;
