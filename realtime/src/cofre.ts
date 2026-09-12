/**
 * O cofre do que está esperando entrega.
 *
 * Enquanto a criptografia ponta a ponta não existe, o servidor CONSEGUE ler o
 * que guarda — foi a escolha feita para a caixa postal sair do papel. Isso não
 * é motivo para gravar conversa em texto puro numa tabela: um backup vazado, um
 * dump esquecido num bucket ou um `select *` num terminal de suporte viram a
 * transcrição inteira de todo mundo.
 *
 * Então o payload entra cifrado com uma chave do processo (`MESSAGE_KEY`), que
 * NÃO fica no banco. Quem tem só o banco não tem as mensagens; é preciso
 * juntar as duas coisas.
 *
 * O QUE ISTO NÃO É: ponta a ponta. A chave é do servidor, e quem controla o
 * servidor lê tudo. Essa é a diferença inteira, e é por isso que `enc` fica
 * gravado em cada linha — no dia em que a chave for dos aparelhos, o valor
 * muda e as linhas antigas continuam legíveis pelo caminho antigo.
 *
 * AES-256-GCM: cifra e autentica na mesma operação. Sem a autenticação, alguém
 * com acesso de escrita ao banco poderia virar bits do texto cifrado e o
 * servidor entregaria a mensagem adulterada sem perceber.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Marca que vai na coluna `enc`. Muda quando o esquema mudar. */
export const ENC_ATUAL = 'srv-v1';

const IV_BYTES = 12; // o tamanho recomendado para GCM
const TAG_BYTES = 16;

let chave: Buffer | null = null;
let jaOlhou = false;

/**
 * A chave, ou null se não houver.
 *
 * Sem chave, a caixa postal NÃO liga — o servidor sobe e o resto funciona. É o
 * mesmo padrão do resto do projeto: recurso sem configuração fica desligado, em
 * vez de degradar para uma versão pior em silêncio. A versão pior aqui seria
 * gravar tudo em texto puro.
 */
export function chaveDoCofre(): Buffer | null {
  if (jaOlhou) return chave;
  jaOlhou = true;

  const cru = process.env.MESSAGE_KEY?.trim();
  if (!cru) return null;

  const bytes = Buffer.from(cru, 'base64');
  if (bytes.length !== 32) {
    console.error(
      'MESSAGE_KEY precisa ser 32 bytes em base64 (gere com: openssl rand -base64 32). Caixa postal desligada.',
    );
    return null;
  }

  chave = bytes;
  return chave;
}

export const cofreLigado = (): boolean => chaveDoCofre() !== null;

/**
 * Guarda: `iv | tag | texto cifrado` num buffer só.
 *
 * Tudo junto porque o que o banco tem é uma coluna de bytes, e separar em três
 * colunas só criaria três chances de alguém gravar uma sem a outra.
 */
export function fechar(claro: Buffer): Buffer {
  const k = chaveDoCofre();
  if (!k) throw new Error('cofre sem chave');

  const iv = randomBytes(IV_BYTES);
  const cifra = createCipheriv('aes-256-gcm', k, iv);
  const cifrado = Buffer.concat([cifra.update(claro), cifra.final()]);
  return Buffer.concat([iv, cifra.getAuthTag(), cifrado]);
}

/** Abre. Devolve null se a autenticação falhar — bytes mexidos não viram mensagem. */
export function abrir(guardado: Buffer): Buffer | null {
  const k = chaveDoCofre();
  if (!k) return null;
  if (guardado.length <= IV_BYTES + TAG_BYTES) return null;

  try {
    const iv = guardado.subarray(0, IV_BYTES);
    const tag = guardado.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const cifrado = guardado.subarray(IV_BYTES + TAG_BYTES);

    const decifra = createDecipheriv('aes-256-gcm', k, iv);
    decifra.setAuthTag(tag);
    return Buffer.concat([decifra.update(cifrado), decifra.final()]);
  } catch {
    // Tag errada, chave trocada, bytes corrompidos: tudo dá no mesmo, e o
    // mesmo é "isto não é uma mensagem".
    return null;
  }
}
