import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Senha: derivação com scrypt, do próprio Node.
 *
 * POR QUE SCRYPT E NÃO BCRYPT/ARGON2: os dois exigem dependência nova, e o
 * bcrypt nativo ainda exige compilação. O scrypt está no `node:crypto` desde
 * sempre, é um KDF de senha legítimo (RFC 7914) e roda igual na Vercel e no
 * Fly. Zero dependência para uma coisa que precisa funcionar em qualquer
 * ambiente.
 *
 * POR QUE NÃO SHA-256 "COM SALT": hash rápido é o erro clássico. SHA-256 faz
 * bilhões de tentativas por segundo numa GPU. O scrypt é lento e come memória
 * DE PROPÓSITO — é isso que torna a força bruta cara.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Custo. N=16384, r=8, p=1 é o mínimo recomendado para senha; sai por volta de
 * 50-80ms e ~16 MB por verificação, que é aceitável numa função serverless e
 * caro o suficiente para quem tenta adivinhar em massa.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

const SALT_BYTES = 16;

/** Limites do que aceitamos como senha. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/**
 * O teto existe por segurança, não por capricho: sem ele, uma senha de 10 MB
 * viraria um jeito barato de ocupar CPU do servidor (o scrypt processaria tudo).
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'Senha inválida.';
  if (password.length < PASSWORD_MIN)
    return `A senha precisa de pelo menos ${PASSWORD_MIN} caracteres.`;
  if (password.length > PASSWORD_MAX)
    return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`;
  return null;
}

/** Guarda os parâmetros junto: dá para aumentar o custo depois sem invalidar as senhas antigas. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Comparação em tempo constante. Comparar com `===` vazaria, pelo tempo de
 * resposta, quantos bytes iniciais estavam certos.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const partes = stored.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const n = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let esperado: Buffer;
  try {
    salt = Buffer.from(partes[4]!, 'base64');
    esperado = Buffer.from(partes[5]!, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || esperado.length === 0) return false;

  let derivado: Buffer;
  try {
    derivado = await scrypt(password.normalize('NFKC'), salt, esperado.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }

  return derivado.length === esperado.length && timingSafeEqual(derivado, esperado);
}
