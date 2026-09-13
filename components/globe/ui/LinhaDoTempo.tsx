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
import { prepararMidia, VIDEO_SEG_MAX } from "@/lib/midia/comprimir";

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
  /** Um quadro do vídeo, para o cartão do globo ter o que mostrar na hora. */
  cartazChave: string | null;
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

/**
 * A cor de um instante na linha do tempo.
 *
 * A FAIXA É UMA LINHA DO TEMPO, então o que ela deve codificar é TEMPO. O topo
 * é o agora; descendo, vai-se para trás. A cor acompanha esse caminho: esmeralda
 * no presente, violeta no passado, com todos os tons do meio no meio.
 *
 * POR QUE ESTAS DUAS CORES. Elas são quase opostas no círculo, então a
 * passagem entre uma e outra atravessa muito matiz — e é isso que dá ao olho a
 * sensação de percurso, e não de duas categorias. Um degradê entre cores
 * vizinhas pareceria só uma cor mal impressa.
 *
 * O QUE ERA ANTES: a cor do país. Ela contava algo verdadeiro, mas contava no
 * eixo errado — numa barra vertical ordenada por tempo, cor que pula sem ordem
 * vira ruído. O país não se perdeu: ele voltou como o brilho de quem está
 * selecionado e como a marca no cartão, que é onde há espaço para lê-lo.
 *
 * A ORIENTAÇÃO É A DE UM RIO, e não a de uma lista: o PASSADO fica em cima, o
 * FUTURO embaixo, e o presente no meio — porque é o meio que a pessoa está
 * olhando. A faixa desliza para manter o agora centrado, então o gesto de
 * escolher outra publicação é o de mover o tempo, e não o de rolar uma barra.
 *
 * `t` vai de 0 (o mais antigo, no alto) a 1 (o mais recente, embaixo).
 */
function corDoTempo(t: number, viva: boolean): string {
  const p = Math.max(0, Math.min(1, t));
  // 278° é o violeta do passado; 152° o esmeralda de onde o tempo vem. O
  // caminho entre eles atravessa azul e ciano, e é essa travessia que dá ao
  // olho a sensação de percurso em vez de duas categorias.
  const matiz = 278 - p * 126;
  // O que está perto do agora é mais claro e mais saturado; o passado vai
  // apagando, que é o que a memória faz.
  const luz = viva ? 66 : 50 - (1 - p) * 14;
  const sat = viva ? 85 : 58 - (1 - p) * 16;
  return `hsl(${matiz.toFixed(0)} ${sat.toFixed(0)}% ${luz.toFixed(0)}%)`;
}

/**
 * Os limites da altura de um segmento.
 *
 * A ALTURA NÃO É FIXA: ela sai da divisão entre a janela e quantas publicações
 * há. Com quatro, as barras são grossas e a faixa parece um punhado de marcos;
 * com quarenta, elas se repartem em traços finos e a faixa vira o que deveria
 * ser — uma régua de tempo com densidade.
 *
 * O TETO EXISTE para poucas publicações não virarem três tarjas enormes, e o
 * PISO para muitas não virarem uma mancha sem alvo: abaixo de uns seis pixels
 * ninguém acerta o toque, e a faixa deixa de ser clicável para virar enfeite.
 */
const SEGMENTO_MAX_PX = 30;
const SEGMENTO_MIN_PX = 6;

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
  const [cartaz, setCartaz] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /*
   * O CARTAZ VEM ANTES DO VÍDEO, e de propósito. São 30 KB contra vários
   * megabytes: a imagem já está na tela quando o vídeo ainda está descendo, e
   * quem rola vê o lugar em vez de ver um retângulo preto.
   */
  useEffect(() => {
    if (!perto || cartaz || !post.cartazChave) return;
    let vivo = true;
    void urlDaMidia(post.cartazChave).then((u) => {
      if (vivo) setCartaz(u);
    });
    return () => {
      vivo = false;
    };
  }, [perto, cartaz, post.cartazChave]);

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
          poster={cartaz ?? undefined}
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
      {!url && cartaz && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cartaz} alt="" className="h-full w-full object-contain" />
      )}
      {!url && !cartaz && (
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

/**
 * A publicação dentro do cartão do lugar, com o globo focado atrás.
 *
 * O VÍDEO TOCA COM SOM AQUI, e no feed não. A diferença é o gesto: no feed o
 * vídeo começa sozinho enquanto a pessoa rola, e som que aparece sem ser pedido
 * é o que faz gente fechar aplicativo no ônibus. Aqui ela TOCOU no botão do
 * lugar — pediu para ver aquilo —, e som pedido é outra coisa.
 *
 * O NAVEGADOR PODE RECUSAR MESMO ASSIM. A política de reprodução automática é
 * do navegador e muda entre eles; quando ela barra, o vídeo volta mudo e um
 * botão aparece, em vez de o vídeo simplesmente não começar. Um vídeo parado
 * sem explicação parece defeito.
 */
const PublicacaoNoCartao: FC<{ post: Post }> = ({ post }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [cartaz, setCartaz] = useState<string | null>(null);
  const [mudo, setMudo] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /*
   * A MINIATURA APARECE ANTES DO VÍDEO. Este cartão nasce junto com o giro do
   * globo; se ele ficasse cinza pelos segundos em que o vídeo desce, o gesto
   * de tocar no botão não teria resposta — e a resposta é justamente o ponto.
   */
  useEffect(() => {
    if (!post.cartazChave) {
      setCartaz(null);
      return;
    }
    let vivo = true;
    void urlDaMidia(post.cartazChave).then((u) => {
      if (vivo) setCartaz(u);
    });
    return () => {
      vivo = false;
    };
  }, [post.cartazChave]);

  useEffect(() => {
    if (!post.midiaChave || post.kind === "texto") return;
    let vivo = true;
    setUrl(null);
    void urlDaMidia(post.midiaChave).then((u) => {
      if (vivo) setUrl(u);
    });
    return () => {
      vivo = false;
    };
  }, [post.midiaChave, post.kind]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    v.muted = false;
    v.volume = 1;
    void v
      .play()
      .then(() => setMudo(false))
      .catch(() => {
        // Barrado: volta mudo, mas TOCANDO — e o botão explica o resto.
        v.muted = true;
        setMudo(true);
        void v.play().catch(() => undefined);
      });
  }, [url]);

  /*
   * PUBLICAÇÃO DE TEXTO TAMBÉM APARECE, e não some porque não tem arquivo. Ela
   * vira um cartão com a cor do lugar e o texto legível — o que a pessoa pediu
   * ao tocar no botão foi ver a publicação, e texto é publicação.
   */
  if (post.kind === "texto" || !post.midiaChave) {
    return (
      <div
        className="mb-2.5 flex min-h-[104px] items-center justify-center rounded-xl px-3 py-3"
        style={{
          background: `linear-gradient(150deg, ${corDoLugar(post.pais)}33, rgb(8 12 22 / 0.9))`,
        }}
      >
        <p className="line-clamp-4 text-center text-[13px] font-medium leading-snug text-white/90">
          {post.body}
        </p>
      </div>
    );
  }

  return (
    <div className="relative mb-2.5 overflow-hidden rounded-xl bg-black/60">
      {url && post.kind === "video" && (
        <video
          ref={videoRef}
          src={url}
          poster={cartaz ?? undefined}
          loop
          playsInline
          controls
          className="max-h-52 w-full object-contain"
        />
      )}
      {url && post.kind === "imagem" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Publicação de ${post.autor}`}
          className="max-h-52 w-full object-cover"
        />
      )}
      {!url && cartaz && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cartaz} alt="" className="max-h-52 w-full object-cover" />
      )}
      {!url && !cartaz && (
        <div
          className="h-[104px] w-full"
          style={{
            background: `linear-gradient(150deg, ${corDoLugar(post.pais)}33, rgb(8 12 22 / 0.9))`,
          }}
        />
      )}

      {mudo && post.kind === "video" && (
        <button
          type="button"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            v.muted = false;
            void v
              .play()
              .then(() => setMudo(false))
              .catch(() => undefined);
          }}
          className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-slate-950/80 px-2.5 py-1.5
                     text-[11px] font-medium text-white ring-1 ring-white/20 backdrop-blur"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
          >
            <path d="M4 10v4h3l5 4V6l-5 4H4z" strokeLinejoin="round" />
            <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
          </svg>
          som
        </button>
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
  /** De 0 a 1 enquanto o vídeo é recodificado; nulo quando não há preparo. */
  const [preparo, setPreparo] = useState<number | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const [denunciando, setDenunciando] = useState<Post | null>(null);
  const [menuDoPost, setMenuDoPost] = useState<Post | null>(null);

  const rolagemRef = useRef<HTMLDivElement | null>(null);

  /**
   * A altura da janela da faixa, para repartir os segmentos.
   *
   * MEDIDA, E NÃO SUPOSTA. A janela muda com a barra do navegador no celular,
   * com a rotação da tela e com o teclado; um número chutado ficaria certo num
   * aparelho e errado nos outros.
   */
  const janelaRef = useRef<HTMLDivElement | null>(null);
  const [alturaDaJanela, setAlturaDaJanela] = useState(0);

  useEffect(() => {
    const alvo = janelaRef.current;
    if (!alvo) return;
    const obs = new ResizeObserver(([e]) => {
      if (e) setAlturaDaJanela(e.contentRect.height);
    });
    obs.observe(alvo);
    setAlturaDaJanela(alvo.getBoundingClientRect().height);
    return () => obs.disconnect();
  }, [minimizado]);

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

      let cartazChave: string | null = null;

      if (arquivo) {
        kind = (arquivo.type || "").startsWith("video/") ? "video" : "imagem";

        /*
         * ENCOLHER ANTES DE SUBIR. Um vídeo de celular sai da câmera com
         * dezenas ou centenas de megabytes e num formato que nem todo navegador
         * sabe tocar; subir o original é o caminho mais curto para "não
         * consegui enviar" ou para um retângulo preto do outro lado.
         */
        setPreparo(0);
        const pronta = await prepararMidia(arquivo, setPreparo);
        setPreparo(null);

        if (pronta.recusa === "longo-demais") {
          setAviso(
            `Este vídeo tem ${Math.round((pronta.duracaoSeg ?? 0) / 60)} min. ` +
            `Por enquanto o limite é ${VIDEO_SEG_MAX / 60} minutos — corte um trecho e mande.`,
          );
          return;
        }
        if (pronta.recusa === "nao-decodifica") {
          setAviso(
            "Este navegador não consegue abrir esse arquivo. Tente exportar como MP4.",
          );
          return;
        }

        const enviada = await subirMidia(pronta.blob, pronta.mime);
        if (!enviada) {
          // A causa quase sempre é tamanho, e dizer o número é o que permite à
          // pessoa fazer alguma coisa a respeito.
          setAviso(
            `Não consegui enviar o arquivo (${(pronta.bytesDepois / 1048576).toFixed(1)} MB).`,
          );
          return;
        }
        midiaChave = enviada.chave;

        // O cartaz é um extra: se ele falhar, o vídeo continua publicável.
        if (pronta.cartaz) {
          const c = await subirMidia(pronta.cartaz, "image/jpeg");
          cartazChave = c?.chave ?? null;
        }
      }

      const r = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          body: texto.trim() || null,
          midiaChave,
          cartazChave,
        }),
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
      setPreparo(null);
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

  /*
   * QUANTO CADA PUBLICAÇÃO OCUPA NA FAIXA.
   *
   * A conta é a janela dividida pelo número de publicações, presa entre o piso
   * e o teto. É o que faz a faixa engrossar quando há pouco e se repartir em
   * traços finos quando há muito — sem nunca ficar pequena demais para o dedo
   * nem grande demais para caber.
   *
   * O vão acompanha a barra em vez de ser fixo: quatro pixels entre barras de
   * trinta é um respiro; entre barras de seis é metade do desenho.
   */
  const passoBruto =
    alturaDaJanela > 0 && posts.length > 0
      ? alturaDaJanela / posts.length
      : SEGMENTO_MAX_PX;
  const passoPx = Math.max(
    SEGMENTO_MIN_PX + 2,
    Math.min(SEGMENTO_MAX_PX + 4, passoBruto),
  );
  const vaoPx = Math.max(2, Math.round(passoPx * 0.13));
  const segmentoPx = Math.max(SEGMENTO_MIN_PX, passoPx - vaoPx);

  if (minimizado) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[168]">
        {/*
          A LINHA DO TEMPO, de verdade.

          O topo é o agora e a base é o mais antigo que a lista tem. A cor
          percorre esse caminho — esmeralda no presente, violeta no passado — e
          uma luz desce por ela devagar, de novo e de novo, que é o que faz a
          faixa parecer uma corrente e não uma régua.

          O SEGMENTO ESCOLHIDO É O PRESENTE: mais largo, mais claro, com um halo
          na cor do LUGAR daquela publicação. É assim que o país continua sendo
          dito sem voltar a bagunçar o eixo do tempo.
        */}
        <div className="pointer-events-auto absolute right-0 top-0 flex h-full w-[26px] flex-col items-stretch pr-1.5">
          {/*
            OS RÓTULOS FICAM DE PÉ. Deitados, "antes" tem 22px de largura e a
            coluna tem 20 — o texto era cortado no meio. Em pé eles cabem, e de
            quebra passam a parecer o que são: a marcação de um eixo.
          */}
          <span
            className="flex justify-center pt-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-violet-300/60"
            style={{ writingMode: "vertical-rl" }}
          >
            antes
          </span>

          {/*
            A JANELA DO TEMPO. O que não cabe some nas bordas, e é isso que faz
            a faixa parecer um trecho de algo maior em vez de uma lista inteira
            espremida.
          */}
          <div
            ref={janelaRef}
            className="relative my-1 min-h-0 flex-1 overflow-hidden"
          >
            {/* O agora: duas marcas fixas no meio, por onde o tempo passa. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-1/2 z-10 -translate-y-1/2"
            >
              <span className="absolute -left-[3px] top-1/2 h-[1.5px] w-[5px] -translate-y-1/2 rounded-full bg-white/70" />
              <span className="absolute -right-[3px] top-1/2 h-[1.5px] w-[5px] -translate-y-1/2 rounded-full bg-white/70" />
            </span>

            {/* A corrente, descendo do passado para o futuro. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgb(255 255 255 / 0.45) 12%, transparent 26%)",
                animation: "correnteDoTempo 6s linear infinite",
                mixBlendMode: "overlay",
              }}
            />

            {/*
              A coluna desliza para pôr o segmento escolhido no centro. O `top:
              50%` leva o topo dela ao meio da janela, e a translação recua até
              o centro do segmento ativo — sem precisar medir nada em
              JavaScript, o que manteria a animação a um quadro de atraso.
            */}
            <div
              className="absolute inset-x-0 transition-transform duration-500 ease-out"
              style={{
                top: "50%",
                transform: `translateY(-${
                  (posts.length - 1 - atual) * passoPx + segmentoPx / 2
                }px)`,
              }}
            >
              {posts
                .map((p, i) => ({ p, i }))
                .reverse()
                .map(({ p, i }, posicao) => {
                  const t = posts.length > 1 ? posicao / (posts.length - 1) : 1;
                  const ativo = i === atual;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => escolherNaFaixa(i)}
                      title={`${p.lugar ?? p.pais ?? ""} · ${tempoQueResta(p.expiraEm)}`}
                      aria-label={`Ver ${p.lugar ?? "esta publicação"} no globo`}
                      aria-current={ativo ? "true" : undefined}
                      className="block w-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        height: segmentoPx,
                        marginBottom: vaoPx,
                        background: corDoTempo(t, ativo),
                        transform: ativo ? "scaleX(1)" : "scaleX(0.44)",
                        opacity: ativo ? 1 : 0.32 + t * 0.3,
                        // O halo é da cor do LUGAR: é onde o país volta a ser
                        // dito, sem bagunçar o eixo do tempo.
                        boxShadow: ativo
                          ? `0 0 0 1.5px rgb(255 255 255 / 0.5), 0 0 18px 3px ${cores[i]}`
                          : "none",
                        animation: ativo
                          ? "pulsoDoPresente 2.6s ease-in-out infinite"
                          : undefined,
                      }}
                    />
                  );
                })}
            </div>
          </div>

          <span
            className="flex justify-center pb-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70"
            style={{ writingMode: "vertical-rl" }}
          >
            agora
          </span>
        </div>

        <style>{`
          @keyframes correnteDoTempo {
            from { transform: translateY(-40%); }
            to   { transform: translateY(140%); }
          }
          @keyframes pulsoDoPresente {
            0%, 100% { filter: brightness(1); }
            50%      { filter: brightness(1.35); }
          }
          /*
            QUEM PEDIU MENOS MOVIMENTO RECEBE MENOS MOVIMENTO. Uma faixa que
            pulsa sem parar na borda da tela e' desconfortavel para quem tem
            sensibilidade a movimento, e o navegador ja' sabe dizer isso.
          */
          @media (prefers-reduced-motion: reduce) {
            [style*="correnteDoTempo"], [style*="pulsoDoPresente"] {
              animation: none !important;
            }
          }
        `}</style>

        {/* O cartão do lugar focado. */}
        {postAtual && (
          <div className="pointer-events-auto absolute bottom-4 left-4 right-[38px] rounded-2xl bg-slate-950/80 p-3 ring-1 ring-white/15 backdrop-blur-xl sm:right-auto sm:w-80">
            {/*
              A PUBLICAÇÃO VEM ANTES DO NOME DO LUGAR. Quem tocou no botão
              queria ver aquilo; o nome do lugar é a legenda, e legenda vem
              depois do que ela legenda.
            */}
            <PublicacaoNoCartao post={postAtual} />

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

            {/* A legenda só aparece quando há mídia: num post de texto ela
                repetiria o que a miniatura acabou de mostrar. */}
            {postAtual.body && postAtual.kind !== "texto" && (
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

            {/*
              O PREPARO PRECISA SER VISÍVEL. Ele acontece em tempo real — um
              vídeo de um minuto leva um minuto —, e um minuto de tela parada
              sem explicação é indistinguível de um travamento. A barra e a
              frase são o que transformam espera em espera.
            */}
            {preparo !== null && (
              <div className="mt-2.5">
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
                {preparo !== null
                  ? "Preparando…"
                  : enviando
                    ? "Publicando…"
                    : "Publicar"}
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
