import { neon } from "@neondatabase/serverless";

/**
 * Curtidas e comentários.
 *
 * O DESENHO DAS TABELAS, e a conta de quanto ele aguenta, estão em
 * db/schema-social.sql. Aqui ficam as consultas — e elas seguem três regras que
 * valem mais que a escolha de banco:
 *
 *   · NUNCA CONTAR O QUE JÁ ESTÁ CONTADO. O número de curtidas vem da coluna do
 *     post, mantida por gatilho. Nenhuma consulta daqui faz `count(*)` numa
 *     tabela de curtidas para desenhar uma tela.
 *
 *   · UMA CONSULTA POR TELA, E NÃO UMA POR ITEM. "Eu curti estes trinta posts?"
 *     é UMA busca com `= any($lista)`. Perguntar um por um seria trinta idas ao
 *     banco para desenhar uma tela — e é o erro que mais aparece quando um feed
 *     começa a ficar lento sem ninguém entender por quê.
 *
 *   · PAGINAR POR CHAVE, NUNCA POR OFFSET. `offset 10000` obriga o Postgres a
 *     ler e jogar fora dez mil linhas. Paginar pelo instante do último item
 *     lido custa o mesmo na primeira página e na quingentésima.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export const socialLigado = Boolean(sql);

/** Quantos comentários uma leitura devolve, e quantas respostas por raiz. */
const COMENTARIOS_PAGINA = 30;
const RESPOSTAS_PAGINA = 20;
const CORPO_MAX = 2000;

export interface Comentario {
  id: string;
  autor: string;
  autorAvatar: string | null;
  corpo: string;
  curtidas: number;
  respostas: number;
  /** A quem esta resposta responde — vira o "@fulano" na tela. */
  respondeA: string | null;
  raizId: string | null;
  criadoEm: string;
  /** Eu curti este comentário? Vem junto, para a tela não perguntar de novo. */
  euCurti: boolean;
  /** É meu? É o que decide se o botão de apagar aparece. */
  meu: boolean;
}

function montar(l: Record<string, unknown>): Comentario {
  return {
    id: String(l.id),
    autor: String(l.autor ?? "?"),
    autorAvatar: (l.autor_avatar as string) ?? null,
    corpo: String(l.corpo ?? ""),
    curtidas: Number(l.curtidas ?? 0),
    respostas: Number(l.respostas ?? 0),
    respondeA: (l.responde_a_nick as string) ?? null,
    raizId: (l.raiz_id as string) ?? null,
    criadoEm: new Date(String(l.criado_em)).toISOString(),
    euCurti: Boolean(l.eu_curti),
    meu: Boolean(l.meu),
  };
}

// ---------------------------------------------------------------------------
// Curtir
// ---------------------------------------------------------------------------

/**
 * Curte, ou descurte, e devolve como ficou.
 *
 * DEVOLVE O ESTADO, e não "ok". A tela mexe no coração na hora do toque, sem
 * esperar resposta — é o que faz o gesto parecer instantâneo. Mas ela precisa
 * do número de verdade para se corrigir, porque entre o toque e a resposta
 * outras pessoas curtiram também. Sem isso, o contador de quem está com a tela
 * aberta vai divergindo do resto do mundo o dia inteiro.
 *
 * `on conflict do nothing` FAZ O DOBRO-TOQUE SER INOFENSIVO. Curtir duas vezes
 * não insere duas linhas, o gatilho não dispara de novo, e o número não infla.
 * A regra mora na chave primária, e não na memória de quem escreveu a tela.
 */
export async function curtirPost(
  postId: string,
  userId: string,
  quero: boolean,
): Promise<{ curtidas: number; euCurti: boolean } | null> {
  if (!sql) return null;

  /*
   * O POST TEM DE EXISTIR ANTES DA CURTIDA.
   *
   * Sem esta conferência, curtir um id que não existe estoura na chave
   * estrangeira e vira erro 500 — o que diz a quem chamou "o servidor quebrou"
   * quando a verdade é "isso não existe". Erro de servidor manda tentar de
   * novo; "não existe" manda parar. São conselhos opostos.
   */
  const existe = (await sql`
    select 1 from posts
     where id = ${postId}::uuid and removido_em is null
     limit 1`) as unknown[];
  if (existe.length === 0) return null;

  if (quero) {
    await sql`
      insert into curtidas (post_id, user_id)
      values (${postId}::uuid, ${userId}::uuid)
      on conflict do nothing`;
  } else {
    await sql`
      delete from curtidas
       where post_id = ${postId}::uuid and user_id = ${userId}::uuid`;
  }

  const linhas = (await sql`
    select p.curtidas,
           exists (select 1 from curtidas c
                    where c.post_id = p.id and c.user_id = ${userId}::uuid) as eu_curti
      from posts p where p.id = ${postId}::uuid`) as Record<string, unknown>[];

  if (!linhas[0]) return null;
  return {
    curtidas: Number(linhas[0].curtidas ?? 0),
    euCurti: Boolean(linhas[0].eu_curti),
  };
}

/**
 * Quais destes posts eu curti.
 *
 * UMA CONSULTA PARA O FEED INTEIRO. É a diferença entre uma ida ao banco e
 * trinta, e é o tipo de coisa que não dói com dez posts e passa a doer
 * exatamente quando o aplicativo cresce.
 */
export async function quaisEuCurti(
  postIds: string[],
  userId: string,
): Promise<Set<string>> {
  if (!sql || postIds.length === 0) return new Set();
  const linhas = (await sql`
    select post_id from curtidas
     where user_id = ${userId}::uuid
       and post_id = any(${postIds}::uuid[])`) as Record<string, unknown>[];
  return new Set(linhas.map((l) => String(l.post_id)));
}

export async function curtirComentario(
  comentarioId: string,
  userId: string,
  quero: boolean,
): Promise<{ curtidas: number; euCurti: boolean } | null> {
  if (!sql) return null;

  const existe = (await sql`
    select 1 from comentarios
     where id = ${comentarioId}::uuid and removido_em is null
     limit 1`) as unknown[];
  if (existe.length === 0) return null;

  if (quero) {
    await sql`
      insert into curtidas_comentario (comentario_id, user_id)
      values (${comentarioId}::uuid, ${userId}::uuid)
      on conflict do nothing`;
  } else {
    await sql`
      delete from curtidas_comentario
       where comentario_id = ${comentarioId}::uuid and user_id = ${userId}::uuid`;
  }

  const linhas = (await sql`
    select k.curtidas,
           exists (select 1 from curtidas_comentario c
                    where c.comentario_id = k.id
                      and c.user_id = ${userId}::uuid) as eu_curti
      from comentarios k where k.id = ${comentarioId}::uuid`) as Record<
    string,
    unknown
  >[];

  if (!linhas[0]) return null;
  return {
    curtidas: Number(linhas[0].curtidas ?? 0),
    euCurti: Boolean(linhas[0].eu_curti),
  };
}

// ---------------------------------------------------------------------------
// Comentar
// ---------------------------------------------------------------------------

export interface NovoComentario {
  postId: string;
  autorId: string;
  corpo: string;
  /** O comentário ao qual se responde. Nulo = comentário de primeiro nível. */
  respondendoA?: string | null;
}

/**
 * Comenta, ou responde.
 *
 * A PROFUNDIDADE É ACHATADA AQUI. Responder a uma resposta pendura a linha na
 * MESMA raiz, guardando a quem ela responde para a tela escrever "@fulano".
 * Sem isso nasceria um terceiro nível, e um terceiro nível numa tela de celular
 * é uma escada de recuos que ninguém lê — além de exigir consulta recursiva,
 * cujo custo depende do formato da árvore e portanto é imprevisível.
 *
 * QUEM BLOQUEOU NÃO É COMENTADO, nos dois sentidos. Bloqueio que vale na
 * conversa e não vale embaixo da publicação é bloqueio pela metade: a pessoa
 * bloqueada continuaria falando com quem a bloqueou, só que em público.
 */
export async function comentar(
  n: NovoComentario,
): Promise<Comentario | null> {
  if (!sql) return null;
  const corpo = n.corpo.trim().slice(0, CORPO_MAX);
  if (!corpo) return null;

  const dono = (await sql`
    select author_id from posts
     where id = ${n.postId}::uuid
       and removido_em is null`) as Record<string, unknown>[];
  if (!dono[0]) return null;
  const donoId = String(dono[0].author_id);

  const bloqueio = (await sql`
    select 1 from user_blocks
     where (blocker_user_id = ${donoId}::uuid and blocked_user_id = ${n.autorId}::uuid)
        or (blocker_user_id = ${n.autorId}::uuid and blocked_user_id = ${donoId}::uuid)
     limit 1`) as unknown[];
  if (bloqueio.length > 0) return null;

  /*
   * A RAIZ VEM DO BANCO, e não do navegador. Se o cliente mandasse a raiz, ele
   * poderia pendurar uma resposta numa conversa de outro post — e a resposta
   * apareceria embaixo de uma publicação que nunca a recebeu.
   */
  let raizId: string | null = null;
  let respondeA: string | null = null;

  if (n.respondendoA) {
    const alvo = (await sql`
      select id, post_id, raiz_id from comentarios
       where id = ${n.respondendoA}::uuid and removido_em is null`) as Record<
      string,
      unknown
    >[];
    if (!alvo[0] || String(alvo[0].post_id) !== n.postId) return null;
    raizId = (alvo[0].raiz_id as string) ?? String(alvo[0].id);
    respondeA = String(alvo[0].id);
  }

  const linhas = (await sql`
    insert into comentarios (post_id, autor_id, raiz_id, responde_a, corpo)
    values (${n.postId}::uuid, ${n.autorId}::uuid,
            ${raizId}::uuid, ${respondeA}::uuid, ${corpo})
    returning id, corpo, curtidas, respostas, raiz_id, criado_em,
              (select nickname from users where id = ${n.autorId}::uuid) as autor,
              (select avatar_url from users where id = ${n.autorId}::uuid) as autor_avatar,
              (select nickname from users u
                join comentarios c on c.autor_id = u.id
                where c.id = ${respondeA}::uuid) as responde_a_nick,
              false as eu_curti,
              true as meu`) as Record<string, unknown>[];

  return linhas[0] ? montar(linhas[0]) : null;
}

// ---------------------------------------------------------------------------
// Ler
// ---------------------------------------------------------------------------

/**
 * Os comentários de um post: só as raízes.
 *
 * AS RESPOSTAS NÃO VÊM JUNTO, de propósito. Uma publicação com quinhentas
 * respostas espalhadas em vinte conversas mandaria as quinhentas para desenhar
 * vinte linhas. A tela pede as respostas de uma conversa quando alguém abre
 * aquela conversa — que é quando elas passam a ser olhadas.
 *
 * O `euCurti` VEM NA MESMA CONSULTA, por `exists`. Buscar os comentários e
 * depois perguntar "curti este? e este?" seria uma ida por linha.
 */
export async function listarComentarios(
  postId: string,
  meuId: string,
  opcoes?: { antesDe?: string | null; limite?: number },
): Promise<Comentario[]> {
  if (!sql) return [];
  const limite = Math.min(
    Math.max(1, opcoes?.limite ?? COMENTARIOS_PAGINA),
    COMENTARIOS_PAGINA,
  );
  const corte = opcoes?.antesDe ?? null;

  const linhas = (await sql`
    select k.id, k.corpo, k.curtidas, k.respostas, k.raiz_id, k.criado_em,
           u.nickname as autor, u.avatar_url as autor_avatar,
           null::text as responde_a_nick,
           exists (select 1 from curtidas_comentario c
                    where c.comentario_id = k.id
                      and c.user_id = ${meuId}::uuid) as eu_curti,
           (k.autor_id = ${meuId}::uuid) as meu
      from comentarios k
      join users u on u.id = k.autor_id
     where k.post_id = ${postId}::uuid
       and k.raiz_id is null
       and k.removido_em is null
       and k.oculto_em is null
       and u.banned_at is null
       -- QUEM EU BLOQUEIEI NÃO APARECE, e quem me bloqueou também não. As duas
       -- direções, senão o bloqueio só vale para um lado.
       and not exists (
         select 1 from user_blocks b
          where (b.blocker_user_id = ${meuId}::uuid and b.blocked_user_id = k.autor_id)
             or (b.blocker_user_id = k.autor_id and b.blocked_user_id = ${meuId}::uuid))
       and (${corte}::timestamptz is null or k.criado_em < ${corte}::timestamptz)
     order by k.criado_em desc
     limit ${limite}`) as Record<string, unknown>[];

  return linhas.map(montar);
}

/** As respostas de uma conversa, em ordem de chegada. */
export async function listarRespostas(
  raizId: string,
  meuId: string,
  opcoes?: { depoisDe?: string | null; limite?: number },
): Promise<Comentario[]> {
  if (!sql) return [];
  const limite = Math.min(
    Math.max(1, opcoes?.limite ?? RESPOSTAS_PAGINA),
    RESPOSTAS_PAGINA,
  );
  const corte = opcoes?.depoisDe ?? null;

  const linhas = (await sql`
    select k.id, k.corpo, k.curtidas, k.respostas, k.raiz_id, k.criado_em,
           u.nickname as autor, u.avatar_url as autor_avatar,
           alvo.nickname as responde_a_nick,
           exists (select 1 from curtidas_comentario c
                    where c.comentario_id = k.id
                      and c.user_id = ${meuId}::uuid) as eu_curti,
           (k.autor_id = ${meuId}::uuid) as meu
      from comentarios k
      join users u on u.id = k.autor_id
      left join comentarios pai on pai.id = k.responde_a
      left join users alvo on alvo.id = pai.autor_id
     where k.raiz_id = ${raizId}::uuid
       and k.removido_em is null
       and k.oculto_em is null
       and u.banned_at is null
       and not exists (
         select 1 from user_blocks b
          where (b.blocker_user_id = ${meuId}::uuid and b.blocked_user_id = k.autor_id)
             or (b.blocker_user_id = k.autor_id and b.blocked_user_id = ${meuId}::uuid))
       and (${corte}::timestamptz is null or k.criado_em > ${corte}::timestamptz)
     order by k.criado_em
     limit ${limite}`) as Record<string, unknown>[];

  return linhas.map(montar);
}

// ---------------------------------------------------------------------------
// Apagar e denunciar
// ---------------------------------------------------------------------------

/**
 * Apaga um comentário meu — ou, sendo dono do post, um comentário na minha
 * publicação.
 *
 * O DONO DO POST PODE APAGAR, e isso não é poder demais: a publicação é dele, e
 * o que fica pendurado nela leva o nome dele junto. Sem isso, a única saída de
 * quem recebe um comentário desagradável seria apagar a própria publicação.
 *
 * É MARCAÇÃO, E NÃO `delete`. A linha fica para a moderação poder olhar depois
 * — quem apaga o próprio comentário logo depois de escrever algo é um padrão
 * conhecido, e apagar de verdade destruiria a prova junto com o texto.
 */
export async function apagarComentario(
  comentarioId: string,
  quemId: string,
): Promise<boolean> {
  if (!sql) return false;
  const r = (await sql`
    update comentarios k set removido_em = now()
     where k.id = ${comentarioId}::uuid
       and k.removido_em is null
       and (k.autor_id = ${quemId}::uuid
            or exists (select 1 from posts p
                        where p.id = k.post_id
                          and p.author_id = ${quemId}::uuid))
    returning k.id`) as unknown[];

  if (r.length === 0) return false;

  /*
   * APAGAR A RAIZ LEVA AS RESPOSTAS JUNTO.
   *
   * Elas já sumiam da tela — ninguém abre uma conversa cuja raiz não existe
   * mais —, mas continuavam contadas, e o cartão dizia "3 comentários" com a
   * conversa vazia. Marcá-las é o que faz o gatilho dos contadores descontar
   * cada uma.
   *
   * É `update` e não `delete`, como tudo aqui: a moderação precisa poder olhar
   * o que foi dito depois que alguém apagou tudo às pressas.
   */
  await sql`
    update comentarios set removido_em = now()
     where raiz_id = ${comentarioId}::uuid and removido_em is null`;

  return true;
}

/** Quantas denúncias escondem um comentário até alguém olhar. */
const DENUNCIAS_PARA_ESCONDER = 3;

export async function denunciarComentario(
  comentarioId: string,
  quemId: string,
  motivo: string | null,
): Promise<{ ok: boolean; escondido: boolean }> {
  if (!sql) return { ok: false, escondido: false };

  await sql`
    insert into comentario_reports (comentario_id, reporter_id, reason)
    values (${comentarioId}::uuid, ${quemId}::uuid, ${motivo})
    on conflict do nothing`;

  /*
   * ESCONDER POR VOLUME É UMA PAUSA, e não uma remoção — a mesma regra dos
   * posts. Remover por contagem de denúncias seria entregar a moderação a quem
   * denuncia em grupo; esconder até alguém olhar tira do ar sem dar a palavra
   * final a ninguém.
   */
  const r = (await sql`
    update comentarios k set oculto_em = now()
     where k.id = ${comentarioId}::uuid
       and k.oculto_em is null
       and k.revisado_em is null
       and (select count(*) from comentario_reports r
             where r.comentario_id = k.id) >= ${DENUNCIAS_PARA_ESCONDER}
    returning k.id`) as unknown[];

  return { ok: true, escondido: r.length > 0 };
}
