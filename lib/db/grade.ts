import { neon } from "@neondatabase/serverless";

/**
 * A grade do perfil: as fotos e vídeos que uma pessoa publicou.
 *
 * UMA CONSULTA SÓ, e não duas, porque mural e notícia moram na mesma tabela —
 * `posts`, separados pela coluna `tipo`. Buscar em dois lugares e juntar aqui
 * dentro daria o mesmo resultado com duas idas ao banco, duas ordenações e uma
 * terceira chance de as duas listas discordarem sobre o que é recente.
 *
 * O QUE ENTRA É SÓ MÍDIA. Uma grade é feita de imagens; publicação de texto
 * viraria um quadrado cinza com três palavras, e uma grade cheia de quadrados
 * cinzas é pior que uma grade curta. O texto continua vivo no mural e na tela
 * de notícias, que é onde ele se lê.
 *
 * O QUE NÃO ENTRA, e por quê:
 *
 *   · publicação removida, escondida ou de conta banida — a moderação vale
 *     aqui como vale em todo lugar, e ela mora na consulta, não em quem chama;
 *   · post de mural vencido — ele some do globo em 24 horas, e uma grade que
 *     ainda o mostrasse seria uma segunda vida que ninguém prometeu.
 *
 * A CONSEQUÊNCIA DISSO É HONESTA E VALE DIZER: quem só publica no mural tem uma
 * grade que se esvazia sozinha todo dia. É o preço de o mural ser efêmero. O
 * que acumula num perfil, hoje, é notícia — e essa é uma decisão de produto a
 * ser revista, não um defeito da consulta.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export const gradeLigada = Boolean(sql);

/** Quantos quadrados uma leitura devolve. Vinte linhas de três. */
const GRADE_MAX = 60;

export interface ItemDaGrade {
  id: string;
  /** 'mural' some em 24 horas; 'noticia' fica. A tela diz isso ao abrir. */
  tipo: "mural" | "noticia";
  kind: "imagem" | "video";
  titulo: string | null;
  corpo: string | null;
  midiaChave: string;
  /** O quadro guardado do vídeo. É ele que a grade desenha. */
  cartazChave: string | null;
  lat: number;
  lon: number;
  lugar: string | null;
  criadoEm: string;
  expiraEm: string | null;
}

function montar(l: Record<string, unknown>): ItemDaGrade {
  const tipo = l.tipo === "noticia" ? "noticia" : "mural";
  return {
    id: String(l.id),
    tipo,
    kind: l.kind === "video" ? "video" : "imagem",
    titulo: (l.titulo as string) ?? null,
    corpo: (l.body as string) ?? null,
    midiaChave: String(l.midia_chave),
    cartazChave: (l.cartaz_chave as string) ?? null,
    lat: Number(l.lat),
    lon: Number(l.lon),
    lugar: (l.lugar as string) ?? null,
    criadoEm: new Date(String(l.created_at)).toISOString(),
    // Notícia não vence: mandar uma data de cem anos adiante faria a tela
    // calcular "faltam 36500 dias" e mostrar isso a alguém.
    expiraEm:
      tipo === "mural" ? new Date(String(l.expires_at)).toISOString() : null,
  };
}

/**
 * A grade de alguém, pelo nickname.
 *
 * SEM FILTRO DE ALCANCE, ao contrário da tela de notícias. Ali a pergunta é "o
 * que chega até mim", e uma notícia de bairro de outro país não chega. Aqui a
 * pergunta é outra — é a página de uma pessoa, e nela cabe tudo o que ela
 * publicou, venha de onde vier.
 */
export async function gradeDe(
  nickname: string,
  limite = GRADE_MAX,
): Promise<ItemDaGrade[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select p.id, p.tipo, p.kind, p.titulo, p.body, p.midia_chave, p.cartaz_chave,
           p.lat, p.lon, p.lugar, p.created_at, p.expires_at
      from posts p
      join users u on u.id = p.author_id
     where lower(u.nickname) = ${nickname.trim().toLowerCase()}
       and p.kind in ('imagem', 'video')
       and p.midia_chave is not null
       and p.removido_em is null
       and p.oculto_em is null
       and u.banned_at is null
       and (p.tipo = 'noticia' or p.expires_at > now())
     order by p.created_at desc
     limit ${Math.min(Math.max(1, limite), GRADE_MAX)}
  `) as Record<string, unknown>[];
  return linhas.map(montar);
}

/**
 * A minha grade, inclusive o que a comunidade escondeu.
 *
 * EU PRECISO VER O QUE FOI ESCONDIDO, senão a publicação some da minha própria
 * página sem que eu saiba que sumiu — e eu fico publicando para um lugar que
 * ninguém mais enxerga.
 */
export async function minhaGrade(
  autorId: string,
  limite = GRADE_MAX,
): Promise<(ItemDaGrade & { oculto: boolean })[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select p.id, p.tipo, p.kind, p.titulo, p.body, p.midia_chave, p.cartaz_chave,
           p.lat, p.lon, p.lugar, p.created_at, p.expires_at,
           p.oculto_em, p.removido_em
      from posts p
     where p.author_id = ${autorId}::uuid
       and p.kind in ('imagem', 'video')
       and p.midia_chave is not null
       and (p.tipo = 'noticia' or p.expires_at > now())
     order by p.created_at desc
     limit ${Math.min(Math.max(1, limite), GRADE_MAX)}
  `) as Record<string, unknown>[];
  return linhas.map((l) => ({
    ...montar(l),
    oculto: Boolean(l.oculto_em) || Boolean(l.removido_em),
  }));
}
