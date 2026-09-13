import { neon } from "@neondatabase/serverless";

/**
 * O mural do globo: publicar, ler, denunciar e moderar.
 *
 * O QUE ESTE ARQUIVO DEFENDE. Um mural público é a superfície de maior risco do
 * aplicativo — bem diferente de uma conversa entre duas pessoas, porque o que
 * alguém escreve aqui alcança estranhos, e o aplicativo é aberto a partir dos 13
 * anos. Quase todas as decisões abaixo existem por causa disso, e não por
 * organização de código:
 *
 *   · o post morre em 24 horas, e quem decide isso é a CONSULTA (`expires_at >
 *     now()`), nunca uma tarefa de limpeza. Se dependesse da faxina ter rodado,
 *     um atraso dela deixaria conteúdo vencido no ar;
 *   · a comunidade ESCONDE, e só a moderação REMOVE;
 *   · e o mural é lido com teto, sempre — o que impede que ele fique mais caro
 *     conforme o aplicativo cresce.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export const postsLigados = Boolean(sql);

export type TipoDePost = "texto" | "imagem" | "video";

/**
 * Quantas pessoas DIFERENTES precisam denunciar para o post sair do ar.
 *
 * TRÊS É UM NÚMERO DE COMPROMISSO, e vale dizer entre o que. Baixo demais e um
 * punhado de pessoas combinadas derruba qualquer um; alto demais e a pausa
 * chega tarde, o que num mural de 24 horas equivale a não chegar.
 *
 * O que torna três aceitável é o post não ser APAGADO: ele entra numa fila e
 * uma pessoa decide. Errar para o lado de esconder é reversível; errar para o
 * lado de deixar no ar, não.
 */
export const DENUNCIAS_PARA_OCULTAR = 3;

/** Teto do mural numa leitura. Ver `listarMural`. */
const MURAL_MAX = 60;

export interface Post {
  id: string;
  autor: string;
  autorAvatar: string | null;
  kind: TipoDePost;
  body: string | null;
  midiaChave: string | null;
  /**
   * Um quadro do vídeo, guardado à parte.
   *
   * É ele que aparece no cartão do globo. Desenhar o primeiro quadro do vídeo
   * exigiria baixar o começo do arquivo — e no globo há vários cartões ao mesmo
   * tempo; um JPEG de 30 KB aparece na hora e o vídeo só desce quando alguém
   * pede para ver aquele lugar.
   */
  cartazChave: string | null;
  lat: number;
  lon: number;
  lugar: string | null;
  /** O lugar em camadas — e' por elas que se segue. Ver lib/db/seguir.ts. */
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  criadoEm: string;
  expiraEm: string;
  /**
   * Os números sociais.
   *
   * ELES VÊM DA LINHA DO POST, mantidos por gatilho (db/schema-social.sql), e
   * não de um `count(*)`. Contar curtidas a cada leitura percorreria a tabela
   * inteira daquele post toda vez que alguém abre o feed — e o custo cresce
   * justamente com o sucesso da publicação.
   */
  curtidas: number;
  comentarios: number;
  /**
   * Eu curti este?
   *
   * NÃO SAI DESTA CONSULTA. Quem carimba é a rota, com UMA busca para a
   * página inteira (ver `quaisEuCurti`). Perguntar dentro da consulta do mural
   * obrigaria toda função daqui a receber "quem está lendo", inclusive as que
   * não têm leitor — como a fila da moderação.
   */
  euCurti?: boolean;
  /** Só nos meus posts, e só para a moderação. */
  denuncias?: number;
  oculto?: boolean;
}

function montar(l: Record<string, unknown>): Post {
  return {
    id: String(l.id),
    autor: String(l.autor ?? "?"),
    autorAvatar: (l.autor_avatar as string) ?? null,
    kind: l.kind as TipoDePost,
    body: (l.body as string) ?? null,
    midiaChave: (l.midia_chave as string) ?? null,
    cartazChave: (l.cartaz_chave as string) ?? null,
    lat: Number(l.lat),
    lon: Number(l.lon),
    lugar: (l.lugar as string) ?? null,
    pais: (l.pais as string) ?? null,
    estado: (l.estado as string) ?? null,
    cidade: (l.cidade as string) ?? null,
    criadoEm: new Date(String(l.created_at)).toISOString(),
    expiraEm: new Date(String(l.expires_at)).toISOString(),
    curtidas: Number(l.curtidas ?? 0),
    comentarios: Number(l.comentarios ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Publicar
// ---------------------------------------------------------------------------

export interface NovoPost {
  autorId: string;
  kind: TipoDePost;
  body: string | null;
  midiaChave: string | null;
  cartazChave: string | null;
  lat: number;
  lon: number;
  lugar: string | null;
  /**
   * O lugar em camadas, para ser ASSINÁVEL.
   *
   * `lugar` é o texto pronto para a tela ("Moscou, Rússia") e não serve para
   * seguir: casar texto concatenado é o mesmo erro que mandou uma conta para a
   * Sibéria. Estes três são o que a pessoa escolheu na lista, guardados
   * separados, e é neles que "seguir Brasil" vira uma igualdade indexada.
   */
  pais: string | null;
  estado: string | null;
  cidade: string | null;
}

/**
 * Publica.
 *
 * A COORDENADA VEM DE QUEM CHAMA, e a rota a tira do perfil do autor no
 * servidor — nunca do que o navegador mandou. Um mural em que a pessoa escolhe
 * onde o próprio post aparece deixaria qualquer um plantar conteúdo em cima de
 * qualquer cidade, que é o primeiro uso que alguém daria a isso.
 */
export async function publicar(p: NovoPost): Promise<Post | null> {
  if (!sql) return null;
  const linhas = (await sql`
    insert into posts (author_id, kind, body, midia_chave, cartaz_chave,
                       lat, lon, lugar, pais, estado, cidade)
    values (${p.autorId}::uuid, ${p.kind}, ${p.body}, ${p.midiaChave},
            ${p.cartazChave}, ${p.lat}, ${p.lon}, ${p.lugar},
            ${p.pais}, ${p.estado}, ${p.cidade})
    returning id, kind, body, midia_chave, cartaz_chave, lat, lon, lugar,
              created_at, expires_at, curtidas, comentarios,
              pais, estado, cidade,
              (select nickname from users where id = ${p.autorId}::uuid) as autor,
              (select avatar_url from users where id = ${p.autorId}::uuid) as autor_avatar
  `) as Record<string, unknown>[];
  return linhas[0] ? montar(linhas[0]) : null;
}

// ---------------------------------------------------------------------------
// Ler
// ---------------------------------------------------------------------------

/**
 * O mural: o mundo inteiro, com teto e por página.
 *
 * MUNDIAL E COM TETO NÃO SÃO COISAS EM TENSÃO — o teto é o que torna o mundial
 * possível. Um mural que devolvesse tudo ficaria mais caro a cada pessoa que
 * entra no aplicativo; com teto, o custo de uma leitura é o mesmo com mil ou com
 * quinhentas mil pessoas, e quem quiser mais pede a próxima página.
 *
 * `antesDe` é o cursor: o instante do post mais velho que a tela já tem. Paginar
 * por data e não por número de página é o que faz a lista não embaralhar quando
 * alguém publica durante a rolagem.
 *
 * O QUE NUNCA SAI DAQUI: post vencido, escondido ou removido. As três condições
 * estão na consulta, e não em quem chama — é a diferença entre esconder de quem
 * olha a tela e esconder de quem olha a rede.
 */
export async function listarMural(opcoes?: {
  antesDe?: string | null;
  limite?: number;
}): Promise<Post[]> {
  if (!sql) return [];
  const limite = Math.min(Math.max(1, opcoes?.limite ?? MURAL_MAX), MURAL_MAX);
  const corte = opcoes?.antesDe ?? null;

  const linhas = (await sql`
    select p.id, p.kind, p.body, p.midia_chave, p.cartaz_chave, p.lat, p.lon, p.lugar,
           p.pais, p.estado, p.cidade, p.created_at, p.expires_at, p.curtidas, p.comentarios,
           u.nickname as autor, u.avatar_url as autor_avatar
      from posts p
      join users u on u.id = p.author_id
     where p.tipo = 'mural'
       and p.expires_at > now()
       and p.removido_em is null
       and p.oculto_em is null
       and u.banned_at is null
       and (${corte}::timestamptz is null or p.created_at < ${corte}::timestamptz)
     order by p.created_at desc
     limit ${limite}
  `) as Record<string, unknown>[];

  return linhas.map(montar);
}

/** Os meus, inclusive os escondidos — é o meu mural, e eu preciso saber. */
export async function meusPosts(autorId: string): Promise<Post[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select p.id, p.kind, p.body, p.midia_chave, p.cartaz_chave, p.lat, p.lon, p.lugar,
           p.pais, p.estado, p.cidade,
           p.created_at, p.expires_at, p.curtidas, p.comentarios, p.oculto_em, p.removido_em,
           u.nickname as autor, u.avatar_url as autor_avatar,
           (select count(*)::int from post_reports r where r.post_id = p.id) as denuncias
      from posts p
      join users u on u.id = p.author_id
     where p.tipo = 'mural'
       and p.author_id = ${autorId}::uuid
       and p.expires_at > now()
     order by p.created_at desc
     limit 100
  `) as Record<string, unknown>[];

  return linhas.map((l) => ({
    ...montar(l),
    denuncias: Number(l.denuncias ?? 0),
    oculto: Boolean(l.oculto_em) || Boolean(l.removido_em),
  }));
}

// ---------------------------------------------------------------------------
// Apagar o próprio
// ---------------------------------------------------------------------------

/**
 * Apaga um post meu.
 *
 * O `author_id` VAI NO `where`, e não num `if` antes. É a diferença entre uma
 * regra que o banco garante e uma que depende de nenhum caminho do código ter
 * esquecido a checagem: conhecer o id de um post não pode dar poder de apagá-lo.
 */
export async function apagarMeuPost(
  autorId: string,
  postId: string,
): Promise<boolean> {
  if (!sql) return false;
  const linhas = (await sql`
    delete from posts
     where id = ${postId}::uuid and author_id = ${autorId}::uuid
    returning id
  `) as unknown[];
  return linhas.length > 0;
}

// ---------------------------------------------------------------------------
// Denunciar
// ---------------------------------------------------------------------------

export interface ResultadoDaDenuncia {
  registrada: boolean;
  /** Quantas pessoas diferentes já denunciaram. */
  total: number;
  /** Passou do limite agora e saiu do ar. */
  ocultou: boolean;
}

/**
 * Denuncia um post.
 *
 * UMA PESSOA, UMA DENÚNCIA — garantido pela chave primária composta, e não por
 * uma consulta antes de inserir: duas denúncias simultâneas da mesma pessoa
 * passariam pelo `select` ao mesmo tempo.
 *
 * ESCONDER É UMA PAUSA. O post sai do ar e entra na fila; nada é apagado, e a
 * moderação pode devolver. Um post JÁ REVISADO não é escondido de novo por
 * denúncia: senão a decisão de quem moderou duraria só até o próximo grupo se
 * organizar, e moderar deixaria de significar alguma coisa.
 */
export async function denunciarPost(
  postId: string,
  denuncianteId: string,
  motivo: string,
): Promise<ResultadoDaDenuncia> {
  if (!sql) return { registrada: false, total: 0, ocultou: false };

  const inseriu = (await sql`
    insert into post_reports (post_id, reporter_id, reason)
    values (${postId}::uuid, ${denuncianteId}::uuid, ${motivo.slice(0, 500)})
    on conflict (post_id, reporter_id) do nothing
    returning post_id
  `) as unknown[];

  const contagem = (await sql`
    select count(*)::int as n from post_reports where post_id = ${postId}::uuid
  `) as { n: number }[];
  const total = contagem[0]?.n ?? 0;

  let ocultou = false;
  if (total >= DENUNCIAS_PARA_OCULTAR) {
    const escondeu = (await sql`
      update posts set oculto_em = now()
       where id = ${postId}::uuid
         and oculto_em is null
         and revisado_em is null
         and removido_em is null
      returning id
    `) as unknown[];
    ocultou = escondeu.length > 0;
  }

  return { registrada: inseriu.length > 0, total, ocultou };
}

// ---------------------------------------------------------------------------
// Moderação — a camada de cima
// ---------------------------------------------------------------------------

export interface PostNaFila extends Post {
  denuncias: number;
  motivos: string[];
  ocultoEm: string | null;
}

/**
 * A fila: o que a comunidade escondeu e ninguém julgou ainda.
 *
 * Os MOTIVOS vêm junto porque a decisão depende deles. "Spam" e "isto é uma
 * criança" são a mesma contagem e problemas completamente diferentes, e uma fila
 * que mostrasse só o número obrigaria a abrir cada caso para descobrir qual é.
 */
export async function filaDeModeracao(limite = 50): Promise<PostNaFila[]> {
  if (!sql) return [];
  const linhas = (await sql`
    select p.id, p.kind, p.body, p.midia_chave, p.cartaz_chave, p.lat, p.lon, p.lugar,
           p.pais, p.estado, p.cidade, p.created_at, p.expires_at, p.curtidas, p.comentarios, p.oculto_em,
           u.nickname as autor, u.avatar_url as autor_avatar,
           (select count(*)::int from post_reports r where r.post_id = p.id) as denuncias,
           (select coalesce(array_agg(r.reason), '{}')
              from post_reports r where r.post_id = p.id) as motivos
      from posts p
      join users u on u.id = p.author_id
     where p.oculto_em is not null
       and p.revisado_em is null
       and p.removido_em is null
     order by p.oculto_em asc
     limit ${Math.min(limite, 200)}
  `) as Record<string, unknown>[];

  return linhas.map((l) => ({
    ...montar(l),
    denuncias: Number(l.denuncias ?? 0),
    motivos: Array.isArray(l.motivos)
      ? (l.motivos as string[]).filter(Boolean)
      : [],
    ocultoEm: l.oculto_em ? new Date(String(l.oculto_em)).toISOString() : null,
  }));
}

/**
 * A decisão de quem modera — e ela fica por cima da comunidade.
 *
 * `restaurar` devolve o post ao ar E o marca como revisado: sem a segunda parte,
 * o mesmo grupo o esconderia de novo em minutos e a decisão não teria valido
 * nada.
 *
 * `remover` não apaga a linha. O post sai do ar, e o registro fica — a denúncia
 * do outro lado precisa continuar apontando para alguma coisa, e uma decisão de
 * moderação sem rastro é uma decisão que ninguém pode revisar depois.
 */
export async function decidirSobrePost(
  postId: string,
  moderadorId: string | null,
  acao: "restaurar" | "remover",
): Promise<boolean> {
  if (!sql) return false;

  if (acao === "restaurar") {
    const r = (await sql`
      update posts
         set oculto_em = null, revisado_em = now(), revisado_por = ${moderadorId}::uuid
       where id = ${postId}::uuid and removido_em is null
      returning id
    `) as unknown[];
    return r.length > 0;
  }

  const r = (await sql`
    update posts
       set removido_em = now(), revisado_em = now(), revisado_por = ${moderadorId}::uuid
     where id = ${postId}::uuid
    returning id
  `) as unknown[];
  return r.length > 0;
}
