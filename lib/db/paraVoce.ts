import { neon } from "@neondatabase/serverless";

import { type Post } from "./posts";

/**
 * O feed "Para você" — o que otimiza tempo de tela.
 *
 * ESTE ARQUIVO FAZ, FIELMENTE, O QUE FOI PEDIDO: ordena as publicações pelo
 * que PRENDE. Não é o que eu recomendaria, e a objeção está registrada na
 * conversa e no PLANO.md; a decisão é de quem é dono do produto. O que eu
 * posso fazer é deixar cada peso à vista, com nome, para que a decisão seja
 * tomada olhando para os números e não para uma caixa preta.
 *
 * A NOTA DE UMA PUBLICAÇÃO SOMA QUATRO COISAS:
 *
 *   PRENDE     tempo médio que cada pessoa ficou olhando (segundos por vista).
 *              É o sinal mais forte de "isto segura", e o único que não pede
 *              gesto. É também o que faz um feed destes aprender sozinho o
 *              que ninguém programou: se briga segura 40 s e pôr do sol
 *              segura 6, briga vence, sem que ninguém tenha escolhido briga.
 *
 *   SOCIAL     curtidas e comentários. Comentário pesa MAIS que curtida — de
 *              propósito e fielmente, porque é assim que esses algoritmos
 *              fazem: comentário é o gesto mais caro, logo o mais "valioso".
 *              E é exatamente por isso que conteúdo que provoca resposta sobe.
 *
 *   AFINIDADE  quanto ESTA pessoa já olhou para este país e para este autor.
 *              Vem da tabela `affinity`, com meia-vida de 45 dias.
 *
 *   FRESCOR    decai pela idade, com meia-vida de 12 horas. Sem isto o feed
 *              congela no que já prendeu ontem.
 *
 * Os quatro entram em escala de logaritmo: a décima curtida vale menos que a
 * primeira, e um post com mil vistas não esmaga tudo o mais por aritmética.
 *
 * JÁ VISTO PESA METADE. Um feed que maximiza tempo re-mostra o que prendeu —
 * mas mostrar exatamente a mesma coisa em sequência é o jeito mais rápido de
 * a pessoa fechar; a metade é o meio-termo.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

/**
 * OS PESOS, COM NOME. Mudar o feed é mudar aqui.
 *
 * Estão em objeto exportado para o teste de avaliação poder imprimi-los ao
 * lado do ranking que produzem — a decisão editorial fica visível.
 */
export const PESOS = {
  prende: 3.0,
  social: 1.5,
  curtidaVale: 2,
  comentarioVale: 3,
  afinidadeRegiao: 1.0,
  afinidadeAutor: 1.5,
  frescor: 6.0,
  frescorMeiaVidaHoras: 12,
  jaVisto: 0.5,
  /** Acima disto, o tempo por vista para de somar (uma aba esquecida aberta). */
  tetoSegundosPorVista: 60,

  /*
   * EXPLORAÇÃO — o que um feed com zero usuários mais precisa.
   *
   * Sem isto, o algoritmo tem um defeito de nascença: uma publicação nova tem
   * zero vistas, logo zero PRENDE, logo nunca sobe, logo nunca é vista, logo
   * continua com zero. O rico fica rico. O TikTok resolve isso dando a TODO
   * vídeo novo uma cota garantida de exibições antes de julgá-lo — e é essa
   * cota, mais do que a fórmula, o segredo dele. Aqui: uma publicação com
   * menos de `explorarAte` vistas recebe um bônus que encolhe a cada vista,
   * até zerar. Ela ganha a chance; o que fizer com ela é com ela.
   */
  explora: 4.0,
  explorarAte: 8,

  /*
   * DIVERSIDADE — o mesmo autor nunca em dois seguidos, o mesmo país nunca em
   * três. Um feed que maximiza nota pura mostra cinco posts da mesma pessoa
   * em fila quando ela está prendendo, e isso é o jeito mais rápido de a
   * pessoa sentir que "só tem isso aqui" e fechar. Não muda a nota; muda a
   * ORDEM depois da nota.
   */
  mesmoPaisSeguidosMax: 2,
} as const;

const HALF_LIFE_DAYS = 45;
const CANDIDATOS = 200;

export interface PostRanqueado extends Post {
  nota: number;
  /** As parcelas, para quem quiser saber POR QUE apareceu. */
  parcelas: {
    prende: number;
    social: number;
    afinidade: number;
    frescor: number;
    explora: number;
    jaVisto: boolean;
  };
}

function montar(l: Record<string, unknown>): PostRanqueado {
  return {
    id: String(l.id),
    autor: String(l.autor ?? "?"),
    autorAvatar: (l.autor_avatar as string) ?? null,
    kind: l.kind as Post["kind"],
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
    nota: Number(l.nota ?? 0),
    parcelas: {
      prende: Number(l.p_prende ?? 0),
      social: Number(l.p_social ?? 0),
      afinidade: Number(l.p_afinidade ?? 0),
      frescor: Number(l.p_frescor ?? 0),
      explora: Number(l.p_explora ?? 0),
      jaVisto: Boolean(l.ja_visto),
    },
  };
}

/**
 * O feed ordenado pelo que prende, para esta pessoa.
 *
 * `clientId` é a identidade do NAVEGADOR (ver useBehaviorTracker), e não da
 * conta: é por ela que a afinidade foi acumulada, inclusive antes de existir
 * conta. Sem histórico, a afinidade é zero e o que manda é o que prende todo
 * mundo — o algoritmo não trava esperando dados.
 */
export async function feedParaVoce(
  clientId: string,
  limite = 60,
): Promise<PostRanqueado[]> {
  if (!sql) return [];
  const P = PESOS;

  /*
   * TODO NÚMERO ENTRA COM `::float8`. Sem o cast, o Postgres infere o tipo do
   * parâmetro pelo que está ao lado — e `case when ... then $14 else 1 end`
   * vira INTEIRO por causa do `1`, e o 0,5 do "já visto" estourava com
   * "invalid input syntax for type integer". Foi o primeiro erro desta
   * consulta, e é o tipo de erro que só aparece ao rodar.
   */
  const linhas = (await sql`
    with pref as (
      select dimension, value,
             score * power(0.5,
               extract(epoch from (now() - updated_at)) / (${HALF_LIFE_DAYS}::float8 * 86400)) as score
        from affinity
       where client_id = ${clientId}
    ),
    vistos as (
      select distinct ref_id
        from behavior_events
       where client_id = ${clientId}
         and kind = 'post_view'
         and coalesce(dwell_ms, 0) >= 3000
         and created_at > now() - interval '2 days'
    ),
    cand as (
      select p.id, p.kind, p.body, p.midia_chave, p.cartaz_chave, p.lat, p.lon, p.lugar,
             p.pais, p.estado, p.cidade, p.created_at, p.expires_at,
             p.curtidas, p.comentarios, p.vistas, p.tempo_visto_seg,
             u.nickname as autor, u.avatar_url as autor_avatar
        from posts p
        join users u on u.id = p.author_id
       where p.tipo = 'mural'
         and p.expires_at > now()
         and p.removido_em is null
         and p.oculto_em is null
         and u.banned_at is null
       order by p.created_at desc
       limit ${CANDIDATOS}
    ),
    notas as (
      select c.*,
        ${P.prende}::float8 * ln(1 + least(${P.tetoSegundosPorVista}::float8,
            c.tempo_visto_seg / greatest(1, c.vistas))) as p_prende,
        ${P.social}::float8 * ln(1 + ${P.curtidaVale}::float8 * c.curtidas
                           + ${P.comentarioVale}::float8 * c.comentarios) as p_social,
        ln(1 + greatest(0,
            ${P.afinidadeRegiao}::float8 * coalesce(r.score, 0)
          + ${P.afinidadeAutor}::float8  * coalesce(a.score, 0))) as p_afinidade,
        ${P.frescor}::float8 * power(0.5,
            extract(epoch from (now() - c.created_at)) / (${P.frescorMeiaVidaHoras}::float8 * 3600)) as p_frescor,
        ${P.explora}::float8 * greatest(0,
            1 - c.vistas::float8 / ${P.explorarAte}::float8) as p_explora,
        (v.ref_id is not null) as ja_visto
        from cand c
        left join pref r on r.dimension = 'region' and r.value = c.pais
        left join pref a on a.dimension = 'topic'  and a.value = 'autor:' || c.autor
        left join vistos v on v.ref_id = c.id::text
    )
    select *,
           (p_prende + p_social + p_afinidade + p_frescor + p_explora)
             * (case when ja_visto then ${P.jaVisto}::float8 else 1.0 end) as nota
      from notas
     order by nota desc, created_at desc
     limit ${Math.min(Math.max(1, limite), 100)}
  `) as Record<string, unknown>[];

  return diversificar(linhas.map(montar));
}

/**
 * Reordena SEM mudar notas: nunca o mesmo autor em dois seguidos, nunca o
 * mesmo país mais de `mesmoPaisSeguidosMax` vezes em fila.
 *
 * O ALGORITMO É GULOSO, de propósito: a cada posição pega o primeiro da lista
 * ordenada que não quebra a regra; se nenhum serve, pega o melhor mesmo assim.
 * Uma solução "ótima" custaria mais e ninguém veria a diferença — a regra é
 * para o olho não cansar, não para um teorema.
 */
function diversificar(ordenados: PostRanqueado[]): PostRanqueado[] {
  const resto = [...ordenados];
  const saida: PostRanqueado[] = [];
  while (resto.length > 0) {
    const anterior = saida[saida.length - 1];
    const ultimosPaises = saida.slice(-PESOS.mesmoPaisSeguidosMax).map((p) => p.pais);
    const paisEsgotado =
      ultimosPaises.length === PESOS.mesmoPaisSeguidosMax &&
      ultimosPaises.every((p) => p !== null && p === ultimosPaises[0]);
    /*
     * TRÊS TENTATIVAS, DA MAIS EXIGENTE À MAIS FROUXA: as duas regras; só a
     * do autor; qualquer um. A do autor vale mais que a do país — ver a mesma
     * pessoa duas vezes seguidas incomoda mais que ver o mesmo país três.
     * Sem esta ordem, quando o país esgotava e só sobrava gente daquele país,
     * o recuo cego pegava o primeiro da lista, que podia ser o MESMO autor de
     * novo, com outro autor logo ali disponível.
     */
    const outroAutor = (p: PostRanqueado) => !anterior || p.autor !== anterior.autor;
    const outroPais = (p: PostRanqueado) => !(paisEsgotado && p.pais === ultimosPaises[0]);
    let i = resto.findIndex((p) => outroAutor(p) && outroPais(p));
    if (i < 0) i = resto.findIndex(outroAutor);
    if (i < 0) i = 0;
    saida.push(resto.splice(i, 1)[0]!);
  }
  return saida;
}
