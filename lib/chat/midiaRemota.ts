'use client';

/**
 * Mandar e buscar mídia no armazenamento, do lado do navegador.
 *
 * O ARQUIVO NÃO PASSA PELO NOSSO SERVIDOR. Ele vai daqui direto para o
 * armazenamento, com uma permissão temporária que o servidor assinou. O que
 * viaja dentro da mensagem é só o nome do objeto — algumas dezenas de bytes no
 * lugar de centenas de milhares.
 *
 * O QUE ISSO DESTRAVA, além do custo: o teto de tamanho deixa de ser o do
 * envelope. Antes, a mídia ia em base64 dentro da mensagem, inflada em 33% e
 * limitada a ~1,5 MB; vídeo de celular quase nunca cabia.
 */

/** Quanto tempo uma URL de leitura fica guardada aqui antes de ser pedida de novo. */
const VALIDADE_CACHE_MS = 50 * 60 * 1000;

const cache = new Map<string, { url: string; em: number }>();

/**
 * O endereço público do armazenamento, quando houver um.
 *
 * COM ELE, A LEITURA NÃO PRECISA DE ASSINATURA: a URL é montada aqui mesmo, sem
 * ida ao servidor, e a Cloudflare serve o arquivo do cache dela. Numa conversa
 * com vinte fotos, são vinte pedidos a menos e um carregamento bem mais rápido.
 *
 * O QUE SE TROCA POR ISSO, dito sem rodeio: o arquivo passa a ser legível por
 * qualquer pessoa que tenha o link, sem login e sem prazo. O que protege é o
 * nome do objeto — 24 bytes sorteados, que viajam só dentro da mensagem —, mas
 * um link que vaze uma vez não fecha mais. Foi uma escolha consciente, e ela
 * vale só para a LEITURA: o envio continua exigindo assinatura do servidor,
 * porque escrita aberta deixaria qualquer um encher o balde.
 */
const BASE_PUBLICA = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

export interface MidiaEnviada {
  chave: string;
  mime: string;
  bytes: number;
}

/**
 * Sobe o arquivo e devolve o que vai dentro da mensagem.
 *
 * Devolve null em qualquer falha — quem chama mostra "não consegui enviar", e
 * distinguir "o armazenamento não está configurado" de "a rede caiu" não
 * mudaria nada para quem está esperando.
 */
export async function subirMidia(blob: Blob, mime: string): Promise<MidiaEnviada | null> {
  try {
    const pedido = await fetch('/api/midia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mime, bytes: blob.size }),
    });
    if (!pedido.ok) return null;

    const { chave, envio } = (await pedido.json()) as { chave: string; envio: string };

    const subida = await fetch(envio, {
      method: 'PUT',
      // O `content-type` PRECISA ser o mesmo que foi pedido: ele é devolvido
      // na leitura, e é por ele que o navegador decide se toca o áudio ou
      // oferece um download.
      headers: { 'content-type': mime },
      body: blob,
    });
    if (!subida.ok) return null;

    return { chave, mime, bytes: blob.size };
  } catch {
    return null;
  }
}

/**
 * A URL para ver/ouvir um objeto.
 *
 * GUARDADA EM MEMÓRIA porque uma conversa com vinte fotos pediria vinte
 * assinaturas a cada vez que fosse aberta. A validade daqui é menor que a da
 * assinatura de propósito: é melhor pedir uma URL nova antes da hora do que
 * entregar uma que vence no meio do download.
 */
export async function urlDaMidia(chave: string): Promise<string | null> {
  // Caminho direto: nada a pedir, nada a esperar.
  if (BASE_PUBLICA) return `${BASE_PUBLICA}/${chave}`;

  const guardada = cache.get(chave);
  if (guardada && Date.now() - guardada.em < VALIDADE_CACHE_MS) return guardada.url;

  try {
    const r = await fetch(`/api/midia?chave=${encodeURIComponent(chave)}`);
    if (!r.ok) return null;
    const { url } = (await r.json()) as { url: string };
    cache.set(chave, { url, em: Date.now() });
    return url;
  } catch {
    return null;
  }
}
