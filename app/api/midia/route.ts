import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { assinarUrl, chaveNova, extensaoDe, r2Configurado } from '@/lib/midia/r2';
import { getSession } from '@/lib/auth/session';

/**
 * As permissões temporárias para enviar e buscar mídia.
 *
 * OS BYTES NÃO PASSAM POR AQUI, e é esse o ponto. Esta rota só assina uma URL;
 * o navegador fala direto com o armazenamento. Fazer o arquivo atravessar o
 * servidor dobraria o tráfego, esbarraria no limite de corpo da função
 * serverless e transformaria cada foto num custo de computação.
 *
 * EXIGE SESSÃO nas duas direções: assinar é dar acesso ao armazenamento, e
 * isso não se dá a quem não entrou.
 */

export const runtime = 'nodejs';

/** Tempo de vida das permissões. Curto: elas são para usar agora. */
const VALIDADE_ENVIO_SEG = 5 * 60;
const VALIDADE_LEITURA_SEG = 60 * 60;

/** O maior arquivo aceito. O limite real é a paciência de quem espera subir. */
const BYTES_MAX = 25 * 1024 * 1024;

const TIPOS_ACEITOS = /^(image|audio|video)\//;

/** POST: "vou mandar um arquivo deste tipo" → devolve para onde enviar. */
export async function POST(request: Request) {
  if (!getSecret() || !r2Configurado()) {
    return NextResponse.json({ ok: false, reason: 'sem-armazenamento' }, { status: 503 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  let body: { mime?: unknown; bytes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  const mime = typeof body.mime === 'string' ? body.mime.split(';')[0]!.trim() : '';
  const bytes = Number(body.bytes);

  if (!TIPOS_ACEITOS.test(mime)) {
    return NextResponse.json({ ok: false, reason: 'tipo-nao-aceito' }, { status: 400 });
  }
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > BYTES_MAX) {
    return NextResponse.json({ ok: false, reason: 'tamanho' }, { status: 400 });
  }

  const chave = chaveNova(extensaoDe(mime));

  return NextResponse.json({
    ok: true,
    chave,
    envio: assinarUrl('PUT', chave, VALIDADE_ENVIO_SEG),
  });
}

/**
 * GET: "me dê como ver este arquivo" → devolve uma URL de leitura.
 *
 * NÃO CONFERIMOS SE ESTA PESSOA É DONA DA CONVERSA, e a razão é que não temos
 * como: a mensagem é opaca para o servidor, que não sabe quem conversa com
 * quem dentro dela. Quem protege a mídia é o nome do objeto — 24 bytes
 * aleatórios que viajam só dentro do envelope, e que portanto só as duas
 * pontas conhecem.
 *
 * A troca é explícita: quem tiver a chave vê o arquivo. Quem não tiver não
 * consegue adivinhá-la, e listar o bucket não é permitido por nenhuma
 * assinatura que este servidor emite.
 */
export async function GET(request: Request) {
  if (!getSecret() || !r2Configurado()) {
    return NextResponse.json({ ok: false, reason: 'sem-armazenamento' }, { status: 503 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  const chave = new URL(request.url).searchParams.get('chave') ?? '';

  // Só o formato que nós mesmos geramos. Sem isto, um `..` no caminho viraria
  // uma assinatura para um objeto fora da área da mídia.
  if (!/^m\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{20,48}\.[a-z0-9]{2,5}$/.test(chave)) {
    return NextResponse.json({ ok: false, reason: 'chave-invalida' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    url: assinarUrl('GET', chave, VALIDADE_LEITURA_SEG),
  });
}
