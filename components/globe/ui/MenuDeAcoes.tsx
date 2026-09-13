"use client";

import React, { FC, ReactNode, useCallback, useEffect, useState } from "react";

/**
 * O menu — e os atalhos que cada pessoa escolhe deixar na tela.
 *
 * POR QUE ELE EXISTE. A coluna da direita tinha dez botões empilhados, um
 * embaixo do outro, cada um com um ícone de estilo próprio. Dez botões não são
 * dez escolhas: são uma parede que a pessoa aprende a ignorar. E o globo — que
 * é o produto — ficava espiando por entre eles.
 *
 * A TELA AGORA COMEÇA VAZIA, de propósito. Só o menu, e o que a própria pessoa
 * fixou. Quem usa a lupa todo dia fixa a lupa; quem nunca viaja não vê o botão
 * de bagagem nunca mais. É o mesmo princípio do menu do celular: o aparelho não
 * decide o que fica na primeira tela.
 *
 * O ALFINETE É O GESTO INTEIRO. Tocar no ladrilho executa; tocar no alfinete
 * fixa ou solta. Dois alvos no mesmo cartão, e nenhum modo escondido — sem
 * "segure para editar", que é a coisa que ninguém descobre sozinho.
 *
 * A ESCOLHA MORA NO APARELHO (localStorage), e não na conta. Fixar é sobre a
 * mão que segura o telefone, não sobre quem você é: a mesma pessoa no celular e
 * no computador quer atalhos diferentes, porque os gestos são diferentes.
 */

export interface Acao {
  id: string;
  rotulo: string;
  /** Uma linha do que acontece ao tocar. Aparece no menu, não no atalho. */
  descricao?: string;
  icone: ReactNode;
  /** Cor de acento do ladrilho e do atalho. */
  cor: string;
  desativado?: boolean;
  /** Um número no canto — conversas não lidas, por exemplo. */
  contador?: number;
  onSelecionar: () => void;
}

interface Props {
  acoes: Acao[];
  visivel: boolean;
  /** Some com tudo enquanto outro painel está aberto. */
  bloqueado?: boolean;
}

const CHAVE = "globoAtalhos:v1";

/**
 * Quantos atalhos cabem na tela.
 *
 * Seis é o que sobra ao lado do globo num celular sem a coluna voltar a ser a
 * parede que o menu veio desfazer. Passando disso, o botão de fixar recusa e
 * diz o porquê — em vez de aceitar e deixar a tela pior sem avisar.
 */
const ATALHOS_MAX = 6;

function lerAtalhos(): string[] {
  try {
    const cru = localStorage.getItem(CHAVE);
    const lista: unknown = cru ? JSON.parse(cru) : [];
    return Array.isArray(lista)
      ? lista.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

const MenuDeAcoes: FC<Props> = ({ acoes, visivel, bloqueado }) => {
  const [aberto, setAberto] = useState(false);
  const [atalhos, setAtalhos] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * A entrada só começa depois do primeiro quadro.
   *
   * Sem este atraso de um quadro, o navegador pinta o estado final direto e a
   * animação simplesmente não acontece — o elemento nasce já no lugar, e não há
   * transição entre dois valores.
   */
  const [entrou, setEntrou] = useState(false);

  useEffect(() => {
    setAtalhos(lerAtalhos());
  }, []);

  useEffect(() => {
    if (!aberto) {
      setEntrou(false);
      return;
    }
    const t = requestAnimationFrame(() => setEntrou(true));
    return () => cancelAnimationFrame(t);
  }, [aberto]);

  // Esc fecha. É o que qualquer pessoa de teclado tenta primeiro.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const alternarAtalho = useCallback((id: string) => {
    setAtalhos((atuais) => {
      const tem = atuais.includes(id);
      if (!tem && atuais.length >= ATALHOS_MAX) {
        setAviso(
          `A tela comporta ${ATALHOS_MAX} atalhos. Solte um para fixar outro.`,
        );
        return atuais;
      }
      setAviso(null);
      const novos = tem ? atuais.filter((x) => x !== id) : [...atuais, id];
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novos));
      } catch {
        /* sem localStorage os atalhos valem só até recarregar; nada quebra */
      }
      return novos;
    });
  }, []);

  const fixadas = atalhos
    .map((id) => acoes.find((a) => a.id === id))
    .filter((a): a is Acao => Boolean(a));

  return (
    <>
      {/* ---------------------------------------------------------------
          Os atalhos na tela, de baixo para cima, e o menu por último.
          Ancorados embaixo porque é onde o polegar alcança.
      --------------------------------------------------------------- */}
      <div
        className={`pointer-events-none absolute bottom-[4.5rem] right-4 z-40 flex flex-col-reverse items-end gap-3 transition-opacity duration-300 ${
          visivel ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={() => setAberto(true)}
          disabled={bloqueado}
          title="Tudo o que dá para fazer"
          aria-label="Abrir o menu"
          className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full
                      bg-slate-900/80 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-xl
                      transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 ${
                        visivel ? "" : "pointer-events-none"
                      }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="6" cy="6" r="2" />
            <circle cx="12" cy="6" r="2" />
            <circle cx="18" cy="6" r="2" />
            <circle cx="6" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="18" cy="12" r="2" />
            <circle cx="6" cy="18" r="2" />
            <circle cx="12" cy="18" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
        </button>

        {fixadas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={a.onSelecionar}
            disabled={bloqueado || a.desativado}
            title={a.rotulo}
            aria-label={a.rotulo}
            className={`pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full
                        text-white shadow-lg ring-1 ring-white/15 backdrop-blur-xl
                        transition-transform hover:scale-105 active:scale-95
                        disabled:opacity-40 ${visivel ? "" : "pointer-events-none"}`}
            style={{ background: `${a.cor}d9` }}
          >
            {a.icone}
            {typeof a.contador === "number" && a.contador > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-slate-950">
                {a.contador > 99 ? "99+" : a.contador}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------
          O menu
      --------------------------------------------------------------- */}
      {aberto && (
        <div className="pointer-events-auto fixed inset-0 z-[175] flex items-end justify-center sm:items-center">
          <div
            className={`absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity duration-300 ${
              entrou ? "opacity-100" : "opacity-0"
            }`}
            onClick={() => setAberto(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className={`relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] p-5
                        pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-white/15
                        transition-all duration-300 ease-out
                        sm:w-[min(94vw,34rem)] sm:rounded-[28px]
                        ${entrou ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
            style={{
              background:
                "linear-gradient(160deg, rgb(20 27 45 / 0.97), rgb(10 14 24 / 0.97))",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-semibold text-white">
                  Tudo o que dá para fazer
                </h2>
                <p className="mt-0.5 text-[11px] text-white/45">
                  Toque no alfinete para deixar um atalho na tela.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="shrink-0 rounded-full p-1.5 text-white/45 hover:bg-white/10 hover:text-white"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {aviso && (
              <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200/80">
                {aviso}
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {acoes.map((a, i) => {
                const fixado = atalhos.includes(a.id);
                return (
                  <div
                    key={a.id}
                    className={`relative transition-all duration-300 ease-out ${
                      entrou
                        ? "translate-y-0 opacity-100"
                        : "translate-y-3 opacity-0"
                    }`}
                    /*
                     * A ENTRADA EM CASCATA é o que faz o menu parecer que
                     * chegou, em vez de aparecer. Vinte e cinco milissegundos
                     * por ladrilho: o bastante para o olho ler a ordem, curto o
                     * bastante para ninguém esperar.
                     */
                    style={{ transitionDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (a.desativado) return;
                        setAberto(false);
                        a.onSelecionar();
                      }}
                      disabled={a.desativado}
                      className="flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-3.5
                                 ring-1 ring-white/[0.07] transition-colors
                                 hover:bg-white/[0.06] active:bg-white/10
                                 disabled:opacity-35 disabled:hover:bg-transparent"
                    >
                      <span
                        className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                        style={{
                          background: `${a.cor}2e`,
                          boxShadow: `0 6px 20px -8px ${a.cor}`,
                        }}
                      >
                        {a.icone}
                        {typeof a.contador === "number" && a.contador > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-slate-900">
                            {a.contador > 99 ? "99+" : a.contador}
                          </span>
                        )}
                      </span>
                      <span className="text-center text-[11px] font-medium leading-tight text-white/80">
                        {a.rotulo}
                      </span>
                    </button>

                    {/* O alfinete. Alvo próprio, fora do botão que executa. */}
                    <button
                      type="button"
                      onClick={() => alternarAtalho(a.id)}
                      title={fixado ? "Tirar da tela" : "Deixar na tela"}
                      aria-label={
                        fixado
                          ? `Tirar ${a.rotulo} da tela`
                          : `Deixar ${a.rotulo} na tela`
                      }
                      aria-pressed={fixado}
                      className={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full
                                  transition-all active:scale-90 ${
                                    fixado
                                      ? "text-amber-300"
                                      : "text-white/20 hover:text-white/55"
                                  }`}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill={fixado ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.9"
                      >
                        <path
                          d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z"
                          strokeLinejoin="round"
                        />
                        <path d="M12 15v5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-center text-[11px] text-white/30">
              {fixadas.length === 0
                ? "Nenhum atalho na tela — o globo fica inteiro para você."
                : `${fixadas.length} de ${ATALHOS_MAX} atalhos na tela`}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default MenuDeAcoes;
