"use client";

import React, { FC, useCallback, useEffect, useRef, useState } from "react";

import { subirMidia, urlDaMidia } from "@/lib/chat/midiaRemota";
import { prepararMidia, VIDEO_SEG_MAX } from "@/lib/midia/comprimir";

/**
 * As notícias da região — escritas por quem mora nela.
 *
 * O QUE ESTA TELA SUBSTITUIU. Havia uma tela de "Notícias Dinâmicas" que lia um
 * arquivo estático do próprio projeto: as mesmas manchetes para todo mundo,
 * escritas por ninguém, iguais ontem e amanhã. Parecia um produto e era uma
 * demonstração — e uma demonstração que fica no lugar do produto é pior do que
 * um espaço vazio, porque ninguém procura o que já parece existir.
 *
 * QUEM ESCREVE É QUEM MORA. A notícia nasce no lugar do autor e ele declara ATÉ
 * ONDE ela interessa: a cidade, o estado ou o país. Um alagamento numa rua não
 * precisa chegar ao outro lado do país, e uma eleição não pode ficar presa num
 * bairro — e só quem escreveu sabe a diferença.
 *
 * NÃO TEM CURTIDA NEM VISUALIZAÇÃO, pelo mesmo motivo do mural: notícia medida
 * por número vira notícia escrita para o número, e o primeiro a sofrer com isso
 * é o título.
 */

const ASSUNTOS: { valor: string; rotulo: string; cor: string }[] = [
  { valor: "urgente", rotulo: "Urgente", cor: "#dc2626" },
  { valor: "transito", rotulo: "Trânsito", cor: "#ea580c" },
  { valor: "tempo", rotulo: "Tempo", cor: "#0284c7" },
  { valor: "cultura", rotulo: "Cultura", cor: "#7c3aed" },
  { valor: "esporte", rotulo: "Esporte", cor: "#16a34a" },
  { valor: "economia", rotulo: "Economia", cor: "#ca8a04" },
  { valor: "outro", rotulo: "Outro", cor: "#64748b" },
];

const corDoAssunto = (v: string) =>
  ASSUNTOS.find((a) => a.valor === v)?.cor ?? "#64748b";
const rotuloDoAssunto = (v: string) =>
  ASSUNTOS.find((a) => a.valor === v)?.rotulo ?? "Outro";

const ALCANCES: { valor: "cidade" | "estado" | "pais"; rotulo: string }[] = [
  { valor: "cidade", rotulo: "Minha cidade" },
  { valor: "estado", rotulo: "Meu estado" },
  { valor: "pais", rotulo: "Meu país" },
];

const TITULO_MAX = 140;
const CORPO_MAX = 4000;

interface Noticia {
  id: string;
  autor: string;
  autorAvatar: string | null;
  titulo: string;
  corpo: string | null;
  kind: "texto" | "imagem" | "video";
  midiaChave: string | null;
  /** Um quadro do vídeo, para a lista não ficar cinza enquanto ele desce. */
  cartazChave: string | null;
  categoria: string;
  alcance: string;
  lat: number;
  lon: number;
  lugar: string | null;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  criadoEm: string;
  oculto?: boolean;
  denuncias?: number;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onVerPerfil: (nickname: string) => void;
  onVerNoGlobo: (lat: number, lon: number, rotulo: string) => void;
  meuNickname?: string | null;
  /**
   * Abrir direto na página de alguém. Nulo = as notícias que me alcançam.
   */
  paginaDe?: string | null;
}

/** "há 3 h" — numa lista de notícias, quando importa mais que a data. */
function quando(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** A mídia de uma notícia, buscada só quando o cartão chega perto da tela. */
const MidiaDaNoticia: FC<{
  chave: string;
  cartazChave?: string | null;
  kind: string;
  alt: string;
}> = ({ chave, cartazChave, kind, alt }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [cartaz, setCartaz] = useState<string | null>(null);
  const caixaRef = useRef<HTMLDivElement | null>(null);

  /* O quadro parado chega primeiro: são 30 KB contra vários megabytes. */
  useEffect(() => {
    if (!cartazChave || cartaz) return;
    let vivo = true;
    void urlDaMidia(cartazChave).then((u) => {
      if (vivo) setCartaz(u);
    });
    return () => {
      vivo = false;
    };
  }, [cartazChave, cartaz]);

  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa || url) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        obs.disconnect();
        void urlDaMidia(chave).then(setUrl);
      },
      { rootMargin: "300px" },
    );
    obs.observe(caixa);
    return () => obs.disconnect();
  }, [chave, url]);

  return (
    <div
      ref={caixaRef}
      className="mt-3 overflow-hidden rounded-xl bg-white/5"
      style={{ minHeight: url ? undefined : 150 }}
    >
      {url && kind === "video" && (
        <video
          src={url}
          poster={cartaz ?? undefined}
          controls
          playsInline
          className="max-h-72 w-full"
        />
      )}
      {url && kind === "imagem" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="max-h-72 w-full object-cover" />
      )}
    </div>
  );
};

const NoticiasPanel: FC<Props> = ({
  aberto,
  onFechar,
  onVerPerfil,
  onVerNoGlobo,
  meuNickname,
  paginaDe,
}) => {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [meuLugar, setMeuLugar] = useState<{
    pais: string | null;
    estado: string | null;
    cidade: string | null;
  } | null>(null);

  const [assunto, setAssunto] = useState<string | null>(null);
  const [termo, setTermo] = useState("");
  const [aba, setAba] = useState<"regiao" | "minhas">("regiao");

  const [escrevendo, setEscrevendo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [assuntoNovo, setAssuntoNovo] = useState("outro");
  const [alcanceNovo, setAlcanceNovo] = useState<"cidade" | "estado" | "pais">(
    "cidade",
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** De 0 a 1 enquanto o vídeo é recodificado; nulo quando não há preparo. */
  const [preparo, setPreparo] = useState<number | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const [aberta, setAberta] = useState<Noticia | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams();
      if (paginaDe) params.set("de", paginaDe);
      else if (aba === "minhas") params.set("minhas", "1");
      else {
        if (assunto) params.set("assunto", assunto);
        if (termo.trim().length >= 2) params.set("q", termo.trim());
      }

      const r = await fetch(`/api/noticias?${params.toString()}`);
      if (!r.ok) {
        setAviso("Não consegui carregar agora.");
        return;
      }
      const d = (await r.json()) as {
        noticias: Noticia[];
        meuLugar?: typeof meuLugar;
      };
      setNoticias(d.noticias ?? []);
      if (d.meuLugar) setMeuLugar(d.meuLugar);
      setAviso(null);
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setCarregando(false);
    }
  }, [aba, assunto, termo, paginaDe]);

  useEffect(() => {
    if (!aberto) return;
    void carregar();
  }, [aberto, carregar]);

  if (!aberto) return null;

  const publicar = async () => {
    if (enviando) return;
    setEnviando(true);
    setErros({});
    try {
      let midiaChave: string | null = null;
      let kind: Noticia["kind"] = "texto";

      let cartazChave: string | null = null;

      if (arquivo) {
        kind = (arquivo.type || "").startsWith("video/") ? "video" : "imagem";

        /*
         * ENCOLHER ANTES DE SUBIR — ver lib/midia/comprimir.ts. Notícia com
         * vídeo é exatamente o caso em que alguém filma com o telefone na rua e
         * tenta mandar os 200 MB que saíram de lá.
         */
        setPreparo(0);
        const pronta = await prepararMidia(arquivo, setPreparo);
        setPreparo(null);

        if (pronta.recusa === "longo-demais") {
          setErros({
            midia:
              `Este vídeo tem ${Math.round((pronta.duracaoSeg ?? 0) / 60)} min; ` +
              `o limite é ${VIDEO_SEG_MAX / 60} minutos.`,
          });
          return;
        }
        if (pronta.recusa === "nao-decodifica") {
          setErros({
            midia:
              "Este navegador não consegue abrir esse arquivo. Tente exportar como MP4.",
          });
          return;
        }

        const enviada = await subirMidia(pronta.blob, pronta.mime);
        if (!enviada) {
          setErros({
            midia: `Não consegui enviar o arquivo (${(pronta.bytesDepois / 1048576).toFixed(1)} MB).`,
          });
          return;
        }
        midiaChave = enviada.chave;

        if (pronta.cartaz) {
          const c = await subirMidia(pronta.cartaz, "image/jpeg");
          cartazChave = c?.chave ?? null;
        }
      }

      const r = await fetch("/api/noticias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titulo,
          corpo,
          kind,
          midiaChave,
          cartazChave,
          categoria: assuntoNovo,
          alcance: alcanceNovo,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        noticia?: Noticia;
        errors?: Record<string, string>;
        reason?: string;
      };

      if (!r.ok) {
        if (d.reason === "sem-lugar") {
          setErros({
            geral:
              "Diga onde você mora antes de publicar: a notícia nasce nesse lugar.",
          });
        } else if (d.reason === "sem-nickname") {
          setErros({ geral: "Escolha um nome público — é ele que assina." });
        } else {
          setErros(d.errors ?? { geral: "Não consegui publicar agora." });
        }
        return;
      }

      if (d.noticia) setNoticias((atuais) => [d.noticia!, ...atuais]);
      setTitulo("");
      setCorpo("");
      setArquivo(null);
      if (arquivoRef.current) arquivoRef.current.value = "";
      setEscrevendo(false);
    } catch {
      setErros({ geral: "Sem conexão agora." });
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (n: Noticia) => {
    const r = await fetch(`/api/noticias?id=${encodeURIComponent(n.id)}`, {
      method: "DELETE",
    });
    if (r.ok) {
      setNoticias((atuais) => atuais.filter((x) => x.id !== n.id));
      setAberta(null);
    }
  };

  const ondeEstou =
    meuLugar?.cidade ?? meuLugar?.estado ?? meuLugar?.pais ?? null;

  return (
    <div className="fixed inset-0 z-[168] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notícias da região"
        /*
          ALTURA FIXA NO CELULAR, e altura de conteúdo no computador.
          
          Medido num aparelho de 375x812: com altura de conteúdo, o cabeçalho,
          as abas, a busca e os sete assuntos comem 237px, e sobravam 151 para a
          lista — espaço para UMA notícia. A pessoa rolava uma janelinha do
          tamanho de um cartão. Com altura fixa a lista fica com uns 500px, que
          é o que ela precisa para ser uma lista.
          
          No computador sobra tela, e ali altura de conteúdo é melhor: um painel
          de 85% da altura com três notícias dentro fica com um vazio embaixo.
        */
        className="relative flex h-[85dvh] w-full flex-col rounded-t-[28px] shadow-2xl
                   ring-1 ring-white/15 sm:h-auto sm:max-h-[86dvh]
                   sm:w-[min(94vw,34rem)] sm:rounded-[28px]"
        style={{
          background:
            "linear-gradient(160deg, rgb(20 27 45 / 0.97), rgb(10 14 24 / 0.97))",
        }}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-white">
              {paginaDe ? `Notícias de @${paginaDe}` : "Notícias"}
            </h2>
            <p className="mt-0.5 text-[11px] text-white/45">
              {paginaDe
                ? "Tudo o que esta pessoa publicou."
                : ondeEstou
                  ? `Escritas por quem mora em ${ondeEstou} e por perto.`
                  : "Escritas por quem mora na região."}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
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

        {!paginaDe && (
          <>
            {/* Abas */}
            <div className="flex items-center gap-1 px-5 pt-3">
              {(["regiao", "minhas"] as const).map((qual) => (
                <button
                  key={qual}
                  type="button"
                  onClick={() => setAba(qual)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    aba === qual
                      ? "bg-white/15 text-white"
                      : "text-white/45 hover:text-white/75"
                  }`}
                >
                  {qual === "regiao" ? "Da região" : "Minhas"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEscrevendo(true)}
                className="ml-auto rounded-full bg-orange-600/90 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-orange-500"
              >
                Publicar
              </button>
            </div>

            {aba === "regiao" && (
              <div className="px-5 pt-3">
                <input
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Procurar no que já foi publicado…"
                  className="w-full rounded-xl bg-white/[0.07] px-3 py-2 text-[13px] text-white
                             placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-orange-400/40"
                />

                {/* Os assuntos. Cor por assunto, para "Urgente" saltar. */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAssunto(null)}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                      assunto === null
                        ? "bg-white/20 text-white"
                        : "bg-white/[0.06] text-white/50 hover:text-white/80"
                    }`}
                  >
                    Tudo
                  </button>
                  {ASSUNTOS.map((a) => (
                    <button
                      key={a.valor}
                      type="button"
                      onClick={() =>
                        setAssunto(assunto === a.valor ? null : a.valor)
                      }
                      className="rounded-full px-2.5 py-1 text-[11px] transition-colors"
                      style={
                        assunto === a.valor
                          ? { background: `${a.cor}33`, color: "#fff" }
                          : {
                              background: "rgb(255 255 255 / 0.06)",
                              color: "rgb(255 255 255 / 0.5)",
                            }
                      }
                    >
                      {a.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {aviso && (
          <p className="mx-5 mt-3 rounded-xl bg-white/5 px-3 py-2 text-center text-xs text-white/60">
            {aviso}
          </p>
        )}

        {/* A lista */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {noticias.length === 0 && !carregando && (
            <div className="py-12 text-center">
              <p className="text-sm text-white/40">
                {aba === "minhas"
                  ? "Você ainda não publicou nenhuma notícia."
                  : "Ninguém publicou nada por aqui ainda."}
              </p>
              {!paginaDe && (
                <button
                  type="button"
                  onClick={() => setEscrevendo(true)}
                  className="mt-3 rounded-xl bg-white/10 px-4 py-2 text-[13px] text-white/80 hover:bg-white/20"
                >
                  Seja a primeira pessoa
                </button>
              )}
            </div>
          )}

          <ul className="space-y-3">
            {noticias.map((n) => (
              <li
                key={n.id}
                className="overflow-hidden rounded-2xl bg-white/[0.05] ring-1 ring-white/[0.08]"
              >
                <button
                  type="button"
                  onClick={() => setAberta(n)}
                  className="w-full p-3.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{
                        background: `${corDoAssunto(n.categoria)}26`,
                        color: corDoAssunto(n.categoria),
                      }}
                    >
                      {rotuloDoAssunto(n.categoria)}
                    </span>
                    <span className="text-[10px] text-white/35">
                      {quando(n.criadoEm)}
                    </span>
                    {n.oculto && (
                      <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                        fora do ar
                      </span>
                    )}
                  </div>

                  <h3 className="mt-1.5 text-[15px] font-semibold leading-snug text-white">
                    {n.titulo}
                  </h3>

                  {n.corpo && (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/55">
                      {n.corpo}
                    </p>
                  )}

                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/35">
                    <span>@{n.autor}</span>
                    <span>·</span>
                    <span className="truncate">{n.lugar ?? n.pais}</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ------------------------------------------------------------------
          Uma notícia aberta
      ------------------------------------------------------------------ */}
      {aberta && (
        <div className="absolute inset-0 z-10 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-950/80"
            onClick={() => setAberta(null)}
            aria-hidden="true"
          />
          <div
            className="relative flex max-h-[90dvh] w-full flex-col overflow-y-auto rounded-t-[28px] p-5
                       pb-[max(1.5rem,env(safe-area-inset-bottom))] ring-1 ring-white/15
                       sm:w-[min(94vw,32rem)] sm:rounded-[28px]"
            style={{
              background:
                "linear-gradient(160deg, rgb(22 29 48 / 0.99), rgb(10 14 24 / 0.99))",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  background: `${corDoAssunto(aberta.categoria)}26`,
                  color: corDoAssunto(aberta.categoria),
                }}
              >
                {rotuloDoAssunto(aberta.categoria)}
              </span>
              <button
                type="button"
                onClick={() => setAberta(null)}
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

            <h2 className="mt-3 text-[20px] font-semibold leading-tight text-white">
              {aberta.titulo}
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45">
              <button
                type="button"
                onClick={() => {
                  setAberta(null);
                  onVerPerfil(aberta.autor);
                }}
                className="font-medium text-white/70 hover:underline"
              >
                @{aberta.autor}
              </button>
              <span>·</span>
              <span>{quando(aberta.criadoEm)}</span>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setAberta(null);
                  onFechar();
                  onVerNoGlobo(
                    aberta.lat,
                    aberta.lon,
                    aberta.lugar ?? aberta.pais ?? "aqui",
                  );
                }}
                className="flex items-center gap-1 text-cyan-300/80 hover:text-cyan-200"
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
                {aberta.lugar ?? aberta.pais}
              </button>
            </div>

            {aberta.midiaChave && aberta.kind !== "texto" && (
              <MidiaDaNoticia
                chave={aberta.midiaChave}
                cartazChave={aberta.cartazChave}
                kind={aberta.kind}
                alt={aberta.titulo}
              />
            )}

            {aberta.corpo && (
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-white/80">
                {aberta.corpo}
              </p>
            )}

            {meuNickname && aberta.autor === meuNickname && (
              <button
                type="button"
                onClick={() => void apagar(aberta)}
                className="mt-5 w-full rounded-xl bg-white/5 py-2.5 text-[13px] text-red-300/80 hover:bg-white/10"
              >
                Apagar esta notícia
              </button>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------
          Escrever
      ------------------------------------------------------------------ */}
      {escrevendo && (
        <div className="absolute inset-0 z-20 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-950/80"
            onClick={() => setEscrevendo(false)}
            aria-hidden="true"
          />
          <div
            className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] p-5
                       pb-[max(1.5rem,env(safe-area-inset-bottom))] ring-1 ring-white/15
                       sm:w-[min(94vw,30rem)] sm:rounded-[28px]"
            style={{
              background:
                "linear-gradient(160deg, rgb(22 29 48 / 0.99), rgb(10 14 24 / 0.99))",
            }}
          >
            <h2 className="text-[17px] font-semibold text-white">
              Publicar uma notícia
            </h2>
            <p className="mt-0.5 text-[11px] text-white/45">
              Ela fica na sua página e alcança quem você escolher. Não some.
            </p>

            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value.slice(0, TITULO_MAX))}
              placeholder="O que aconteceu?"
              className="mt-4 w-full rounded-xl bg-white/[0.07] px-3 py-2.5 text-[15px] font-medium text-white
                         placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-orange-400/40"
            />
            {erros.titulo && (
              <p className="mt-1 text-[11px] text-red-300">{erros.titulo}</p>
            )}

            <textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value.slice(0, CORPO_MAX))}
              placeholder="Conte o que você viu (opcional)"
              rows={4}
              className="mt-2 w-full resize-none rounded-xl bg-white/[0.07] px-3 py-2.5 text-[14px] text-white
                         placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-orange-400/40"
            />

            <p className="mt-4 text-[11px] font-medium text-white/50">
              Assunto
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ASSUNTOS.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  onClick={() => setAssuntoNovo(a.valor)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={
                    assuntoNovo === a.valor
                      ? { background: `${a.cor}33`, color: "#fff" }
                      : {
                          background: "rgb(255 255 255 / 0.06)",
                          color: "rgb(255 255 255 / 0.5)",
                        }
                  }
                >
                  {a.rotulo}
                </button>
              ))}
            </div>

            <p className="mt-4 text-[11px] font-medium text-white/50">
              Quem precisa ver isto?
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {ALCANCES.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  onClick={() => setAlcanceNovo(a.valor)}
                  className={`rounded-xl px-2 py-2.5 text-[12px] font-medium transition-colors ${
                    alcanceNovo === a.valor
                      ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-400/40"
                      : "bg-white/[0.06] text-white/55 hover:bg-white/10"
                  }`}
                >
                  {a.rotulo}
                </button>
              ))}
            </div>
            {erros.alcance && (
              <p className="mt-1 text-[11px] text-red-300">{erros.alcance}</p>
            )}

            {preparo !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-white/60">
                  <span>Preparando o vídeo para caber…</span>
                  <span className="tabular-nums text-white/40">
                    {Math.round(preparo * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.max(2, preparo * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {arquivo && (
              <p className="mt-3 flex items-center gap-2 text-[11px] text-white/60">
                <span className="truncate">{arquivo.name}</span>
                <span className="shrink-0 text-white/35">
                  {(arquivo.size / 1048576).toFixed(1)} MB
                </span>
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
            {erros.midia && (
              <p className="mt-1 text-[11px] text-red-300">{erros.midia}</p>
            )}
            {erros.geral && (
              <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                {erros.geral}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                className="hidden"
                id="noticia-arquivo"
              />
              <label
                htmlFor="noticia-arquivo"
                className="cursor-pointer rounded-xl bg-white/10 p-2.5 text-white/70 hover:bg-white/20"
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
                {titulo.length}/{TITULO_MAX}
              </span>
              <button
                type="button"
                onClick={() => setEscrevendo(false)}
                className="ml-auto rounded-xl px-3 py-2 text-[13px] text-white/50 hover:text-white/80"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void publicar()}
                disabled={enviando || !titulo.trim()}
                className="rounded-xl bg-orange-600 px-4 py-2 text-[13px] font-semibold text-white
                           hover:bg-orange-500 disabled:bg-white/10 disabled:text-white/30"
              >
                {enviando ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoticiasPanel;
