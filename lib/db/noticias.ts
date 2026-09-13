import { neon } from "@neondatabase/serverless";

/**
 * Notícias da região.
 *
 * ELAS MORAM NA MESMA TABELA DO MURAL, e isso é uma decisão, não preguiça. Uma
 * tabela própria seria uma cópia de `posts` com outro nome: mesmo autor, mesmo
 * lugar, mesma mídia, mesma denúncia, mesma fila de moderação. Cópia diverge —
 * no dia em que a moderação mudasse, mudaria num lugar só.
 *
 * O QUE UMA NOTÍCIA TEM A MAIS:
 *
 *   · não morre em 24 horas;
 *   · tem título e assunto, porque é lida numa lista antes de ser aberta;
 *   · declara ATÉ ONDE alcança — a cidade, o estado ou o país.
 *
 * O ALCANCE É DE QUEM ESCREVE. Um alagamento numa rua interessa ao bairro; uma
 * eleição interessa ao país. Deixar o sistema adivinhar pela coordenada jogaria
 * as duas coisas no mesmo lugar, e quem mora longe receberia o alagamento de
 * uma rua que nunca vai ver.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export const noticiasLigadas = Boolean(sql);

export type Alcance = "cidade" | "estado" | "pais";
export type TipoDeMidia = "texto" | "imagem" | "video";

/**
 * Os assuntos.
 *
 * LISTA FECHADA, e curta. Assunto livre produz vinte grafias da mesma coisa
 * ("trânsito", "transito", "Trânsito no centro") e uma lista de filtros que
 * ninguém consegue usar. Sete cobrem o que uma pessoa publica sobre o lugar
 * onde mora; o que não couber vai em "outro", que é honesto.
 */
export const ASSUNTOS = [
  "urgente",
  "transito",
  "tempo",
  "cultura",
  "esporte",
  "economia",
  "outro",
] as const;

export type Assunto = (typeof ASSUNTOS)[number];

/** Quantas notícias uma leitura devolve. O mesmo teto do mural, e pelo mesmo motivo. */
const PAGINA = 30;

export interface Noticia {
  id: string;
  autor: string;
  autorAvatar: string | null;
  titulo: string;
  corpo: string | null;
  kind: TipoDeMidia;
  midiaChave: string | null;
  categoria: Assunto;
  alcance: Alcance;
  lat: number;
  lon: number;
  lugar: string | null;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  criadoEm: string;
  /** Só nas minhas: saber que uma notícia minha saiu do ar. */
  oculto?: boolean;
  denuncias?: number;
}

function montar(l: Record<string, unknown>): Noticia {
  return {
    id: String(l.id),
    autor: String(l.autor ?? "?"),
    autorAvatar: (l.autor_avatar as string) ?? null,
    titulo: String(l.titulo ?? ""),
    corpo: (l.body as string) ?? null,
    kind: (l.kind as TipoDeMidia) ?? "texto",
    midiaChave: (l.midia_chave as string) ?? null,
    categoria: (l.categoria as Assunto) ?? "outro",
    alcance: (l.alcance as Alcance) ?? "cidade",
    lat: Number(l.lat),
    lon: Number(l.lon),
    lugar: (l.lugar as string) ?? null,
    pais: (l.pais as string) ?? null,
    estado: (l.estado as string) ?? null,
    cidade: (l.cidade as string) ?? null,
    criadoEm: new Date(String(l.created_at)).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Publicar
// ---------------------------------------------------------------------------

export interface NovaNoticia {
  autorId: string;
  titulo: string;
  corpo: string | null;
  kind: TipoDeMidia;
  midiaChave: string | null;
  categoria: Assunto;
  alcance: Alcance;
  lat: number;
  lon: number;
  lugar: string | null;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
}

/**
 * Publica uma notícia.
 *
 * `expires_at` RECEBE UMA DATA DISTANTE em vez de ficar nulo: a coluna é
 * obrigatória por causa das linhas do mural que já existem, e afrouxá-la
 * deixaria a consulta do mural aceitando nulo sem querer. Cem anos é o mesmo
 * que "não vence", e não pede exceção em lugar nenhum.
 */
export async function publicarNoticia(n: NovaNoticia): Promise<Noticia | null> {
  if (!sql) return null;
  const linhas = (await sql`
    insert into posts
      (author_id, tipo, kind, titulo, body, midia_chave, categoria, alcance,
       lat, lon, lugar, pais, estado, cidade, expires_at)
    values
      (${n.autorId}::uuid, 'noticia', ${n.kind}, ${n.titulo}, ${n.corpo},
       ${n.midiaChave}, ${n.categoria}, ${n.alcance},
       ${n.lat}, ${n.lon}, ${n.lugar}, ${n.pais}, ${n.estado}, ${n.cidade},
       now() + interval '100 years')
    returning id, kind, titulo, body, midia_chave, categoria, alcance,
              lat, lon, lugar, pais, estado, cidade, created_at,
              (select nickname from users where id = ${n.autorId}::uuid) as autor,
              (select avatar_url from users where id = ${n.autorId}::uuid) as autor_avatar
  `) as Record<string, unknown>[];
  return linhas[0] ? montar(linhas[0]) : null;
}

// ---------------------------------------------------------------------------
// Ler
// ---------------------------------------------------------------------------

export interface FiltroDeNoticias {
  /** O lugar de quem está lendo. É ele que decide o que alcança. */
  pais?: string | null;
  estado?: string | null;
  cidade?: string | null;
  categoria?: Assunto | null;
  /** Busca no título e no corpo. */
  termo?: string | null;
  antesDe?: string | null;
  limite?: number;
}

/**
 * As notícias que alcançam quem está lendo.
 *
 * A REGRA É O ALCANCE DE QUEM ESCREVEU, cruzado com o lugar de quem lê:
 *
 *   · alcance 'pais'   → chega a quem está no mesmo país;
 *   · alcance 'estado' → a quem está no mesmo estado;
 *   · alcance 'cidade' → a quem está na mesma cidade.
 *
 * Sem essa regra, uma notícia de bairro apareceria para o outro lado do mundo —
 * e a promessa de "notícia da minha região" viraria um mural global com título.
 *
 * QUEM NÃO TEM LUGAR VÊ O QUE ALCANÇA O PAÍS INTEIRO, em vez de ver uma tela
 * vazia. É o caso de quem acabou de entrar pelo Google e ainda não disse onde
 * está: melhor mostrar algo largo do que nada.
 */
export async function listarNoticias(f: FiltroDeNoticias): Promise<Noticia[]> {
  if (!sql) return [];
  const limite = Math.min(Math.max(1, f.limite ?? PAGINA), PAGINA);

  const linhas = (await sql`
    select p.id, p.kind, p.titulo, p.body, p.midia_chave, p.categoria, p.alcance,
           p.lat, p.lon, p.lugar, p.pais, p.estado, p.cidade, p.created_at,
           u.nickname as autor, u.avatar_url as autor_avatar
      from posts p
      join users u on u.id = p.author_id
     where p.tipo = 'noticia'
       and p.removido_em is null
       and p.oculto_em is null
       and u.banned_at is null
       and (
         (p.alcance = 'pais'   and p.pais   is not distinct from ${f.pais ?? null})
         or (p.alcance = 'estado' and p.estado is not distinct from ${f.estado ?? null}
                                  and p.pais   is not distinct from ${f.pais ?? null})
         or (p.alcance = 'cidade' and p.cidade is not distinct from ${f.cidade ?? null}
                                  and p.pais   is not distinct from ${f.pais ?? null})
       )
       and (${f.categoria ?? null}::text is null or p.categoria = ${f.categoria ?? null})
       and (
         ${f.termo ?? null}::text is null
         or p.busca @@ plainto_tsquery('portuguese', ${f.termo ?? null})
       )
       and (${f.antesDe ?? null}::timestamptz is null
            or p.created_at < ${f.antesDe ?? null}::timestamptz)
     order by p.created_at desc
     limit ${limite}
  `) as Record<string, unknown>[];

  return linhas.map(montar);
}

/**
 * A página de alguém: as notícias que aquela pessoa publicou.
 *
 * SEM FILTRO DE ALCANCE, de propósito. Aqui não se está perguntando "o que
 * chega até mim" — está se abrindo a página de uma pessoa, e ali cabe tudo o
 * que ela escreveu, venha de onde vier. É a diferença entre um mural de bairro
 * e o arquivo de um jornalista.
 */
export async function noticiasDe(
  nickname: string,
  limite = PAGINA,
): Promise<Noticia[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select p.id, p.kind, p.titulo, p.body, p.midia_chave, p.categoria, p.alcance,
           p.lat, p.lon, p.lugar, p.pais, p.estado, p.cidade, p.created_at,
           u.nickname as autor, u.avatar_url as autor_avatar
      from posts p
      join users u on u.id = p.author_id
     where p.tipo = 'noticia'
       and lower(u.nickname) = ${nickname.trim().toLowerCase()}
       and p.removido_em is null
       and p.oculto_em is null
       and u.banned_at is null
     order by p.created_at desc
     limit ${Math.min(limite, PAGINA)}
  `) as Record<string, unknown>[];
  return linhas.map(montar);
}

/** As minhas, inclusive as que a comunidade escondeu — é a minha página. */
export async function minhasNoticias(autorId: string): Promise<Noticia[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select p.id, p.kind, p.titulo, p.body, p.midia_chave, p.categoria, p.alcance,
           p.lat, p.lon, p.lugar, p.pais, p.estado, p.cidade, p.created_at,
           p.oculto_em, p.removido_em,
           u.nickname as autor, u.avatar_url as autor_avatar,
           (select count(*)::int from post_reports r where r.post_id = p.id) as denuncias
      from posts p
      join users u on u.id = p.author_id
     where p.tipo = 'noticia' and p.author_id = ${autorId}::uuid
     order by p.created_at desc
     limit 100
  `) as Record<string, unknown>[];

  return linhas.map((l) => ({
    ...montar(l),
    oculto: Boolean(l.oculto_em) || Boolean(l.removido_em),
    denuncias: Number(l.denuncias ?? 0),
  }));
}
