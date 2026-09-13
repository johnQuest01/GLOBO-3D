"use client";

import React, { FC, useCallback, useEffect, useRef, useState } from "react";

/**
 * Os comentários de uma publicação.
 *
 * DOIS NÍVEIS, E NÃO INFINITOS — comentário e resposta, como nas redes que as
 * pessoas já usam, e pelo motivo delas: numa tela de celular o terceiro nível
 * já não cabe, e a conversa vira uma escada de recuos que ninguém lê. Responder
 * à resposta de alguém continua funcionando: a linha guarda a quem responde (o
 * "@fulano") e pendura-se na mesma conversa. Isso também é uma escolha de
 * desempenho — ver lib/db/social.ts.
 *
 * AS RESPOSTAS SÓ CHEGAM QUANDO ALGUÉM ABRE A CONVERSA. Uma publicação com
 * quinhentas respostas espalhadas em vinte conversas mandaria as quinhentas
 * para desenhar vinte linhas.
 */

export interface Comentario {
  id: string;
  autor: string;
  autorAvatar: string | null;
  corpo: string;
  curtidas: number;
  respostas: number;
  respondeA: string | null;
  raizId: string | null;
  criadoEm: string;
  euCurti: boolean;
  meu: boolean;
}

interface Props {
  /** Nulo = fechado. */
  postId: string | null;
  onFechar: () => void;
  onVerPerfil: (nickname: string) => void;
  /** Sobe para a tela de fora, que guarda o número no cartão do post. */
  onContagem?: (postId: string, quantos: number) => void;
}

const CORPO_MAX = 2000;

function quando(iso: string): string {
  const minutos = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = minutos / 60;
  if (horas < 24) return `${Math.round(horas)} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return `${dias} d`;
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Um comentário
// ---------------------------------------------------------------------------

const Linha: FC<{
  c: Comentario;
  recuado?: boolean;
  onCurtir: (c: Comentario) => void;
  onResponder: (c: Comentario) => void;
  onApagar: (c: Comentario) => void;
  onDenunciar: (c: Comentario) => void;
  onVerPerfil: (nickname: string) => void;
  children?: React.ReactNode;
}> = ({
  c,
  recuado,
  onCurtir,
  onResponder,
  onApagar,
  onDenunciar,
  onVerPerfil,
  children,
}) => (
  <li className={recuado ? "pl-10" : undefined}>
    <div className="flex gap-2.5 py-2.5">
      <button
        type="button"
        onClick={() => onVerPerfil(c.autor)}
        aria-label={`Perfil de ${c.autor}`}
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-400/70 to-blue-600/70 text-[13px] font-semibold text-white"
      >
        {c.autorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.autorAvatar} alt="" className="h-full w-full object-cover" />
        ) : (
          c.autor.charAt(0).toUpperCase()
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-white/85">
          <button
            type="button"
            onClick={() => onVerPerfil(c.autor)}
            className="font-semibold text-white hover:underline"
          >
            @{c.autor}
          </button>{" "}
          {/*
            O "@fulano" DA RESPOSTA vem do servidor, e não de quem escreveu.
            Deixar a pessoa digitar o arroba faria o texto apontar para
            qualquer um — inclusive para quem nunca esteve na conversa.
          */}
          {c.respondeA && (
            <span className="font-medium text-cyan-300/80">@{c.respondeA} </span>
          )}
          <span className="whitespace-pre-wrap">{c.corpo}</span>
        </p>

        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
          <span>{quando(c.criadoEm)}</span>
          <button
            type="button"
            onClick={() => onResponder(c)}
            className="font-medium hover:text-white/70"
          >
            responder
          </button>
          {c.meu ? (
            <button
              type="button"
              onClick={() => onApagar(c)}
              className="hover:text-red-300"
            >
              apagar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDenunciar(c)}
              className="hover:text-amber-300"
            >
              denunciar
            </button>
          )}
        </div>

        {children}
      </div>

      {/*
        O CORAÇÃO FICA NA DIREITA, fora do fluxo do texto. Dentro da linha ele
        empurraria o texto para cima toda vez que a contagem passasse de 9 para
        10 — e uma linha que se remexe enquanto se lê é pior que um coração
        pequeno.
      */}
      <button
        type="button"
        onClick={() => onCurtir(c)}
        aria-label={c.euCurti ? "Descurtir" : "Curtir"}
        aria-pressed={c.euCurti}
        className="mt-1 flex w-7 shrink-0 flex-col items-center gap-0.5"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill={c.euCurti ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          className={c.euCurti ? "text-rose-400" : "text-white/35"}
        >
          <path
            d="M12 20s-7-4.6-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.4 12 20 12 20z"
            strokeLinejoin="round"
          />
        </svg>
        {c.curtidas > 0 && (
          <span className="text-[10px] tabular-nums text-white/40">
            {c.curtidas}
          </span>
        )}
      </button>
    </div>
  </li>
);

// ---------------------------------------------------------------------------
// O painel
// ---------------------------------------------------------------------------

const ComentariosPanel: FC<Props> = ({
  postId,
  onFechar,
  onVerPerfil,
  onContagem,
}) => {
  const [raizes, setRaizes] = useState<Comentario[] | null>(null);
  /** As respostas já abertas, por raiz. */
  const [respostas, setRespostas] = useState<Record<string, Comentario[]>>({});
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [respondendo, setRespondendo] = useState<Comentario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const campoRef = useRef<HTMLTextAreaElement | null>(null);

  /* -- Ler ---------------------------------------------------------------- */

  useEffect(() => {
    if (!postId) return;
    let vivo = true;
    setRaizes(null);
    setRespostas({});
    setRespondendo(null);
    setTexto("");
    setAviso(null);

    void (async () => {
      try {
        const r = await fetch(`/api/comentarios?post=${postId}`, {
          credentials: "include",
        });
        const d = (await r.json().catch(() => ({}))) as {
          comentarios?: Comentario[];
        };
        if (vivo) setRaizes(r.ok ? (d.comentarios ?? []) : []);
      } catch {
        if (vivo) setRaizes([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [postId]);

  const verRespostas = useCallback(
    async (raiz: Comentario) => {
      if (respostas[raiz.id]) {
        // Segundo toque fecha: o botão é o mesmo, e o gesto também.
        setRespostas((a) => {
          const copia = { ...a };
          delete copia[raiz.id];
          return copia;
        });
        return;
      }
      setAbrindo(raiz.id);
      try {
        const r = await fetch(`/api/comentarios?raiz=${raiz.id}`, {
          credentials: "include",
        });
        const d = (await r.json().catch(() => ({}))) as {
          comentarios?: Comentario[];
        };
        setRespostas((a) => ({ ...a, [raiz.id]: d.comentarios ?? [] }));
      } catch {
        setRespostas((a) => ({ ...a, [raiz.id]: [] }));
      } finally {
        setAbrindo(null);
      }
    },
    [respostas],
  );

  /* -- Curtir ------------------------------------------------------------- */

  /**
   * O coração muda ANTES da resposta do servidor.
   *
   * É o que faz o toque parecer instantâneo. O servidor devolve o número de
   * verdade e a tela se corrige — porque entre o toque e a resposta outras
   * pessoas curtiram também. Se o pedido falhar, o coração volta: um botão que
   * fica ligado depois de uma falha mente sobre o que está guardado.
   */
  const curtir = async (c: Comentario) => {
    const quero = !c.euCurti;
    const mexer = (novo: Partial<Comentario>) => {
      const aplicar = (lista: Comentario[]) =>
        lista.map((x) => (x.id === c.id ? { ...x, ...novo } : x));
      setRaizes((a) => (a ? aplicar(a) : a));
      setRespostas((a) => {
        const copia: Record<string, Comentario[]> = {};
        for (const [k, v] of Object.entries(a)) copia[k] = aplicar(v);
        return copia;
      });
    };

    mexer({
      euCurti: quero,
      curtidas: Math.max(0, c.curtidas + (quero ? 1 : -1)),
    });

    try {
      const r = await fetch("/api/curtir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ comentario: c.id, quero }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        curtidas?: number;
        euCurti?: boolean;
      };
      if (r.ok && typeof d.curtidas === "number") {
        mexer({ curtidas: d.curtidas, euCurti: Boolean(d.euCurti) });
      } else {
        mexer({ euCurti: c.euCurti, curtidas: c.curtidas });
      }
    } catch {
      mexer({ euCurti: c.euCurti, curtidas: c.curtidas });
    }
  };

  /* -- Escrever ----------------------------------------------------------- */

  const enviar = async () => {
    const corpo = texto.trim();
    if (!postId || !corpo || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/comentarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          post: postId,
          corpo,
          respondendoA: respondendo?.id ?? null,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        comentario?: Comentario;
        reason?: string;
      };

      if (!r.ok || !d.comentario) {
        setAviso(
          d.reason === "sem-nickname"
            ? "Escolha um nome público antes de comentar — é ele que assina."
            : d.reason === "muito-rapido"
              ? "Devagar um pouco."
              : "Não consegui comentar agora.",
        );
        return;
      }

      const novo = d.comentario;
      if (novo.raizId) {
        /*
         * A RESPOSTA ENTRA NA CONVERSA SE ELA ESTIVER ABERTA. Se estiver
         * fechada, só o contador sobe — abrir a conversa sozinha tiraria da
         * tela o que a pessoa estava lendo.
         */
        setRespostas((a) =>
          a[novo.raizId!]
            ? { ...a, [novo.raizId!]: [...a[novo.raizId!]!, novo] }
            : a,
        );
        setRaizes((a) =>
          a
            ? a.map((x) =>
                x.id === novo.raizId ? { ...x, respostas: x.respostas + 1 } : x,
              )
            : a,
        );
      } else {
        setRaizes((a) => (a ? [novo, ...a] : [novo]));
      }

      setTexto("");
      setRespondendo(null);
      onContagem?.(postId, 1);
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (c: Comentario) => {
    const r = await fetch(`/api/comentarios?id=${c.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) return;
    setRaizes((a) => (a ? a.filter((x) => x.id !== c.id) : a));
    setRespostas((a) => {
      const copia: Record<string, Comentario[]> = {};
      for (const [k, v] of Object.entries(a)) copia[k] = v.filter((x) => x.id !== c.id);
      return copia;
    });
    if (postId) onContagem?.(postId, -1);
  };

  const denunciar = async (c: Comentario) => {
    await fetch("/api/comentarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ denunciar: c.id }),
    });
    setAviso("Denúncia registrada. Obrigado.");
  };

  const responder = (c: Comentario) => {
    setRespondendo(c);
    campoRef.current?.focus();
  };

  if (!postId) return null;

  return (
    <div className="fixed inset-0 z-[175] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comentários"
        /*
          ALTURA FIXA NO CELULAR, e não altura de conteúdo. Com conteúdo, a
          folha cresce e encolhe a cada resposta aberta, e o campo de escrever
          pula de lugar debaixo do dedo.
        */
        className="relative flex h-[78dvh] w-full flex-col rounded-t-3xl bg-slate-900/95 ring-1 ring-white/15 backdrop-blur-xl sm:h-[80dvh] sm:w-[min(92vw,32rem)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="flex-1 text-[15px] font-semibold text-white">
            Comentários
          </h2>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {!raizes && (
            <p className="py-10 text-center text-xs text-white/30">carregando…</p>
          )}

          {raizes && raizes.length === 0 && (
            <p className="py-10 text-center text-[13px] leading-relaxed text-white/35">
              Ninguém comentou ainda.
              <br />
              Seja a primeira pessoa.
            </p>
          )}

          {raizes && raizes.length > 0 && (
            <ul className="divide-y divide-white/[0.06]">
              {raizes.map((c) => (
                <Linha
                  key={c.id}
                  c={c}
                  onCurtir={curtir}
                  onResponder={responder}
                  onApagar={apagar}
                  onDenunciar={denunciar}
                  onVerPerfil={onVerPerfil}
                >
                  {c.respostas > 0 && (
                    <button
                      type="button"
                      onClick={() => void verRespostas(c)}
                      className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/45 hover:text-white/70"
                    >
                      <span className="h-px w-5 bg-white/20" />
                      {abrindo === c.id
                        ? "abrindo…"
                        : respostas[c.id]
                          ? "esconder respostas"
                          : `ver ${c.respostas} ${c.respostas === 1 ? "resposta" : "respostas"}`}
                    </button>
                  )}

                  {respostas[c.id] && respostas[c.id]!.length > 0 && (
                    <ul className="mt-1">
                      {respostas[c.id]!.map((r) => (
                        <Linha
                          key={r.id}
                          c={r}
                          onCurtir={curtir}
                          onResponder={responder}
                          onApagar={apagar}
                          onDenunciar={denunciar}
                          onVerPerfil={onVerPerfil}
                        />
                      ))}
                    </ul>
                  )}
                </Linha>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {aviso && (
            <p className="mb-2 text-[11px] text-amber-200/80">{aviso}</p>
          )}

          {respondendo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-white/60">
              <span className="min-w-0 flex-1 truncate">
                respondendo a{" "}
                <strong className="font-semibold text-white/80">
                  @{respondendo.autor}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setRespondendo(null)}
                className="shrink-0 text-white/40 hover:text-white/80"
              >
                cancelar
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={campoRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, CORPO_MAX))}
              onKeyDown={(e) => {
                // Enter envia; Shift+Enter quebra linha. É o que o dedo já espera.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              rows={1}
              placeholder={respondendo ? "Sua resposta…" : "Comentar…"}
              /*
                A CAIXA TEM TETO DE ALTURA. Sem ele, um texto longo empurra a
                lista inteira para cima e a conversa some atrás do teclado —
                o mesmo defeito que a caixa do chat já teve.
              */
              className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl bg-white/10 px-3.5 py-2.5 text-[14px] text-white placeholder-white/35 outline-none ring-1 ring-white/10 focus:ring-cyan-400/40"
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando || !texto.trim()}
              className="h-[42px] shrink-0 rounded-2xl bg-cyan-600 px-4 text-[14px] font-semibold text-white hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
            >
              {enviando ? "…" : "enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComentariosPanel;
