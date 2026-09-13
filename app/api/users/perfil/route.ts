import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/session';
import { isAuthDbEnabled } from '@/lib/db/auth';
import {
  gravarPerfil,
  limparCampoDoPerfil,
  meuPerfil,
  perfilPublico,
  type Visibilidade,
} from '@/lib/db/perfil';

/**
 * O perfil.
 *
 * GET sem parâmetro devolve o SEU, inteiro. GET com `?de=nickname` devolve o de
 * outra pessoa, já podado pela vontade dela — e são duas consultas diferentes,
 * não a mesma com um `if`. Ver o comentário em lib/db/perfil.ts.
 *
 * POST grava o seu. Campo ausente não muda; string vazia apaga. A diferença
 * entre as duas coisas é o que permite à tela mandar só o que a pessoa mexeu.
 */

export const runtime = 'nodejs';

const DESCRICAO_MAX = 300;
const NOME_MAX = 170;

const ehVisibilidade = (v: unknown): v is Visibilidade =>
  v === 'publico' || v === 'reservado' || v === 'privado';

export async function GET(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'indisponivel' }, { status: 503 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  const de = new URL(request.url).searchParams.get('de');

  if (de) {
    // Exige sessão mesmo para ver o de outro: perfil aberto "ao mundo" é o
    // mundo DESTE aplicativo, e não a internet inteira indexando.
    const perfil = await perfilPublico(de);
    if (!perfil) {
      return NextResponse.json({ ok: false, reason: 'nao-encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, perfil });
  }

  const perfil = await meuPerfil(session.user.id);
  if (!perfil) {
    return NextResponse.json({ ok: false, reason: 'nao-encontrado' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, perfil });
}

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'indisponivel' }, { status: 503 });
  }

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  const erros: Record<string, string> = {};

  const texto = (v: unknown, max: number): string | null | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim().slice(0, max);
    return t.length > 0 ? t : null;
  };

  const fullName = texto(body.fullName, NOME_MAX);
  const descricao = texto(body.descricao, DESCRICAO_MAX);

  /*
   * A DATA É CONFERIDA DE VERDADE, e não só pelo formato.
   *
   * Data no futuro é erro de digitação; idade acima de 120 também. E abaixo de
   * 13 anos a conta não deveria existir — a checagem fica aqui porque é o
   * único lugar por onde a data passa.
   */
  let nascimento: string | null | undefined;
  if (typeof body.nascimento === 'string') {
    const t = body.nascimento.trim();
    if (t === '') {
      nascimento = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      erros.nascimento = 'Data inválida.';
    } else {
      const d = new Date(`${t}T00:00:00Z`);
      const anos = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (Number.isNaN(d.getTime())) erros.nascimento = 'Data inválida.';
      else if (anos < 0) erros.nascimento = 'Essa data está no futuro.';
      else if (anos < 13) erros.nascimento = 'É preciso ter pelo menos 13 anos.';
      else if (anos > 120) erros.nascimento = 'Confira o ano de nascimento.';
      else nascimento = t;
    }
  }

  let visibilidade: Visibilidade | undefined;
  if (body.visibilidade !== undefined) {
    if (!ehVisibilidade(body.visibilidade)) erros.visibilidade = 'Opção inválida.';
    else visibilidade = body.visibilidade;
  }

  const avatarUrl = texto(body.avatarUrl, 500);

  if (Object.keys(erros).length > 0) {
    return NextResponse.json({ ok: false, errors: erros }, { status: 400 });
  }

  await gravarPerfil(session.user.id, {
    ...(fullName !== undefined && fullName !== null ? { fullName } : {}),
    ...(descricao !== undefined && descricao !== null ? { descricao } : {}),
    ...(nascimento !== undefined && nascimento !== null ? { nascimento } : {}),
    ...(avatarUrl !== undefined && avatarUrl !== null ? { avatarUrl } : {}),
    ...(visibilidade ? { visibilidade } : {}),
  });

  // Apagar é explícito: string vazia chegou como null acima, e o `coalesce` do
  // update ignoraria. Aqui é onde "apagar" acontece de verdade.
  if (descricao === null) await limparCampoDoPerfil(session.user.id, 'descricao');
  if (avatarUrl === null) await limparCampoDoPerfil(session.user.id, 'avatar_url');
  if (nascimento === null) await limparCampoDoPerfil(session.user.id, 'nascimento');

  return NextResponse.json({ ok: true, perfil: await meuPerfil(session.user.id) });
}
