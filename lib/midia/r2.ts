/**
 * Assinatura de URLs para o armazenamento de mídia (Cloudflare R2).
 *
 * POR QUE A MÍDIA SAIU DO BANCO. Áudio, foto e vídeo viviam dentro da coluna
 * `payload` da tabela de mensagens, em base64 — que infla 33% — e cifrados.
 * Um áudio de um minuto ocupava 663 KB ali dentro. O Postgres é caro por byte e
 * ótimo por consulta; arquivo é exatamente o contrário. Cada mídia atravessava
 * o banco inteiro na ida e de novo a cada sincronização de cada aparelho.
 *
 * POR QUE R2 E NÃO S3: saída de dados de graça. Num aplicativo de conversa a
 * mesma mídia é baixada por vários aparelhos, e é a saída — não o
 * armazenamento — que faria a conta crescer.
 *
 * POR QUE ASSINAR À MÃO em vez de instalar o SDK da AWS: são sessenta linhas
 * de um algoritmo público e estável (SigV4), contra alguns megabytes de
 * dependência numa função que roda a cada foto enviada. O projeto já toma essa
 * decisão em outros lugares (o crachá do socket não usa JWT; os ícones do app
 * não usam biblioteca de imagem).
 *
 * O QUE ESTA ASSINATURA É: uma permissão temporária e específica — este
 * método, neste objeto, até esta hora. O segredo nunca sai do servidor; o
 * navegador recebe só a URL já assinada.
 */

import { createHash, createHmac } from 'node:crypto';

const ALGORITMO = 'AWS4-HMAC-SHA256';
/** R2 ignora região, mas o SigV4 exige uma no escopo. */
const REGIAO = 'auto';
const SERVICO = 's3';

export function r2Configurado(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_BUCKET?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim(),
  );
}

function config() {
  return {
    conta: process.env.R2_ACCOUNT_ID!.trim(),
    bucket: process.env.R2_BUCKET!.trim(),
    chaveId: process.env.R2_ACCESS_KEY_ID!.trim(),
    segredo: process.env.R2_SECRET_ACCESS_KEY!.trim(),
  };
}

const sha256 = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const hmac = (chave: Buffer | string, dados: string) =>
  createHmac('sha256', chave).update(dados).digest();

/**
 * Codifica um segmento de caminho para a URL canônica.
 *
 * `encodeURIComponent` deixa passar `!'()*`, que a AWS exige codificados — e
 * uma diferença de um caractere entre a URL e a string assinada faz o
 * armazenamento recusar com "assinatura não confere", sem dizer por quê.
 */
function escapar(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Uma URL que vale por alguns minutos para UM método sobre UM objeto.
 *
 * `PUT` para enviar, `GET` para buscar. Quem recebe a URL não recebe poder
 * nenhum além disso: não dá para listar o bucket, não dá para apagar, e
 * passado o prazo ela não vale mais nada.
 */
export function assinarUrl(
  metodo: 'PUT' | 'GET',
  chave: string,
  validadeSeg: number,
): string {
  const { conta, bucket, chaveId, segredo } = config();

  const host = `${conta}.r2.cloudflarestorage.com`;
  const caminho = `/${bucket}/${chave.split('/').map(escapar).join('/')}`;

  const agora = new Date();
  const iso = agora.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260912T221530Z
  const dia = iso.slice(0, 8);
  const escopo = `${dia}/${REGIAO}/${SERVICO}/aws4_request`;

  const query = new URLSearchParams({
    'X-Amz-Algorithm': ALGORITMO,
    'X-Amz-Credential': `${chaveId}/${escopo}`,
    'X-Amz-Date': iso,
    'X-Amz-Expires': String(validadeSeg),
    'X-Amz-SignedHeaders': 'host',
  });

  // A ordem dos parâmetros importa na string canônica; `sort` garante a mesma
  // ordem dos dois lados.
  query.sort();

  const canonico = [
    metodo,
    caminho,
    query.toString(),
    `host:${host}\n`,
    'host',
    // "UNSIGNED-PAYLOAD": o corpo não entra na assinatura. Ele não poderia —
    // quem assina é o servidor, e os bytes estão no navegador da pessoa.
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const paraAssinar = [ALGORITMO, iso, escopo, sha256(canonico)].join('\n');

  // A chave de assinatura é derivada em cascata (data, região, serviço): é o
  // que faz uma assinatura vazada valer só para aquele dia e serviço.
  const kData = hmac(`AWS4${segredo}`, dia);
  const kRegiao = hmac(kData, REGIAO);
  const kServico = hmac(kRegiao, SERVICO);
  const kAssinatura = hmac(kServico, 'aws4_request');
  const assinatura = createHmac('sha256', kAssinatura).update(paraAssinar).digest('hex');

  return `https://${host}${caminho}?${query.toString()}&X-Amz-Signature=${assinatura}`;
}

/**
 * O nome do objeto.
 *
 * ALEATÓRIO E LONGO de propósito: é ele que protege a mídia. A URL de leitura
 * é assinada pelo nosso servidor para quem estiver logado, mas nós não temos
 * como saber, no momento do pedido, se aquela pessoa é uma das duas da
 * conversa — a mensagem é opaca para o servidor. Então a chave funciona como
 * senha: ela viaja só dentro do envelope, que só as duas pontas leem.
 *
 * 32 bytes de aleatoriedade não se adivinham.
 */
export function chaveNova(extensao: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const nome = Buffer.from(bytes).toString('base64url');
  const dia = new Date().toISOString().slice(0, 10);
  // Prefixo por dia: faz a faxina por idade ser uma varredura de prefixo, e
  // não uma leitura de todo o bucket.
  return `m/${dia}/${nome}${extensao}`;
}

/** A extensão certa para o tipo, para o navegador não ter que adivinhar. */
export function extensaoDe(mime: string): string {
  if (mime.startsWith('image/jpeg')) return '.jpg';
  if (mime.startsWith('image/png')) return '.png';
  if (mime.startsWith('image/webp')) return '.webp';
  if (mime.startsWith('audio/webm')) return '.weba';
  if (mime.startsWith('audio/ogg')) return '.ogg';
  if (mime.startsWith('audio/mp4')) return '.m4a';
  if (mime.startsWith('audio/wav')) return '.wav';
  if (mime.startsWith('video/webm')) return '.webm';
  if (mime.startsWith('video/mp4')) return '.mp4';
  // Documentos: a extensao certa e' o que faz o navegador de quem recebe abrir
  // no visualizador em vez de baixar um arquivo sem nome.
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'application/zip') return '.zip';
  if (mime === 'text/plain') return '.txt';
  if (mime === 'text/csv') return '.csv';
  if (mime === 'text/markdown') return '.md';
  if (mime.includes('wordprocessingml')) return '.docx';
  if (mime.includes('spreadsheetml')) return '.xlsx';
  if (mime.includes('presentationml')) return '.pptx';
  if (mime === 'application/msword') return '.doc';
  if (mime === 'application/vnd.ms-excel') return '.xls';
  if (mime === 'application/vnd.ms-powerpoint') return '.ppt';
  return '.bin';
}
