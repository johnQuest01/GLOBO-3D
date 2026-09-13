"use client";

import React, { FC, useEffect, useRef, useState } from "react";

import { urlDaMidia } from "@/lib/chat/midiaRemota";

/**
 * A grade de fotos e vídeos de um perfil — abaixo da foto e das descrições.
 *
 * TRÊS COLUNAS DE QUADRADOS, como as redes que as pessoas já usam. A forma não
 * é enfeite: ela deixa o olho varrer vinte publicações num relance e escolher
 * uma, que é uma coisa que lista nenhuma faz. Uma lista vertical com título e
 * data pede LEITURA; a grade pede um olhar.
 *
 * O QUADRADO CORTA A IMAGEM, e isso é de propósito. Respeitar a proporção de
 * cada foto daria uma grade em dentes de serra, onde nada alinha e o olho tem
 * de recomeçar a cada linha. O corte é o que faz a grade ser uma grade. A
 * imagem inteira aparece ao abrir.
 *
 * O QUE A GRADE DESENHA É O CARTAZ, nunca o vídeo. Numa tela há até sessenta
 * quadrados; baixar o começo de cada vídeo para desenhar um quadro custaria
 * megabytes para mostrar polegadas. O cartaz é um JPEG de uns 8 KB, guardado
 * na publicação justamente para este momento.
 */

export interface ItemDaGrade {
  id: string;
  tipo: "mural" | "noticia";
  kind: "imagem" | "video";
  titulo: string | null;
  corpo: string | null;
  midiaChave: string;
  cartazChave: string | null;
  lat: number;
  lon: number;
  lugar: string | null;
  criadoEm: string;
  expiraEm: string | null;
  /** Só na minha grade: a comunidade escondeu esta publicação. */
  oculto?: boolean;
}

interface Props {
  /** O nickname de quem se está olhando. Nulo = a minha própria grade. */
  nickname: string | null;
  /** Some com o globo por trás e mostra o lugar da publicação. */
  onVerNoGlobo?: (lat: number, lon: number, rotulo: string) => void;
}

/** "há 3 dias" — numa grade, quando saiu importa mais que a data exata. */
function quandoSaiu(iso: string): string {
  const minutos = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (minutos < 60) return `há ${Math.round(minutos)} min`;
  const horas = minutos / 60;
  if (horas < 24) return `há ${Math.round(horas)} h`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  const meses = Math.round(dias / 30);
  return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

/** "some em 7 h" — o prazo é a informação mais útil que um post do mural tem. */
function tempoQueResta(iso: string | null): string | null {
  if (!iso) return null;
  const horas = (Date.parse(iso) - Date.now()) / 3_600_000;
  if (horas <= 0) return "vencendo";
  if (horas < 1) return `some em ${Math.round(horas * 60)} min`;
  return `some em ${Math.round(horas)} h`;
}

// ---------------------------------------------------------------------------
// Um quadrado
// ---------------------------------------------------------------------------

/**
 * O quadrado só busca a imagem quando chega perto da tela.
 *
 * Sem isso, abrir um perfil com sessenta publicações dispararia sessenta
 * downloads de uma vez — e os seis primeiros, que são os únicos que a pessoa
 * está vendo, ficariam na fila atrás dos outros cinquenta e quatro.
 */
const Quadrado: FC<{ item: ItemDaGrade; onAbrir: () => void }> = ({
  item,
  onAbrir,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [perto, setPerto] = useState(false);
  const caixaRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa || perto) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          obs.disconnect();
          setPerto(true);
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(caixa);
    return () => obs.disconnect();
  }, [perto]);

  useEffect(() => {
    if (!perto) return;
    // Vídeo desenha o cartaz; imagem desenha a si mesma.
    const chave = item.cartazChave ?? (item.kind === "imagem" ? item.midiaChave : null);
    if (!chave) return;
    let vivo = true;
    void urlDaMidia(chave).then((u) => {
      if (vivo) setUrl(u);
    });
    return () => {
      vivo = false;
    };
  }, [perto, item.cartazChave, item.midiaChave, item.kind]);

  return (
    <button
      ref={caixaRef}
      type="button"
      onClick={onAbrir}
      aria-label={item.titulo ?? `Publicação de ${quandoSaiu(item.criadoEm)}`}
      className="group relative aspect-square overflow-hidden bg-white/[0.06] transition-opacity hover:opacity-85"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-white/20"
          >
            <path d="M3 5h18v14H3z" strokeLinejoin="round" />
            <path d="m3 16 5-5 4 4 3-3 6 6" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      {/* O triângulo de vídeo: sem ele, foto e vídeo são o mesmo quadrado. */}
      {item.kind === "video" && (
        <span className="absolute right-1 top-1 drop-shadow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      )}

      {/*
        A NOTÍCIA SE DIZ, o post do mural não. Num perfil quase tudo é mural, e
        marcar o que é maioria é ruído; marcar a exceção é informação.
      */}
      {item.tipo === "noticia" && (
        <span className="absolute bottom-1 left-1 rounded bg-slate-950/75 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-white/80">
          notícia
        </span>
      )}

      {item.oculto && (
        <span className="absolute inset-0 flex items-center justify-center bg-slate-950/75 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
          escondida
        </span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Uma publicação aberta
// ---------------------------------------------------------------------------

/**
 * O visor.
 *
 * O VÍDEO TOCA COM SOM AQUI. Na grade ele é um quadrado parado; para chegar até
 * este visor foi preciso TOCAR num quadrado — e som que responde a um toque é
 * outra coisa do que som que começa sozinho enquanto alguém rola. Se o
 * navegador recusar, o vídeo volta mudo e tocando, com um botão explicando —
 * um vídeo parado sem explicação parece defeito.
 */
const Visor: FC<{
  item: ItemDaGrade;
  onFechar: () => void;
  onVerNoGlobo?: (lat: number, lon: number, rotulo: string) => void;
}> = ({ item, onFechar, onVerNoGlobo }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [cartaz, setCartaz] = useState<string | null>(null);
  const [mudo, setMudo] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let vivo = true;
    void urlDaMidia(item.midiaChave).then((u) => {
      if (vivo) setUrl(u);
    });
    if (item.cartazChave) {
      void urlDaMidia(item.cartazChave).then((u) => {
        if (vivo) setCartaz(u);
      });
    }
    return () => {
      vivo = false;
    };
  }, [item.midiaChave, item.cartazChave]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    v.muted = false;
    v.volume = 1;
    void v
      .play()
      .then(() => setMudo(false))
      .catch(() => {
        v.muted = true;
        setMudo(true);
        void v.play().catch(() => undefined);
      });
  }, [url]);

  // Esc fecha. Quem abriu com o teclado precisa poder sair com ele.
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [onFechar]);

  const prazo = tempoQueResta(item.expiraEm);

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.titulo ?? "Publicação"}
        className="relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-slate-900/90 ring-1 ring-white/15"
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-2 top-2 z-10 rounded-full bg-slate-950/70 p-1.5 text-white/70 backdrop-blur hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          {url && item.kind === "video" && (
            <video
              ref={videoRef}
              src={url}
              poster={cartaz ?? undefined}
              loop
              controls
              playsInline
              className="max-h-[58dvh] w-full object-contain"
            />
          )}
          {url && item.kind === "imagem" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={item.titulo ?? ""} className="max-h-[58dvh] w-full object-contain" />
          )}
          {!url && (
            <div className="flex h-52 w-full items-center justify-center text-xs text-white/30">
              carregando…
            </div>
          )}

          {mudo && item.kind === "video" && (
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = false;
                void v.play().then(() => setMudo(false)).catch(() => undefined);
              }}
              className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-slate-950/80 px-2.5 py-1.5 text-[11px] font-medium text-white ring-1 ring-white/20 backdrop-blur"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 10v4h3l5 4V6l-5 4H4z" strokeLinejoin="round" />
                <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
              </svg>
              som
            </button>
          )}
        </div>

        <div className="shrink-0 overflow-y-auto p-4">
          {item.titulo && (
            <p className="text-[15px] font-semibold leading-snug text-white">
              {item.titulo}
            </p>
          )}
          {item.corpo && (
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-white/70">
              {item.corpo}
            </p>
          )}

          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/40">
            {item.lugar && <span>{item.lugar}</span>}
            <span>· {quandoSaiu(item.criadoEm)}</span>
            {prazo && <span className="text-amber-300/70">· {prazo}</span>}
          </p>

          {onVerNoGlobo && (
            <button
              type="button"
              onClick={() => {
                onVerNoGlobo(item.lat, item.lon, item.lugar ?? "aqui");
                onFechar();
              }}
              className="mt-3 w-full rounded-xl bg-white/10 py-2.5 text-[13px] font-semibold text-white/85 hover:bg-white/20"
            >
              Ver este lugar no globo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A grade
// ---------------------------------------------------------------------------

const GradeDoPerfil: FC<Props> = ({ nickname, onVerNoGlobo }) => {
  const [itens, setItens] = useState<ItemDaGrade[] | null>(null);
  const [aberta, setAberta] = useState<ItemDaGrade | null>(null);

  useEffect(() => {
    let vivo = true;
    setItens(null);
    setAberta(null);
    void (async () => {
      try {
        const endereco = nickname
          ? `/api/grade?de=${encodeURIComponent(nickname)}`
          : "/api/grade?minha=1";
        const r = await fetch(endereco, { credentials: "include" });
        if (!r.ok) {
          if (vivo) setItens([]);
          return;
        }
        const d = (await r.json()) as { itens?: ItemDaGrade[] };
        if (vivo) setItens(d.itens ?? []);
      } catch {
        if (vivo) setItens([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [nickname]);

  /*
   * ENQUANTO CARREGA, NADA. A grade chega depois do perfil de propósito (são
   * duas idas ao servidor), e encher o espaço com seis quadrados cinzas faria
   * o cartão pular de altura quando os de verdade chegassem.
   */
  if (!itens) return null;

  /*
   * GRADE VAZIA NÃO VIRA UM AVISO. "Nenhuma publicação" é uma frase verdadeira
   * que ninguém veio ler, e ela ocupa o mesmo espaço que ocuparia conteúdo. Na
   * minha própria grade é diferente: ali o vazio é um convite, e ele explica
   * por que o espaço está vazio.
   */
  if (itens.length === 0) {
    if (nickname) return null;
    return (
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-center text-xs leading-relaxed text-white/35">
          Suas fotos e vídeos aparecem aqui.
          <br />
          O que você publica no mural some em 24 horas; notícia fica.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          {itens.length} {itens.length === 1 ? "publicação" : "publicações"}
        </p>

        {/*
          UM PIXEL DE VÃO, e não oito. O vão separado demais transforma a grade
          numa coleção de cartõezinhos; colado, ela vira uma superfície única e
          o olho percorre as imagens em vez de percorrer as bordas.
        */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-white/[0.04]">
          {itens.map((item) => (
            <Quadrado key={item.id} item={item} onAbrir={() => setAberta(item)} />
          ))}
        </div>
      </div>

      {aberta && (
        <Visor
          item={aberta}
          onFechar={() => setAberta(null)}
          onVerNoGlobo={onVerNoGlobo}
        />
      )}
    </>
  );
};

export default GradeDoPerfil;
