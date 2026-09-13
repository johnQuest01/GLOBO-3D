import { neon } from '@neondatabase/serverless';

/**
 * O perfil: ler o meu, gravar o meu, e ler o dos outros — com regras
 * diferentes para cada coisa.
 *
 * A SEPARAÇÃO ENTRE `meuPerfil` E `perfilPublico` É A PEÇA DE SEGURANÇA DESTE
 * ARQUIVO, e não uma organização de código. São duas consultas com dois
 * conjuntos de colunas: a segunda NUNCA seleciona e-mail, e aplica a
 * visibilidade dentro da própria consulta. Se fosse uma função só com um
 * parâmetro "é o dono?", bastaria um caminho esquecido para vazar o e-mail de
 * todo mundo.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

export type Visibilidade = 'publico' | 'reservado' | 'privado';

/** O que o DONO vê e edita. */
export interface MeuPerfil {
  nickname: string | null;
  fullName: string | null;
  descricao: string | null;
  nascimento: string | null;
  avatarUrl: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  visibilidade: Visibilidade;
}

/** O que OS OUTROS veem. Note o que não existe aqui: e-mail e data exata. */
export interface PerfilPublico {
  nickname: string;
  fullName: string | null;
  descricao: string | null;
  idade: number | null;
  avatarUrl: string | null;
  /** Só cidade/estado/país — nunca coordenada. */
  lugar: string | null;
  /**
   * Só o país. Sai mesmo em perfil reservado — ver o comentario em
   * `perfilPublico`.
   */
  pais: string | null;
  visibilidade: Visibilidade;
}

const ehVisibilidade = (v: unknown): v is Visibilidade =>
  v === 'publico' || v === 'reservado' || v === 'privado';

export async function meuPerfil(userId: string): Promise<MeuPerfil | null> {
  if (!sql) return null;
  const linhas = (await sql`
    select nickname, full_name, descricao, avatar_url, country, state, city,
           perfil_visibilidade,
           to_char(nascimento, 'YYYY-MM-DD') as nascimento
      from users where id = ${userId}::uuid limit 1
  `) as Record<string, unknown>[];

  const l = linhas[0];
  if (!l) return null;

  return {
    nickname: (l.nickname as string) ?? null,
    fullName: (l.full_name as string) ?? null,
    descricao: (l.descricao as string) ?? null,
    nascimento: (l.nascimento as string) ?? null,
    avatarUrl: (l.avatar_url as string) ?? null,
    country: (l.country as string) ?? null,
    state: (l.state as string) ?? null,
    city: (l.city as string) ?? null,
    visibilidade: ehVisibilidade(l.perfil_visibilidade) ? l.perfil_visibilidade : 'reservado',
  };
}

export async function gravarPerfil(
  userId: string,
  dados: {
    fullName?: string | null;
    descricao?: string | null;
    nascimento?: string | null;
    avatarUrl?: string | null;
    visibilidade?: Visibilidade;
  },
): Promise<void> {
  if (!sql) return;

  /*
   * `coalesce` em cada campo: quem não mandou não muda.
   *
   * É o que permite à tela gravar só o que a pessoa mexeu, sem ter que
   * reenviar o perfil inteiro — e sem que um campo ausente apague o que estava
   * lá. Para apagar de verdade, a tela manda string vazia, que o servidor
   * converte em nulo antes de chegar aqui.
   */
  await sql`
    update users set
      full_name  = coalesce(${dados.fullName ?? null}, full_name),
      descricao  = coalesce(${dados.descricao ?? null}, descricao),
      avatar_url = coalesce(${dados.avatarUrl ?? null}, avatar_url),
      nascimento = coalesce(${dados.nascimento ?? null}::date, nascimento),
      perfil_visibilidade = coalesce(${dados.visibilidade ?? null}, perfil_visibilidade)
    where id = ${userId}::uuid`;
}

/** Apaga um campo de verdade — o `coalesce` acima nunca faria isso. */
export async function limparCampoDoPerfil(
  userId: string,
  campo: 'descricao' | 'avatar_url' | 'nascimento',
): Promise<void> {
  if (!sql) return;
  if (campo === 'descricao') {
    await sql`update users set descricao = null where id = ${userId}::uuid`;
  } else if (campo === 'avatar_url') {
    await sql`update users set avatar_url = null where id = ${userId}::uuid`;
  } else {
    await sql`update users set nascimento = null where id = ${userId}::uuid`;
  }
}

/**
 * O perfil de outra pessoa, já podado pela vontade dela.
 *
 * A PODA ACONTECE AQUI, e não na tela. Mandar tudo e esconder no navegador
 * seria esconder de quem olha a tela, e não de quem olha a rede — qualquer
 * pessoa veria o dado completo abrindo o console.
 *
 * A IDADE VAI COMO NÚMERO, nunca a data. Dia e mês de nascimento são dados que
 * abrem portas em outros lugares (recuperação de conta, por exemplo), e o
 * perfil não precisa deles para dizer "27 anos".
 */
export async function perfilPublico(nickname: string): Promise<PerfilPublico | null> {
  if (!sql) return null;

  const linhas = (await sql`
    select nickname, full_name, descricao, avatar_url, country, state, city,
           perfil_visibilidade,
           case
             when nascimento is null then null
             else extract(year from age(nascimento))::int
           end as idade
      from users
     where lower(nickname) = ${nickname.trim().toLowerCase()}
       and banned_at is null
     limit 1
  `) as Record<string, unknown>[];

  const l = linhas[0];
  if (!l) return null;

  const visibilidade: Visibilidade = ehVisibilidade(l.perfil_visibilidade)
    ? l.perfil_visibilidade
    : 'reservado';

  const base: PerfilPublico = {
    nickname: String(l.nickname),
    fullName: null,
    descricao: null,
    idade: null,
    avatarUrl: null,
    lugar: null,
    pais: null,
    visibilidade,
  };

  // Privado: só o nickname. Nem foto — é o que a pessoa pediu.
  if (visibilidade === 'privado') return base;

  base.avatarUrl = (l.avatar_url as string) ?? null;

  /*
   * O PAÍS SAI MESMO NO PERFIL RESERVADO, e a cidade não.
   *
   * A escolha é sobre o que cada um revela. "É da Rússia" situa uma conversa
   * entre desconhecidos — é o que um globo existe para dizer, e é grosso
   * demais para localizar alguém: são 17 milhões de km². A cidade é outra
   * coisa; ela fica guardada até a pessoa decidir abrir o perfil.
   *
   * Quem não quiser nem isso tem o nível privado, que não devolve nada.
   */
  base.pais = (l.country as string) ?? null;
  if (visibilidade === 'reservado') return base;

  // Público: o resto.
  base.fullName = (l.full_name as string) ?? null;
  base.descricao = (l.descricao as string) ?? null;
  base.idade = typeof l.idade === 'number' ? l.idade : null;
  base.lugar =
    [l.city, l.state, l.country].filter((v) => typeof v === 'string' && v).join(', ') ||
    null;

  return base;
}
