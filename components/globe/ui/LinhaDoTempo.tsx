"use client";

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { subirMidia, urlDaMidia } from "@/lib/chat/midiaRemota";

/**
 * A linha do tempo — e o gesto que só existe porque há um globo atrás dela.
 *
 * O FEED VERTICAL NÃO É A NOVIDADE. Uma publicação por tela, rolagem com
 * encaixe, vídeo que toca sozinho: isso o Instagram, o TikTok e o Kwai fazem, e
 * fazem bem. Copiar essa parte é só respeitar o que as pessoas já sabem usar.
 *
 * A NOVIDADE É O BOTÃO "VER NO GLOBO". Ele recolhe a linha do tempo numa FAIXA
 * COLORIDA à direita e joga o globo no lugar da publicação. A partir daí o feed
 * vira um índice — cada segmento é um post, e tocar num deles viaja o globo até
 * lá sem sair do lugar. É a única coisa aqui que nenhum dos três pode copiar
 * sem antes ter um globo e sem que cada post nasça com coordenada.
 *
 * A COR DA FAIXA VEM DO PAÍS, e não do acaso. Posts do mesmo lugar ficam com o
 * mesmo tom, então a faixa lida de relance já diz "tem três do Japão aqui e um
 * do Peru" — o que transforma uma barra de rolagem num mapa do que se está
 * vendo. Com cor aleatória seria enfeite.
 *
 * O QUE NÃO EXISTE AQUI: curtida, comentário, contador de visualização. O feed
 * leva a dois lugares — a conversa e o globo —, e qualquer número no meio do
 * caminho viraria o objetivo.
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
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  criadoEm: string;
  expiraEm: string;
  porque?: "lugar" | "pessoa" | "mundo";
}

interface LugarSeguido {
  tipo: "pais" | "estado" | "cidade";
  valor: string;
  pais: string | null;
}

interface OQueSigo {
  lugares: LugarSeguido[];
  pessoas: string[];
  limites: { lugares: number; pessoas: number };
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onVerPerfil: (nickname: string) => void;
  onConversar: (nickname: string) => void;
  meuNickname?: string | null;
  /** Leva o globo até o post. Chamado ao minimizar e a cada troca na faixa. */
  onFocarNoGlobo: (lat: number, lon: number, rotulo: string) => void;
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

/**
 * A cor de um lugar.
 *
 * FNV-1a sobre o nome do país, reduzido a um matiz. Estável (o mesmo país dá
 * sempre o mesmo tom, hoje e amanhã) e sem significado geográfico — não é um
 * mapa político, é só um jeito de o olho agrupar.
 *
 * A saturação e a luminosidade são fixas de propósito: variar as três faria
 * alguns lugares gritarem mais que outros, e o país de ninguém deve parecer
 * mais importante na faixa.
 */
function corDoLugar(pais: string | null): string {
  if (!pais) return "hsl(210 12% 45%)";
  let h = 0x811c9dc5;
  for (let i = 0; i < pais.length; i++) {
    h ^= pais.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `hsl(${(h >>> 0) % 360} 70% 58%)`;
}

/** "faltam 3 h" — o prazo é a informação mais útil que um post carrega aqui. */
function tempoQueResta(expiraEm: string): string {
  const ms = Date.parse(expiraEm) - Date.now();
  if (ms <= 0) return "sumindo";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60)} h`;
}

// ---------------------------------------------------------------------------
// Uma publicação, ocupando a tela
// ---------------------------------------------------------------------------

/**
 * A mídia de um post, carregada só quando chega perto.
 *
 * O VÍDEO TOCA SOZINHO E PARA AO SAIR DA TELA — sem isso, rolar cinco posts
 * deixaria cinco vídeos tocando ao mesmo tempo, cada um baixando. É o defeito
 * clássico de feed vertical feito à mão.
 *
 * MUDO POR PADRÃO, e não por timidez: navegador nenhum deixa um vídeo com som
 * tocar sozinho, e insistir nisso faria o vídeo simplesmente não começar.
 */
const MidiaDoPost: FC<{
  post: Post;
  visivel: boolean;
  perto: boolean;
}> = ({ post, visivel, perto }) => {
  const [url, setUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!perto || url || !post.midiaChave) return;
    let vivo = true;
    void urlDaMidia(post.midiaChave).then((u) => {
      if (vivo) setUrl(u);
    });
    return () => {
      vivo = false;
    };
  }, [perto, url, post.midiaChave]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (visivel) void v.play().catch(() => undefined);
    else v.pause();
  }, [visivel, url]);

  if (post.kind === "texto" || !post.midiaChave) {
    /*
     * POST DE TEXTO TAMBÉM OCUPA A TELA INTEIRA, num fundo tirado da cor do
     * lugar. A alternativa seria mostrá-lo como um cartãozinho no meio do
     * escuro, e aí o feed teria dois ritmos — um para foto e outro para texto —
     * e rolar ficaria irregular.
     */
    const cor = corDoLugar(post.pais);
    return (
      <div
        className="flex h-full w-full items-center justify-center p-8"
        style={{
          background: `linear-gradient(160deg, ${cor}22, #0b1220 60%)`,
        }}
      >
        <p className="max-w-md text-center text-2xl font-medium leading-snug text-white/90 sm:text-3xl">
          {post.body}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      {url && post.kind === "video" && (
        <video
          ref={videoRef}
          src={url}
          loop
          muted
          playsInline
          className="h-full w-full object-contain"
        />
      )}
      {url && post.kind === "imagem" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Publicação de ${post.autor}`}
          className="h-full w-full object-contain"
        />
      )}
      {!url && (
        <div
          className="h-full w-full"
          style={{
            background: `linear-gradient(160deg, ${corDoLugar(post.pais)}22, #0b1220 60%)`,
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// A tela inteira
// ---------------------------------------------------------------------------

const LinhaDoTempo: FC<Props> = ({
  aberto,
  onFechar,
  onVerPerfil,
  onConversar,
  meuNickname,
  onFocarNoGlobo,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aba, setAba] = useState<"seguindo" | "mundo">("seguindo");
  const [sigo, setSigo] = useState<OQueSigo | null>(null);

  /** Qual post está na tela agora. Índice, porque a faixa precisa dele. */
  const [atual, setAtual] = useState(0);

  /**
   * MINIMIZADO É O ESTADO INTERESSANTE. A linha do tempo vira uma faixa à
   * direita e o globo aparece atrás, focado no lugar da publicação.
   */
  const [minimizado, setMinimizado] = useState(false);

  const [compondo, setCompondo] = useState(false);
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const [denunciando, setDenunciando] = useState<Post | null>(null);
  const [menuDoPost, setMenuDoPost] = useState<Post | null>(null);

  const rolagemRef = useRef<HTMLDivElement | null>(null);

  // --- Carregar --------------------------------------------------------------

  const carregar = useCallback(async (qual: "seguindo" | "mundo") => {
    setCarregando(true);
    try {
      const r = await fetch(
        qual === "seguindo" ? "/api/posts?de=seguindo" : "/api/posts",
      );
      if (!r.ok) {
        setAviso("Não consegui carregar agora.");
        return;
      }
      const d = (await r.json()) as { posts: Post[] };
      setPosts(d.posts);
      setAtual(0);
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const lerSigo = useCallback(async () => {
    try {
      const r = await fetch("/api/seguir");
      if (r.ok) setSigo((await r.json()) as OQueSigo);
    } catch {
      /* os botões só ficam sem o estado "seguindo"; nada quebra */
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setAviso(null);
    setMinimizado(false);
    void carregar(aba);
    void lerSigo();
  }, [aberto, aba, carregar, lerSigo]);

  /**
   * Quem está na tela.
   *
   * OBSERVADOR, E NÃO CÁLCULO DE `scrollTop`. Com encaixe de rolagem o valor
   * intermediário é ruído, e ler a posição a cada quadro faria o vídeo pausar e
   * voltar no meio do gesto.
   */
  useEffect(() => {
    const caixa = rolagemRef.current;
    if (!caixa || minimizado || posts.length === 0) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting || e.intersectionRatio < 0.6) continue;
          const i = Number((e.target as HTMLElement).dataset.indice);
          if (!Number.isNaN(i)) setAtual(i);
        }
      },
      { root: caixa, threshold: [0.6] },
    );

    for (const filho of caixa.querySelectorAll("[data-indice]")) {
      observador.observe(filho);
    }
    return () => observador.disconnect();
  }, [posts, minimizado]);

  const postAtual = posts[atual] ?? null;

  // --- Minimizar e viajar ----------------------------------------------------

  const irParaOGlobo = useCallback(
    (post: Post) => {
      setMinimizado(true);
      setMenuDoPost(null);
      onFocarNoGlobo(post.lat, post.lon, post.lugar ?? post.pais ?? "aqui");
    },
    [onFocarNoGlobo],
  );

  const escolherNaFaixa = useCallback(
    (i: number) => {
      const p = posts[i];
      if (!p) return;
      setAtual(i);
      onFocarNoGlobo(p.lat, p.lon, p.lugar ?? p.pais ?? "aqui");
    },
    [posts, onFocarNoGlobo],
  );

  const voltarDoGlobo = useCallback(() => {
    setMinimizado(false);
    // Devolve a rolagem ao post de onde se saiu. Sem isto, voltar cairia no
    // topo e a pessoa perderia o lugar na fila.
    requestAnimationFrame(() => {
      const alvo = rolagemRef.current?.querySelector(
        `[data-indice="${atual}"]`,
      ) as HTMLElement | null;
      alvo?.scrollIntoView({ block: "start" });
    });
  }, [atual]);

  // --- Ações -----------------------------------------------------------------

  const mudarSeguir = async (
    alvo:
      | { tipo: "pessoa"; nickname: string }
      | {
          tipo: "lugar";
          camada: LugarSeguido["tipo"];
          valor: string;
          pais: string | null;
        },
    seguir: boolean,
  ) => {
    setMenuDoPost(null);
    try {
      const r = await fetch("/api/seguir", {
        method: seguir ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(alvo),
      });
      const d = (await r.json().catch(() => ({}))) as { message?: string };
      if (!r.ok) {
        setAviso(d.message ?? "Não consegui fazer isso agora.");
        return;
      }
      await lerSigo();
    } catch {
      setAviso("Sem conexão agora.");
    }
  };

  const sigoPessoa = (nick: string) => Boolean(sigo?.pessoas.includes(nick));
  const sigoLugar = (camada: LugarSeguido["tipo"], valor: string | null) =>
    Boolean(
      valor &&
      sigo?.lugares.some((l) => l.tipo === camada && l.valor === valor),
    );

  const publicar = async () => {
    if (enviando || (!texto.trim() && !arquivo)) return;
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
        if (d.reason === "sem-nickname") {
          setAviso(
            "Escolha um nome público antes de publicar — é ele que assina.",
          );
        } else if (d.reason === "sem-lugar") {
          setAviso(
            "Diga onde você está: a publicação nasce nesse lugar do globo.",
          );
        } else {
          setAviso("Não consegui publicar agora.");
        }
        return;
      }

      if (d.post) {
        setPosts((atuais) => [d.post!, ...atuais]);
        setAtual(0);
        rolagemRef.current?.scrollTo({ top: 0 });
      }
      setTexto("");
      setArquivo(null);
      if (arquivoRef.current) arquivoRef.current.value = "";
      setCompondo(false);
    } catch {
      setAviso("Sem conexão agora.");
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (post: Post) => {
    setMenuDoPost(null);
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
    setAviso(
      d.saiuDoAr
        ? "Denúncia registrada. Esta publicação saiu do ar e vai ser revisada."
        : "Denúncia registrada. Obrigado — alguém vai olhar.",
    );
    setPosts((atuais) => atuais.filter((p) => p.id !== post.id));
  };

  /** As cores da faixa, uma por post. Calculadas uma vez por lista. */
  const cores = useMemo(() => posts.map((p) => corDoLugar(p.pais)), [posts]);

  if (!aberto) return null;

  // -------------------------------------------------------------------------
  // MINIMIZADO: a faixa à direita, o globo atrás
  // -------------------------------------------------------------------------

  if (minimizado) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[168]">
        {/* A faixa. Cada segmento é uma publicação; a cor é do país. */}
        <div className="pointer-events-auto absolute right-0 top-0 flex h-full w-9 flex-col gap-[2px] py-2 pr-1.5">
          {posts.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => escolherNaFaixa(i)}
              title={p.lugar ?? p.pais ?? ""}
              aria-label={`Ver ${p.lugar ?? "esta publicação"} no globo`}
              className="group relative min-h-[8px] flex-1 rounded-full transition-all"
              style={{
                background: cores[i],
                opacity: i === atual ? 1 : 0.38,
                transform: i === atual ? "scaleX(1)" : "scaleX(0.55)",
              }}
            />
          ))}
        </div>

        {/* O cartão do lugar focado. */}
        {postAtual && (
          <div className="pointer-events-auto absolute bottom-4 left-4 right-14 rounded-2xl bg-slate-950/80 p-3 ring-1 ring-white/15 backdrop-blur-xl sm:right-auto sm:w-80">
            <div className="flex items-center gap-2">
              <span
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ background: cores[atual] }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white">
                  {postAtual.lugar ?? postAtual.pais ?? "Em algum lugar"}
                </p>
                <button
                  type="button"
                  onClick={() => onVerPerfil(postAtual.autor)}
                  className="truncate text-[11px] text-white/50 hover:text-white/80"
                >
                  publicado por @{postAtual.autor}
                </button>
              </div>

              {/* Sair fica AQUI, e nao flutuando no topo: la' ele encostava no
                  menu do cabecalho, e dois alvos colados viram um so'. */}
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar a linha do tempo"
                className="shrink-0 rounded-full p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {postAtual.body && (
              <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-white/65">
                {postAtual.body}
              </p>
            )}

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={voltarDoGlobo}
                className="flex-1 rounded-lg bg-white/10 py-2 text-[12px] font-medium text-white/85 hover:bg-white/20"
              >
                Voltar à publicação
              </button>
              {postAtual.pais && (
                <button
                  type="button"
                  onClick={() =>
                    void mudarSeguir(
                      {
                        tipo: "lugar",
                        camada: "pais",
                        valor: postAtual.pais!,
                        pais: null,
                      },
                      !sigoLugar("pais", postAtual.pais),
                    )
                  }
                  className={`rounded-lg px-3 py-2 text-[12px] font-medium ${
                    sigoLugar("pais", postAtual.pais)
                      ? "bg-cyan-500/20 text-cyan-200"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  {sigoLugar("pais", postAtual.pais) ? "Seguindo" : "Seguir"}{" "}
                  {postAtual.pais}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // ABERTO: uma publicação por tela
  // -------------------------------------------------------------------------

  /*
   * `pointer-events-auto` NO ABERTO E `none` NO MINIMIZADO — e a diferença é o
   * produto inteiro.
   *
   * O contêiner que hospeda os painéis do globo é `pointer-events-none`, para o
   * globo continuar recebendo arrasto por baixo deles; cada painel reativa o
   * toque para si. Sem esta linha, o feed ocupa a tela inteira e TODO clique o
   * atravessa — os botões respondem visualmente e não fazem nada, que foi
   * exatamente o que aconteceu na primeira versão.
   *
   * No minimizado o padrão se inverte de propósito: ali quem a pessoa está
   * olhando é o globo, e só a faixa e o cartão continuam clicáveis.
   */
  return (
    <div className="pointer-events-auto fixed inset-0 z-[168] bg-slate-950">
      <div
        ref={rolagemRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {posts.map((post, i) => {
          const meu = meuNickname && post.autor === meuNickname;
          return (
            <section
              key={post.id}
              data-indice={i}
              className="relative h-full w-full snap-start snap-always"
            >
              <MidiaDoPost
                post={post}
                visivel={i === atual}
                perto={Math.abs(i - atual) <= 1}
              />

              {/* O véu só embaixo: o texto precisa de contraste, a foto não
                  precisa de sombra em cima dela inteira. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 to-transparent" />

              {/* Quem publicou, e de onde. */}
              <div className="absolute inset-x-0 bottom-0 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onVerPerfil(post.autor)}
                      className="flex items-center gap-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-400/80 to-blue-600/80 text-xs font-semibold text-white">
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
                      <span className="truncate text-[15px] font-semibold text-white">
                        @{post.autor}
                      </span>
                    </button>

                    {post.body && post.kind !== "texto" && (
                      <p className="mt-2 line-clamp-3 text-[14px] leading-snug text-white/85">
                        {post.body}
                      </p>
                    )}

                    <p className="mt-2 text-[11px] text-white/45">
                      some em {tempoQueResta(post.expiraEm)}
                      {post.porque === "mundo" && " · do mundo"}
                    </p>
                  </div>

                  {/* A coluna de ações, à direita, como as pessoas já esperam. */}
                  <div className="flex shrink-0 flex-col items-center gap-3">
                    {/*
                      O BOTÃO QUE JUSTIFICA O APLICATIVO. Recolhe a linha do
                      tempo e joga o globo no lugar da publicação.
                    */}
                    <button
                      type="button"
                      onClick={() => irParaOGlobo(post)}
                      aria-label="Ver este lugar no globo"
                      className="flex flex-col items-center gap-1"
                    >
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-white/25"
                        style={{ background: `${corDoLugar(post.pais)}33` }}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          className="text-white"
                        >
                          <circle cx="12" cy="12" r="9" />
                          <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
                        </svg>
                      </span>
                      <span className="max-w-[4.5rem] truncate text-[10px] text-white/70">
                        {post.cidade ?? post.pais ?? "no globo"}
                      </span>
                    </button>

                    {!meu && (
                      <button
                        type="button"
                        onClick={() => onConversar(post.autor)}
                        aria-label="Conversar"
                        className="flex flex-col items-center gap-1"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                          <svg
                            width="21"
                            height="21"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            className="text-white"
                          >
                            <path
                              d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className="text-[10px] text-white/60">falar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setMenuDoPost(menuDoPost?.id === post.id ? null : post)
                      }
                      aria-label="Mais opções"
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="text-white"
                      >
                        <circle cx="12" cy="5" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="12" cy="19" r="1.6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          );
        })}

        {posts.length === 0 && !carregando && (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-center text-sm text-white/40">
              Ninguém publicou nas últimas 24 horas. Comece você.
            </p>
          </div>
        )}
      </div>

      {/* Topo: abas e sair. Flutuando, para não roubar altura do vídeo. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {(["seguindo", "mundo"] as const).map((qual) => (
          <button
            key={qual}
            type="button"
            onClick={() => setAba(qual)}
            className={`pointer-events-auto rounded-full px-3.5 py-1.5 text-[13px] font-semibold backdrop-blur transition-colors ${
              aba === qual
                ? "bg-white/20 text-white"
                : "bg-black/25 text-white/55 hover:text-white/85"
            }`}
          >
            {qual === "seguindo" ? "Seguindo" : "Mundo"}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setCompondo(true)}
          className="pointer-events-auto ml-auto rounded-full bg-cyan-600/90 px-3.5 py-1.5 text-[13px] font-semibold text-white backdrop-blur hover:bg-cyan-500"
        >
          Publicar
        </button>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="pointer-events-auto rounded-full bg-black/30 p-2 text-white/70 backdrop-blur hover:text-white"
        >
          <svg
            width="16"
            height="16"
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
        <p className="absolute inset-x-4 top-16 rounded-xl bg-slate-900/90 px-3 py-2 text-center text-xs text-white/80 ring-1 ring-white/15 backdrop-blur">
          {aviso}
        </p>
      )}

      {/* O menu de um post: seguir, apagar, denunciar. */}
      {menuDoPost && (
        <div className="absolute inset-0 z-10 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMenuDoPost(null)}
            aria-hidden="true"
          />
          <div className="relative w-full rounded-t-3xl bg-slate-900/95 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-white/15 sm:w-[min(92vw,22rem)] sm:rounded-3xl">
            {meuNickname && menuDoPost.autor === meuNickname ? (
              <button
                type="button"
                onClick={() => void apagar(menuDoPost)}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-red-300/90 hover:bg-white/10"
              >
                Apagar esta publicação
              </button>
            ) : (
              <>
                {[
                  {
                    rotulo: `Seguir @${menuDoPost.autor}`,
                    ja: sigoPessoa(menuDoPost.autor),
                    acao: {
                      tipo: "pessoa" as const,
                      nickname: menuDoPost.autor,
                    },
                  },
                  ...(menuDoPost.cidade
                    ? [
                        {
                          rotulo: `Seguir ${menuDoPost.cidade}`,
                          ja: sigoLugar("cidade", menuDoPost.cidade),
                          acao: {
                            tipo: "lugar" as const,
                            camada: "cidade" as const,
                            valor: menuDoPost.cidade,
                            pais: menuDoPost.pais,
                          },
                        },
                      ]
                    : []),
                  ...(menuDoPost.pais
                    ? [
                        {
                          rotulo: `Seguir ${menuDoPost.pais}`,
                          ja: sigoLugar("pais", menuDoPost.pais),
                          acao: {
                            tipo: "lugar" as const,
                            camada: "pais" as const,
                            valor: menuDoPost.pais,
                            pais: null,
                          },
                        },
                      ]
                    : []),
                ].map((op) => (
                  <button
                    key={op.rotulo}
                    type="button"
                    onClick={() => void mudarSeguir(op.acao, !op.ja)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/10 ${
                      op.ja ? "text-cyan-300/90" : "text-white/85"
                    }`}
                  >
                    <span className="truncate">{op.rotulo}</span>
                    {op.ja && (
                      <span className="ml-2 shrink-0 text-[11px] text-white/35">
                        seguindo · toque para largar
                      </span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setDenunciando(menuDoPost);
                    setMenuDoPost(null);
                  }}
                  className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm text-white/45 hover:bg-white/10 hover:text-red-300"
                >
                  Denunciar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Publicar */}
      {compondo && (
        <div className="absolute inset-0 z-20 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setCompondo(false)}
            aria-hidden="true"
          />
          <div className="relative w-full rounded-t-3xl bg-slate-900/95 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-white/15 sm:w-[min(92vw,26rem)] sm:rounded-3xl">
            <p className="text-[11px] text-white/45">
              Some em 24 horas, e nasce no lugar onde você está no globo.
            </p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
              placeholder="O que está acontecendo aí?"
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl bg-white/10 px-3 py-2 text-[15px] text-white placeholder-white/35 outline-none ring-1 ring-white/10 focus:ring-cyan-400/40"
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
                id="linha-arquivo"
              />
              <label
                htmlFor="linha-arquivo"
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
                className="ml-auto rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
              >
                {enviando ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Denunciar */}
      {denunciando && (
        <div className="absolute inset-0 z-20 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setDenunciando(null)}
            aria-hidden="true"
          />
          <div className="relative w-full rounded-t-3xl bg-slate-900/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-white/15 sm:w-[min(92vw,22rem)] sm:rounded-3xl">
            <p className="text-sm font-semibold text-white">
              Por que esta publicação não deveria estar aqui?
            </p>
            <p className="mt-1 text-[11px] text-white/45">
              Denúncias de pessoas diferentes tiram do ar até alguém revisar.
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

export default LinhaDoTempo;
