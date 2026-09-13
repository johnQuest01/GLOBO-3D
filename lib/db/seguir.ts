import { neon } from "@neondatabase/serverless";

/**
 * Seguir lugares e pessoas — e o mural que sai disso.
 *
 * AS DUAS COISAS SÃO DIFERENTES, e não variações da mesma. Seguir um lugar é
 * dizer "quero ouvir daqui" sem conhecer ninguém — funciona no primeiro dia,
 * com zero contatos, e é o que o globo torna possível. Seguir uma pessoa é o
 * laço comum das redes sociais, e entra porque às vezes é exatamente isso que
 * se quer: alguém apareceu no mural, você gostou, quer ver o que ela publica
 * amanhã.
 *
 * SEGUIR PESSOA AQUI É PRIVADO. Ninguém descobre quem o segue, e não há
 * contagem de seguidores em lugar nenhum — ver o comentário em
 * db/schema-seguir.sql. É o que permite existir "seguir" sem existir placar.
 *
 * E O MURAL DE QUEM SEGUE NUNCA FICA VAZIO. Essa é a parte que decide se a
 * função presta: assinar Lagos e abrir o aplicativo numa semana em que ninguém
 * de Lagos publicou não pode devolver uma tela em branco. A mistura com o mundo
 * é a mesma receita das recomendações de sinais, que já funciona.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export type CamadaDoLugar = "pais" | "estado" | "cidade";

/**
 * Tetos.
 *
 * Sem teto, seguir tudo é o mesmo que não seguir nada: o mural volta a ser a
 * lista do mundo inteiro, e a escolha da pessoa deixa de significar alguma
 * coisa. Os números são generosos o bastante para ninguém esbarrar por acaso.
 */
export const LUGARES_MAX = 50;
export const PESSOAS_MAX = 300;

/** Quanto do mural "seguindo" é reservado ao mundo quando o resto não enche. */
const FATIA_DO_MUNDO = 0.25;

export interface LugarSeguido {
  tipo: CamadaDoLugar;
  valor: string;
  pais: string | null;
}

// ---------------------------------------------------------------------------
// Ler o que eu sigo
// ---------------------------------------------------------------------------

export interface OQueEuSigo {
  lugares: LugarSeguido[];
  pessoas: string[];
}

export async function oQueEuSigo(userId: string): Promise<OQueEuSigo> {
  if (!sql) return { lugares: [], pessoas: [] };

  const [lugares, pessoas] = await Promise.all([
    sql`select tipo, valor, pais from seguindo_lugar
         where user_id = ${userId}::uuid
         order by created_at desc` as Promise<Record<string, unknown>[]>,
    sql`select u.nickname
          from seguindo_pessoa s
          join users u on u.id = s.seguido_id
         where s.seguidor_id = ${userId}::uuid
           and u.banned_at is null
         order by s.created_at desc` as Promise<Record<string, unknown>[]>,
  ]);

  return {
    lugares: lugares.map((l) => ({
      tipo: l.tipo as CamadaDoLugar,
      valor: String(l.valor),
      pais: (l.pais as string) ?? null,
    })),
    pessoas: pessoas.map((p) => String(p.nickname)),
  };
}

// ---------------------------------------------------------------------------
// Lugares
// ---------------------------------------------------------------------------

export type Resultado = "ok" | "cheio" | "nao-encontrado" | "indisponivel";

export async function seguirLugar(
  userId: string,
  lugar: LugarSeguido,
): Promise<Resultado> {
  if (!sql) return "indisponivel";

  const [{ n }] = (await sql`
    select count(*)::int as n from seguindo_lugar where user_id = ${userId}::uuid
  `) as { n: number }[];
  if (n >= LUGARES_MAX) return "cheio";

  /*
   * `pais` entra na chave com string vazia quando é nulo, e não com NULL: em
   * SQL, NULL nunca é igual a NULL, então uma chave primária com nulo aceitaria
   * a mesma assinatura infinitas vezes.
   */
  await sql`
    insert into seguindo_lugar (user_id, tipo, valor, pais)
    values (${userId}::uuid, ${lugar.tipo}, ${lugar.valor}, ${lugar.pais ?? ""})
    on conflict do nothing`;
  return "ok";
}

export async function deixarDeSeguirLugar(
  userId: string,
  lugar: LugarSeguido,
): Promise<void> {
  if (!sql) return;
  await sql`
    delete from seguindo_lugar
     where user_id = ${userId}::uuid
       and tipo = ${lugar.tipo}
       and valor = ${lugar.valor}
       and pais = ${lugar.pais ?? ""}`;
}

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

export async function seguirPessoa(
  userId: string,
  nickname: string,
): Promise<Resultado> {
  if (!sql) return "indisponivel";

  const alvo = (await sql`
    select id from users
     where lower(nickname) = ${nickname.trim().toLowerCase()}
       and banned_at is null
     limit 1`) as { id: string }[];
  if (!alvo[0]) return "nao-encontrado";
  if (alvo[0].id === userId) return "nao-encontrado";

  const [{ n }] = (await sql`
    select count(*)::int as n from seguindo_pessoa where seguidor_id = ${userId}::uuid
  `) as { n: number }[];
  if (n >= PESSOAS_MAX) return "cheio";

  await sql`
    insert into seguindo_pessoa (seguidor_id, seguido_id)
    values (${userId}::uuid, ${alvo[0].id}::uuid)
    on conflict do nothing`;
  return "ok";
}

export async function deixarDeSeguirPessoa(
  userId: string,
  nickname: string,
): Promise<void> {
  if (!sql) return;
  await sql`
    delete from seguindo_pessoa
     where seguidor_id = ${userId}::uuid
       and seguido_id = (
         select id from users where lower(nickname) = ${nickname.trim().toLowerCase()}
       )`;
}

// ---------------------------------------------------------------------------
// O mural de quem segue
// ---------------------------------------------------------------------------

export interface PostSeguido {
  id: string;
  autor: string;
  autorAvatar: string | null;
  kind: string;
  body: string | null;
  midiaChave: string | null;
  cartazChave: string | null;
  curtidas: number;
  comentarios: number;
  euCurti?: boolean;
  lat: number;
  lon: number;
  lugar: string | null;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  criadoEm: string;
  expiraEm: string;
  /** De onde este post veio para o seu mural. A tela usa para explicar. */
  porque: "lugar" | "pessoa" | "mundo";
}

function montar(
  l: Record<string, unknown>,
  porque: PostSeguido["porque"],
): PostSeguido {
  return {
    id: String(l.id),
    autor: String(l.autor ?? "?"),
    autorAvatar: (l.autor_avatar as string) ?? null,
    kind: String(l.kind),
    body: (l.body as string) ?? null,
    midiaChave: (l.midia_chave as string) ?? null,
    cartazChave: (l.cartaz_chave as string) ?? null,
    curtidas: Number(l.curtidas ?? 0),
    comentarios: Number(l.comentarios ?? 0),
    lat: Number(l.lat),
    lon: Number(l.lon),
    lugar: (l.lugar as string) ?? null,
    pais: (l.pais as string) ?? null,
    estado: (l.estado as string) ?? null,
    cidade: (l.cidade as string) ?? null,
    criadoEm: new Date(String(l.created_at)).toISOString(),
    expiraEm: new Date(String(l.expires_at)).toISOString(),
    porque,
  };
}

/**
 * O mural de quem segue: o que foi assinado, e o mundo preenchendo o resto.
 *
 * A MISTURA NÃO É ENFEITE. Assinar poucos lugares e abrir numa hora morta
 * devolveria uma tela em branco, e tela em branco mata mais produto que
 * qualquer defeito. Então o que foi escolhido vem primeiro e o mundo completa —
 * nunca vazio, e nunca uma bolha fechada.
 *
 * QUEM ME BLOQUEOU OU QUEM EU BLOQUEIEI NÃO APARECE, nos três casos. Um
 * bloqueio que vale na conversa e não vale no mural é um bloqueio pela metade,
 * e a pessoa continuaria vendo quem ela pediu para não ver.
 */
export async function muralDeQuemSegue(
  userId: string,
  limite = 60,
): Promise<PostSeguido[]> {
  if (!sql) return [];

  const teto = Math.min(Math.max(1, limite), 60);
  const doMundo = Math.max(4, Math.round(teto * FATIA_DO_MUNDO));
  const doQueSigo = teto - doMundo;

  const escolhidos = (await sql`
    select p.id, p.kind, p.body, p.midia_chave, p.cartaz_chave, p.lat, p.lon, p.lugar,
           p.pais, p.estado, p.cidade, p.created_at, p.expires_at,
           p.curtidas, p.comentarios,
           u.nickname as autor, u.avatar_url as autor_avatar,
           case when sp.seguido_id is not null then 'pessoa' else 'lugar' end as origem
      from posts p
      join users u on u.id = p.author_id
      left join seguindo_pessoa sp
        on sp.seguidor_id = ${userId}::uuid and sp.seguido_id = p.author_id
      left join seguindo_lugar sl
        on sl.user_id = ${userId}::uuid
       and (
         (sl.tipo = 'pais'   and sl.valor = p.pais)
         or (sl.tipo = 'estado' and sl.valor = p.estado and (sl.pais = '' or sl.pais = p.pais))
         or (sl.tipo = 'cidade' and sl.valor = p.cidade and (sl.pais = '' or sl.pais = p.pais))
       )
     where p.tipo = 'mural'
       and p.expires_at > now()
       and p.removido_em is null
       and p.oculto_em is null
       and u.banned_at is null
       and p.author_id <> ${userId}::uuid
       and (sp.seguido_id is not null or sl.user_id is not null)
       and not exists (
         select 1 from user_blocks b
          where (b.blocker_user_id = ${userId}::uuid and b.blocked_user_id = p.author_id)
             or (b.blocker_user_id = p.author_id and b.blocked_user_id = ${userId}::uuid)
       )
     order by p.created_at desc
     limit ${doQueSigo}
  `) as Record<string, unknown>[];

  const jaTenho = new Set(escolhidos.map((l) => String(l.id)));

  /*
   * O MUNDO ENTRA SEMPRE, e não só quando falta. Uma pessoa que assinou bem o
   * suficiente para encher o mural nunca mais veria nada de fora — e o globo
   * existe exatamente para o contrário disso.
   */
  const mundo = (await sql`
    select p.id, p.kind, p.body, p.midia_chave, p.cartaz_chave, p.lat, p.lon, p.lugar,
           p.pais, p.estado, p.cidade, p.created_at, p.expires_at,
           p.curtidas, p.comentarios,
           u.nickname as autor, u.avatar_url as autor_avatar
      from posts p
      join users u on u.id = p.author_id
     where p.tipo = 'mural'
       and p.expires_at > now()
       and p.removido_em is null
       and p.oculto_em is null
       and u.banned_at is null
       and p.author_id <> ${userId}::uuid
       and not exists (
         select 1 from user_blocks b
          where (b.blocker_user_id = ${userId}::uuid and b.blocked_user_id = p.author_id)
             or (b.blocker_user_id = p.author_id and b.blocked_user_id = ${userId}::uuid)
       )
     order by p.created_at desc
     limit ${teto}
  `) as Record<string, unknown>[];

  const saida = escolhidos.map((l) =>
    montar(l, l.origem === "pessoa" ? "pessoa" : "lugar"),
  );

  for (const l of mundo) {
    if (saida.length >= teto) break;
    if (jaTenho.has(String(l.id))) continue;
    saida.push(montar(l, "mundo"));
  }

  // Ordenado por tempo no fim, e não por origem: um mural que mostrasse tudo o
  // que foi assinado e depois tudo o que é do mundo teria uma emenda visível no
  // meio, com data voltando para trás.
  return saida.sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm));
}
