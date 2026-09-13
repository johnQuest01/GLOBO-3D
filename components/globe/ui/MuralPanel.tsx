"use client";

import React, { FC, useCallback, useEffect, useRef, useState } from "react";

import { subirMidia, urlDaMidia } from "@/lib/chat/midiaRemota";

/**
 * O mural do globo.
 *
 * O QUE ELE É, e o que ele deliberadamente não é. Não há curtida, não há
 * seguidor e não há contagem de nada. O mural existe para uma coisa só: ver que
 * há gente viva no mundo agora e ter um motivo para puxar conversa. Número ao
 * lado de um post transforma publicar em competir, e competir é o que faz as
 * pessoas postarem para a métrica em vez de para quem está do outro lado.
 *
 * TUDO SOME EM 24 HORAS, e isso é dito na tela, não escondido nas regras. Saber
 * que vai sumir muda o que se escreve — é a diferença entre um recado e um
 * currículo.
 *
 * O LUGAR DE CADA POST APARECE JUNTO porque é a única coisa que este mural tem
 * que nenhum outro tem: "Moscou, Rússia" embaixo de uma frase é o que faz girar
 * o globo depois valer a pena.
 */

interface Post {
  id: string;
  autor: string;
  autorAvatar: string | null;
  kind: "texto" | "imagem" | "video";
  body: string | null;
  midiaChave: string | null;
  lat: number;
  lon: number;
  lugar: string | null;
  criadoEm: string;
  expiraEm: string;
  oculto?: boolean;
  denuncias?: number;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** Levar o globo até o post. É o que liga o mural ao mapa. */
  onVerNoGlobo: (lat: number, lon: number, rotulo: string) => void;
  onVerPerfil: (nickname: string) => void;
  onConversar: (nickname: string) => void;
  /** Para o mural não oferecer "conversar consigo mesmo". */
  meuNickname?: string | null;
}

const MOTIVOS: { valor: string; rotulo: string }[] = [
  { valor: "crianca", rotulo: "Parece ser uma criança" },
  { valor: "nudez", rotulo: "Nudez ou conteúdo sexual" },
  { valor: "assedio", rotulo: "Assédio ou ataque a alguém" },
  { valor: "violencia", rotulo: "Violência" },
  { valor: "golpe", rotulo: "Golpe ou fraude" },
  { valor: "spam", rotulo: "Spam" },
  { valor: "outro", rotulo: "Outro motivo" },
];

const TEXTO_MAX = 600;

/** "faltam 3 h" — o prazo é a informação mais útil que um post carrega aqui. */
function tempoQueResta(expiraEm: string): string {
  const ms = Date.parse(expiraEm) - Date.now();
  if (ms <= 0) return "sumindo";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60)} h`;
}

/**
 * A foto de um post.
 *
 * SÓ PEDE A URL QUANDO CHEGA PERTO DA TELA. Um mural com sessenta posts pediria
 * sessenta endereços de uma vez, e a pessoa veria os três primeiros. O
 * `IntersectionObserver` faz o pedido acontecer na hora de aparecer.
 */
const MidiaDoPost: FC<{
  chave: string;
  kind: "imagem" | "video";
  alt: string;
}> = ({ chave, kind, alt }) => {
  const [url, setUrl] = useState<string | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa || url) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        observador.disconnect();
        void urlDaMidia(chave).then((u) => setUrl(u));
      },
      { rootMargin: "200px" },
    );
    observador.observe(caixa);
    return () => observador.disconnect();
  }, [chave, url]);

  return (
    <div
      ref={caixaRef}
      className="mt-2 overflow-hidden rounded-xl bg-white/5"
      style={{ minHeight: url ? undefined : 120 }}
    >
      {url && kind === "imagem" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="max-h-80 w-full object-cover" />
      )}
      {url && kind === "video" && (
        <video src={url} controls playsInline className="max-h-80 w-full" />
      )}
    </div>
  );
};

const MuralPanel: FC<Props> = ({
  aberto,
  onFechar,
  onVerNoGlobo,
  onVerPerfil,
  onConversar,
  meuNickname,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [acabou, setAcabou] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const [denunciando, setDenunciando] = useState<Post | null>(null);

  const carregar = useCallback(async (antesDe: string | null) => {
    setCarregando(true);
    try {
      const r = await fetch(
        antesDe
          ? `/api/posts?antesDe=${encodeURIComponent(antesDe)}`
          : "/api/posts",
      );
      if (!r.ok) {
        setAviso("Não consegui carregar o mural agora.");
        return;
      }
      const d = (await r.json()) as { posts: Post[]; proximo: string | null };
      setPosts((atuais) => {
        // Dedupe por id: a página seguinte pode encavalar com um post novo
        // que chegou durante a rolagem.
        const vistos = new Set(atuais.map((p) => p.id));
        return antesDe
          ? [...atuais, ...d.posts.filter((p) => !vistos.has(p.id))]
          : d.posts;
      });
      setCursor(d.proximo);
      if (d.posts.length === 0) setAcabou(true);
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setAcabou(false);
    setAviso(null);
    void carregar(null);
  }, [aberto, carregar]);

  if (!aberto) return null;

  const publicar = async () => {
    if (enviando) return;
    if (!texto.trim() && !arquivo) return;

    setEnviando(true);
    setAviso(null);
    try {
      let midiaChave: string | null = null;
      let kind: Post["kind"] = "texto";

      if (arquivo) {
        const mime = arquivo.type || "application/octet-stream";
        kind = mime.startsWith("video/") ? "video" : "imagem";
        const enviada = await subirMidia(arquivo, mime);
        if (!enviada) {
          setAviso("Não consegui enviar o arquivo.");
          return;
        }
        midiaChave = enviada.chave;
      }

      const r = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, body: texto.trim() || null, midiaChave }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        post?: Post;
        reason?: string;
      };

      if (!r.ok) {
        /*
         * OS DOIS MOTIVOS QUE A PESSOA PODE RESOLVER ganham uma frase que diz o
         * que fazer. "Não foi possível publicar" para quem só falta escolher um
         * nickname é a forma mais curta de perder alguém.
         */
        if (d.reason === "sem-nickname") {
          setAviso(
            "Escolha um nome público antes de publicar — é ele que assina o post.",
          );
        } else if (d.reason === "sem-lugar") {
          setAviso(
            "Diga onde você está no globo antes de publicar: o post nasce nesse lugar.",
          );
        } else {
          setAviso("Não consegui publicar agora.");
        }
        return;
      }

      if (d.post) setPosts((atuais) => [d.post!, ...atuais]);
      setTexto("");
      setArquivo(null);
      if (arquivoRef.current) arquivoRef.current.value = "";
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (post: Post) => {
    const r = await fetch(`/api/posts?id=${encodeURIComponent(post.id)}`, {
      method: "DELETE",
    });
    if (r.ok) setPosts((atuais) => atuais.filter((p) => p.id !== post.id));
  };

  const denunciar = async (post: Post, motivo: string) => {
    setDenunciando(null);
    const r = await fetch("/api/posts/denunciar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId: post.id, motivo }),
    });
    const d = (await r.json().catch(() => ({}))) as { saiuDoAr?: boolean };
    /*
     * A CONFIRMAÇÃO NÃO DIZ QUANTO FALTA. "Faltam duas" convida a juntar mais
     * duas, e quem usaria essa informação é quem está coordenando. Quando o
     * post cai, aí sim vale dizer — quem denunciou precisa saber que serviu.
     */
    setAviso(
      d.saiuDoAr
        ? "Denúncia registrada. Este post saiu do ar e vai ser revisado."
        : "Denúncia registrada. Obrigado — alguém vai olhar.",
    );
    // O post some da lista de quem denunciou de qualquer forma: continuar vendo
    // o que se acabou de denunciar é desconfortável sem nenhuma vantagem.
    setPosts((atuais) => atuais.filter((p) => p.id !== post.id));
  };

  return (
    <div className="fixed inset-0 z-[168] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mural do globo"
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-slate-950/70 shadow-2xl
                   ring-1 ring-white/15 backdrop-blur-xl sm:max-h-[85dvh] sm:w-[min(94vw,32rem)] sm:rounded-3xl"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-white">
              Mural do globo
            </h2>
            <p className="mt-0.5 text-[11px] text-white/45">
              Tudo some em 24 horas. Cada post aparece no lugar de quem
              escreveu.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="shrink-0 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Escrever */}
        <div className="border-b border-white/10 p-4">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
            placeholder="O que está acontecendo aí?"
            rows={2}
            className="w-full resize-none rounded-2xl bg-white/10 px-3 py-2 text-[15px] text-white
                       placeholder-white/35 outline-none ring-1 ring-white/10 focus:ring-cyan-400/40"
          />

          {arquivo && (
            <p className="mt-2 flex items-center gap-2 text-[11px] text-white/60">
              <span className="truncate">{arquivo.name}</span>
              <button
                type="button"
                onClick={() => {
                  setArquivo(null);
                  if (arquivoRef.current) arquivoRef.current.value = "";
                }}
                className="shrink-0 text-white/40 hover:text-white/80"
              >
                tirar
              </button>
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <input
              ref={arquivoRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="hidden"
              id="mural-arquivo"
            />
            <label
              htmlFor="mural-arquivo"
              className="cursor-pointer rounded-xl bg-white/10 p-2 text-white/70 hover:bg-white/20"
              title="Foto ou vídeo"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10" r="1.5" />
                <path d="M21 16l-5-5-4 4-2-2-7 7" strokeLinejoin="round" />
              </svg>
            </label>

            <span className="text-[11px] text-white/30">
              {texto.length}/{TEXTO_MAX}
            </span>

            <button
              type="button"
              onClick={() => void publicar()}
              disabled={enviando || (!texto.trim() && !arquivo)}
              className="ml-auto rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white
                         hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
            >
              {enviando ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </div>

        {aviso && (
          <p className="border-b border-white/10 bg-white/5 px-4 py-2 text-center text-xs text-white/70">
            {aviso}
          </p>
        )}

        {/* O mural */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {posts.length === 0 && !carregando && (
            <p className="py-10 text-center text-sm text-white/40">
              Ninguém publicou nas últimas 24 horas. Comece você.
            </p>
          )}

          <ul className="space-y-4">
            {posts.map((post) => {
              const meu = meuNickname && post.autor === meuNickname;
              return (
                <li
                  key={post.id}
                  className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => onVerPerfil(post.autor)}
                      className="shrink-0"
                      aria-label={`Perfil de ${post.autor}`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-400/80 to-blue-600/80 text-sm font-semibold text-white">
                        {post.autorAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.autorAvatar}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          post.autor.charAt(0).toUpperCase()
                        )}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <button
                          type="button"
                          onClick={() => onVerPerfil(post.autor)}
                          className="truncate text-sm font-semibold text-white hover:underline"
                        >
                          @{post.autor}
                        </button>
                        <span className="shrink-0 text-[10px] text-white/30">
                          some em {tempoQueResta(post.expiraEm)}
                        </span>
                      </div>

                      {post.lugar && (
                        <button
                          type="button"
                          onClick={() =>
                            onVerNoGlobo(post.lat, post.lon, post.lugar!)
                          }
                          className="mt-0.5 flex items-center gap-1 text-[11px] text-cyan-300/70 hover:text-cyan-200"
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"
                              strokeLinejoin="round"
                            />
                            <circle cx="12" cy="10" r="2.5" />
                          </svg>
                          {post.lugar}
                        </button>
                      )}
                    </div>
                  </div>

                  {post.body && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/85">
                      {post.body}
                    </p>
                  )}

                  {post.midiaChave && post.kind !== "texto" && (
                    <MidiaDoPost
                      chave={post.midiaChave}
                      kind={post.kind}
                      alt={`Publicação de ${post.autor}`}
                    />
                  )}

                  <div className="mt-2.5 flex items-center gap-4 text-[11px]">
                    {meu ? (
                      <button
                        type="button"
                        onClick={() => void apagar(post)}
                        className="text-white/35 hover:text-white/70"
                      >
                        Apagar
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onConversar(post.autor)}
                          className="font-medium text-cyan-300/80 hover:text-cyan-200"
                        >
                          Conversar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDenunciando(post)}
                          className="ml-auto text-white/30 hover:text-red-300"
                        >
                          Denunciar
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {cursor && !acabou && (
            <button
              type="button"
              onClick={() => void carregar(cursor)}
              disabled={carregando}
              className="mt-4 w-full rounded-xl bg-white/5 py-2.5 text-sm text-white/60 hover:bg-white/10"
            >
              {carregando ? "Carregando…" : "Ver mais"}
            </button>
          )}
        </div>
      </div>

      {/* Denunciar: o motivo importa tanto quanto a denúncia. */}
      {denunciando && (
        <div className="absolute inset-0 z-10 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setDenunciando(null)}
            aria-hidden="true"
          />
          <div className="relative w-full rounded-t-3xl bg-slate-900/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-white/15 sm:w-[min(92vw,22rem)] sm:rounded-3xl">
            <p className="text-sm font-semibold text-white">
              Por que este post não deveria estar aqui?
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              Denúncias de pessoas diferentes tiram o post do ar até alguém
              revisar.
            </p>
            <div className="mt-3 space-y-1">
              {MOTIVOS.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => void denunciar(denunciando, m.valor)}
                  className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/80 hover:bg-white/10"
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDenunciando(null)}
              className="mt-2 w-full rounded-xl bg-white/5 py-2 text-sm text-white/50 hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MuralPanel;
