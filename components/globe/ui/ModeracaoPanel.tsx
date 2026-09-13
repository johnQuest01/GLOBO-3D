"use client";

import React, { FC, useCallback, useEffect, useState } from "react";

import { urlDaMidia } from "@/lib/chat/midiaRemota";

/**
 * A fila de moderação.
 *
 * O QUE ESTA TELA EXISTIA PARA RESOLVER. As duas camadas de moderação já
 * funcionavam no banco — a comunidade esconde por volume, quem modera decide
 * por cima —, mas a segunda camada não tinha porta. A consequência, dita sem
 * rodeio: uma publicação escondida por três denúncias ficava escondida para
 * sempre, porque nada podia devolvê-la ao ar; e uma que merecia sair de vez
 * voltava sozinha no dia seguinte, quando as denúncias envelheciam. Moderação
 * sem tela não é moderação, é uma tabela.
 *
 * ESCONDER É PAUSA, REMOVER É DECISÃO, e a tela precisa deixar isso óbvio. Por
 * isso os dois botões não são iguais: "devolver ao ar" é o gesto barato e
 * comum, e "remover" pede um segundo toque. Não é desconfiança de quem modera;
 * é que a mão erra, e desfazer uma remoção exige ir ao banco.
 *
 * O QUE FOI DENUNCIADO APARECE INTEIRO. Vídeo toca, imagem abre, texto se lê —
 * julgar pelo motivo da denúncia, sem olhar o conteúdo, é julgar pela boca de
 * quem denunciou.
 */

interface PostNaFila {
  id: string;
  autor: string;
  kind: "texto" | "imagem" | "video";
  body: string | null;
  midiaChave: string | null;
  cartazChave: string | null;
  lugar: string | null;
  criadoEm: string;
  ocultoEm: string | null;
  denuncias: number;
  motivos: string[];
}

interface ComentarioNaFila {
  id: string;
  postId: string;
  autor: string;
  corpo: string;
  criadoEm: string;
  ocultoEm: string | null;
  denuncias: number;
  motivos: string[];
  postCorpo: string | null;
  postLugar: string | null;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
}

/** Os rótulos dos motivos. O valor cru ("crianca") não é para ser lido. */
const MOTIVO: Record<string, string> = {
  crianca: "parece ser uma criança",
  nudez: "nudez ou conteúdo sexual",
  assedio: "assédio ou ataque",
  violencia: "violência",
  golpe: "golpe ou spam",
  outro: "outro",
};

function quando(iso: string | null): string {
  if (!iso) return "";
  const minutos = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (minutos < 60) return `há ${Math.round(minutos)} min`;
  const horas = minutos / 60;
  if (horas < 24) return `há ${Math.round(horas)} h`;
  return `há ${Math.round(horas / 24)} d`;
}

/**
 * Os motivos, agrupados e contados.
 *
 * Cinco denúncias de "spam" e uma de "isto é uma criança" não são seis
 * denúncias: são um caso de spam e um caso grave. Uma lista corrida esconderia
 * a segunda no meio das cinco.
 */
function agrupar(motivos: string[]): { rotulo: string; n: number }[] {
  const conta = new Map<string, number>();
  for (const m of motivos) conta.set(m, (conta.get(m) ?? 0) + 1);
  return [...conta.entries()]
    .map(([m, n]) => ({ rotulo: MOTIVO[m] ?? m, n }))
    .sort((a, b) => b.n - a.n);
}

// ---------------------------------------------------------------------------

/** A mídia denunciada, carregada só quando o caso está na tela. */
const MidiaDoCaso: FC<{ post: PostNaFila }> = ({ post }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [cartaz, setCartaz] = useState<string | null>(null);

  useEffect(() => {
    if (!post.midiaChave) return;
    let vivo = true;
    void urlDaMidia(post.midiaChave).then((u) => vivo && setUrl(u));
    if (post.cartazChave) {
      void urlDaMidia(post.cartazChave).then((u) => vivo && setCartaz(u));
    }
    return () => {
      vivo = false;
    };
  }, [post.midiaChave, post.cartazChave]);

  if (post.kind === "texto" || !post.midiaChave) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-lg bg-black/50">
      {url && post.kind === "video" && (
        <video
          src={url}
          poster={cartaz ?? undefined}
          controls
          playsInline
          muted
          className="max-h-56 w-full object-contain"
        />
      )}
      {url && post.kind === "imagem" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Publicação de ${post.autor}`}
          className="max-h-56 w-full object-contain"
        />
      )}
      {!url && <div className="h-28 w-full animate-pulse bg-white/5" />}
    </div>
  );
};

/** Os dois botões. "Remover" pede confirmação; "devolver" não. */
const Decisao: FC<{
  ocupado: boolean;
  onRestaurar: () => void;
  onRemover: () => void;
}> = ({ ocupado, onRestaurar, onRemover }) => {
  const [certeza, setCerteza] = useState(false);

  useEffect(() => {
    if (!certeza) return;
    // A confirmação expira sozinha: um "tem certeza?" que fica armado na tela
    // vira uma armadilha para o próximo toque, cinco minutos depois.
    const t = setTimeout(() => setCerteza(false), 6000);
    return () => clearTimeout(t);
  }, [certeza]);

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        disabled={ocupado}
        onClick={onRestaurar}
        className="flex-1 rounded-lg bg-emerald-600/80 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
      >
        Devolver ao ar
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => {
          if (certeza) onRemover();
          else setCerteza(true);
        }}
        className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
          certeza
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-white/10 text-white/80 hover:bg-white/20"
        }`}
      >
        {certeza ? "Confirmar remoção" : "Remover"}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------

const ModeracaoPanel: FC<Props> = ({ aberto, onFechar }) => {
  const [aba, setAba] = useState<"posts" | "comentarios">("posts");
  const [posts, setPosts] = useState<PostNaFila[] | null>(null);
  const [comentarios, setComentarios] = useState<ComentarioNaFila[] | null>(
    null,
  );
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setAviso(null);
    try {
      const [rp, rc] = await Promise.all([
        fetch("/api/admin/posts", { credentials: "include" }),
        fetch("/api/admin/comentarios", { credentials: "include" }),
      ]);
      if (rp.status === 401 || rc.status === 401) {
        setAviso("Sua sessão de moderação venceu. Entre de novo.");
        setPosts([]);
        setComentarios([]);
        return;
      }
      const dp = (await rp.json().catch(() => ({}))) as { fila?: PostNaFila[] };
      const dc = (await rc.json().catch(() => ({}))) as {
        fila?: ComentarioNaFila[];
      };
      setPosts(dp.fila ?? []);
      setComentarios(dc.fila ?? []);
    } catch {
      setAviso("Sem conexão agora.");
      setPosts([]);
      setComentarios([]);
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setPosts(null);
    setComentarios(null);
    void carregar();
  }, [aberto, carregar]);

  const decidirPost = async (id: string, acao: "restaurar" | "remover") => {
    setOcupado(id);
    try {
      const r = await fetch("/api/admin/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ postId: id, acao }),
      });
      if (!r.ok) {
        setAviso("Não consegui registrar a decisão.");
        return;
      }
      // Some da fila na hora: ela é "o que falta julgar", e isto já foi.
      setPosts((f) => (f ? f.filter((p) => p.id !== id) : f));
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setOcupado(null);
    }
  };

  const decidirComentario = async (
    id: string,
    acao: "restaurar" | "remover",
  ) => {
    setOcupado(id);
    try {
      const r = await fetch("/api/admin/comentarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ comentarioId: id, acao }),
      });
      if (!r.ok) {
        setAviso("Não consegui registrar a decisão.");
        return;
      }
      setComentarios((f) => (f ? f.filter((c) => c.id !== id) : f));
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setOcupado(null);
    }
  };

  if (!aberto) return null;

  const nPosts = posts?.length ?? 0;
  const nComentarios = comentarios?.length ?? 0;

  return (
    <div className="fixed inset-0 z-[178] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fila de moderação"
        className="relative flex h-[86dvh] w-full flex-col rounded-t-3xl bg-slate-900/95 ring-1 ring-white/15 backdrop-blur-xl sm:h-[84dvh] sm:w-[min(94vw,34rem)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-white">
              Fila de moderação
            </h2>
            <p className="text-[11px] text-white/40">
              O que a comunidade escondeu e ainda ninguém julgou
            </p>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            aria-label="Atualizar"
            className="rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 12a8 8 0 1 1-2.3-5.6" strokeLinecap="round" />
              <path d="M20 4v5h-5" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 gap-1.5 px-4 pt-3">
          {(["posts", "comentarios"] as const).map((qual) => (
            <button
              key={qual}
              type="button"
              onClick={() => setAba(qual)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                aba === qual
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:bg-white/5"
              }`}
            >
              {qual === "posts" ? "Publicações" : "Comentários"}
              {/*
                O NÚMERO FICA NA ABA, e não só dentro dela. Quem abre esta tela
                quer saber onde está o trabalho antes de escolher onde olhar.
              */}
              {(qual === "posts" ? nPosts : nComentarios) > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-400/20 px-1.5 text-[11px] font-semibold text-amber-200">
                  {qual === "posts" ? nPosts : nComentarios}
                </span>
              )}
            </button>
          ))}
        </div>

        {aviso && (
          <p className="mx-4 mt-3 shrink-0 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
            {aviso}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {(aba === "posts" ? posts : comentarios) === null && (
            <p className="py-10 text-center text-xs text-white/30">
              carregando…
            </p>
          )}

          {/*
            FILA VAZIA É UMA BOA NOTÍCIA, e a tela diz isso. "Nenhum resultado"
            soaria como falha de busca; aqui o vazio é o estado desejado.
          */}
          {aba === "posts" && posts?.length === 0 && (
            <p className="py-12 text-center text-[13px] leading-relaxed text-white/40">
              Nada esperando julgamento.
              <br />
              <span className="text-white/25">
                Nenhuma publicação foi escondida por denúncias.
              </span>
            </p>
          )}
          {aba === "comentarios" && comentarios?.length === 0 && (
            <p className="py-12 text-center text-[13px] leading-relaxed text-white/40">
              Nada esperando julgamento.
              <br />
              <span className="text-white/25">
                Nenhum comentário foi escondido por denúncias.
              </span>
            </p>
          )}

          {aba === "posts" && posts && posts.length > 0 && (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-white">
                      @{p.autor}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-white/40">
                      {p.lugar ?? "sem lugar"} · {quando(p.criadoEm)}
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                      {p.denuncias}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {agrupar(p.motivos).map((m) => (
                      <span
                        key={m.rotulo}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/65"
                      >
                        {m.rotulo}
                        {m.n > 1 && ` ×${m.n}`}
                      </span>
                    ))}
                  </div>

                  {p.body && (
                    <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-white/80">
                      {p.body}
                    </p>
                  )}

                  <MidiaDoCaso post={p} />

                  <p className="mt-2 text-[10px] text-white/30">
                    fora do ar {quando(p.ocultoEm)}
                  </p>

                  <Decisao
                    ocupado={ocupado === p.id}
                    onRestaurar={() => void decidirPost(p.id, "restaurar")}
                    onRemover={() => void decidirPost(p.id, "remover")}
                  />
                </li>
              ))}
            </ul>
          )}

          {aba === "comentarios" && comentarios && comentarios.length > 0 && (
            <ul className="space-y-3">
              {comentarios.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-white">
                      @{c.autor}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-white/40">
                      {quando(c.criadoEm)}
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                      {c.denuncias}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {agrupar(c.motivos).map((m) => (
                      <span
                        key={m.rotulo}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/65"
                      >
                        {m.rotulo}
                        {m.n > 1 && ` ×${m.n}`}
                      </span>
                    ))}
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-white/85">
                    {c.corpo}
                  </p>

                  {/*
                    DO QUE ELE FALA. "Concordo" é inofensivo embaixo de uma foto
                    de praia e é outra coisa embaixo de um post sobre alguém.
                    Julgar sem isto é julgar metade do caso.
                  */}
                  <div className="mt-2 border-l-2 border-white/15 pl-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-white/30">
                      embaixo de
                    </p>
                    <p className="line-clamp-2 text-[12px] leading-snug text-white/50">
                      {c.postCorpo ?? "(publicação sem texto)"}
                    </p>
                    {c.postLugar && (
                      <p className="text-[10px] text-white/30">{c.postLugar}</p>
                    )}
                  </div>

                  <p className="mt-2 text-[10px] text-white/30">
                    fora do ar {quando(c.ocultoEm)}
                  </p>

                  <Decisao
                    ocupado={ocupado === c.id}
                    onRestaurar={() => void decidirComentario(c.id, "restaurar")}
                    onRemover={() => void decidirComentario(c.id, "remover")}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModeracaoPanel;
