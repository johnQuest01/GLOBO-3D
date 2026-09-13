"use client";

import React, { FC, useEffect, useState } from "react";

/**
 * O perfil de outra pessoa.
 *
 * POR QUE ELE PRECISOU EXISTIR. O aplicativo passou a recomendar gente e a
 * mostrar sinais do mundo inteiro — e a única coisa que se via de alguém era um
 * nickname e uma frase. Decidir se quer falar com um estranho a partir disso é
 * decidir no escuro, e quem paga por isso é sempre quem recebe o convite.
 *
 * O QUE ELE MOSTRA NÃO É DECISÃO DESTA TELA. O servidor já entrega podado, pela
 * vontade da pessoa (ver lib/db/perfil.ts). Aqui não há "se for privado,
 * esconda": o dado escondido simplesmente não chega. É a diferença entre
 * esconder de quem olha a tela e esconder de quem olha a rede.
 */

interface PerfilPublico {
  nickname: string;
  fullName: string | null;
  descricao: string | null;
  idade: number | null;
  avatarUrl: string | null;
  lugar: string | null;
  seguidores: number | null;
  visibilidade: "publico" | "reservado" | "privado";
}

interface Props {
  /** Nulo = fechado. */
  nickname: string | null;
  onFechar: () => void;
  onConversar: (nickname: string) => void;
}

const PerfilDeOutroPanel: FC<Props> = ({ nickname, onFechar, onConversar }) => {
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [semPerfil, setSemPerfil] = useState(false);
  /**
   * Sigo esta pessoa?
   *
   * VEM DA MINHA LISTA, e não de uma contagem no perfil dela. Não existe rota
   * que diga quantas pessoas seguem alguém, e a ausência é a funcionalidade:
   * com o número visível ele vira o objetivo, e as pessoas passam a publicar
   * para ele. Aqui a pergunta é sempre sobre MIM.
   */
  const [sigo, setSigo] = useState(false);
  const [mexendo, setMexendo] = useState(false);

  useEffect(() => {
    if (!nickname) return;
    let vivo = true;

    setPerfil(null);
    setSemPerfil(false);
    setCarregando(true);

    void (async () => {
      try {
        const r = await fetch(
          `/api/users/perfil?de=${encodeURIComponent(nickname)}`,
        );
        if (!vivo) return;
        if (!r.ok) {
          setSemPerfil(true);
          return;
        }
        const d = (await r.json()) as { perfil?: PerfilPublico };
        if (vivo && d.perfil) setPerfil(d.perfil);
      } catch {
        if (vivo) setSemPerfil(true);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    void (async () => {
      try {
        const r = await fetch("/api/seguir");
        if (!r.ok || !vivo) return;
        const d = (await r.json()) as { pessoas?: string[] };
        if (vivo) setSigo(Boolean(d.pessoas?.includes(nickname)));
      } catch {
        /* sem isto o botão só começa dizendo "seguir"; nada quebra */
      }
    })();

    return () => {
      vivo = false;
    };
  }, [nickname]);

  const alternarSeguir = async () => {
    if (!nickname || mexendo) return;
    setMexendo(true);
    // Otimista, e revertido se o servidor recusar: o toque precisa responder na
    // hora, e uma recusa aqui é rara (só o teto).
    const antes = sigo;
    setSigo(!antes);
    // O número acompanha o toque. Ver "Seguindo" com a contagem parada no
    // valor antigo faz a tela parecer quebrada por um segundo.
    const mexerNoNumero = (quanto: number) =>
      setPerfil((p) =>
        p && typeof p.seguidores === "number"
          ? { ...p, seguidores: Math.max(0, p.seguidores + quanto) }
          : p,
      );
    mexerNoNumero(antes ? -1 : 1);
    try {
      const r = await fetch("/api/seguir", {
        method: antes ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "pessoa", nickname }),
      });
      if (!r.ok) {
        setSigo(antes);
        mexerNoNumero(antes ? 1 : -1);
      }
    } catch {
      setSigo(antes);
      mexerNoNumero(antes ? 1 : -1);
    } finally {
      setMexendo(false);
    }
  };

  if (!nickname) return null;

  const guardado = perfil && perfil.visibilidade !== "publico";

  return (
    <div className="fixed inset-0 z-[169] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Perfil de ${nickname}`}
        className="relative w-full rounded-t-3xl bg-white/[0.08] p-5
                   pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl ring-1
                   ring-white/15 backdrop-blur-xl sm:w-[min(92vw,24rem)] sm:rounded-3xl"
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
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

        <div className="flex flex-col items-center text-center">
          <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-400/80 to-blue-600/80 text-3xl font-semibold text-white">
            {perfil?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={perfil.avatarUrl}
                alt={`Foto de ${nickname}`}
                className="h-full w-full object-cover"
              />
            ) : (
              nickname.charAt(0).toUpperCase()
            )}
          </span>

          <p className="mt-3 text-lg font-semibold text-white">@{nickname}</p>

          {perfil?.fullName && (
            <p className="text-sm text-white/70">{perfil.fullName}</p>
          )}

          {(perfil?.idade || perfil?.lugar) && (
            <p className="mt-0.5 text-xs text-white/45">
              {[perfil.idade ? `${perfil.idade} anos` : null, perfil.lugar]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/*
            QUANTAS PESSOAS SEGUEM — o número, e só ele. Quem são elas não sai
            de lugar nenhum, e não há rota que responda isso: saber que alguém
            tem 40 seguidores não diz nada sobre ninguém; saber QUEM são os 40
            diz sobre os 40.
          */}
          {typeof perfil?.seguidores === "number" && (
            <p className="mt-1.5 text-xs text-white/55">
              <strong className="font-semibold text-white/80">
                {perfil.seguidores}
              </strong>{" "}
              {perfil.seguidores === 1 ? "seguidor" : "seguidores"}
            </p>
          )}

          {perfil?.descricao && (
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75">
              {perfil.descricao}
            </p>
          )}

          {carregando && (
            <p className="mt-3 text-xs text-white/30">carregando…</p>
          )}

          {semPerfil && (
            <p className="mt-3 text-xs text-white/40">
              Não consegui carregar este perfil agora.
            </p>
          )}

          {/*
            O RECADO SOBRE O QUE ESTÁ GUARDADO aparece, em vez de a tela
            simplesmente parecer vazia. "Esta pessoa mostra pouco" é uma
            informação sobre ela; um cartão em branco parece defeito do
            aplicativo.
          */}
          {guardado && !carregando && (
            <p className="mt-3 text-xs text-white/35">
              {perfil.visibilidade === "privado"
                ? "Esta pessoa mantém o perfil privado."
                : "Esta pessoa mostra só a foto e o nickname."}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onConversar(nickname)}
            className="flex-1 rounded-xl bg-cyan-600 py-3 font-semibold text-white hover:bg-cyan-500"
          >
            Conversar
          </button>
          <button
            type="button"
            onClick={() => void alternarSeguir()}
            title={
              sigo
                ? "Deixar de ver o que esta pessoa publica"
                : "Ver no seu mural o que esta pessoa publicar"
            }
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
              sigo
                ? "bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
          >
            {sigo ? "Seguindo" : "Seguir"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PerfilDeOutroPanel;
