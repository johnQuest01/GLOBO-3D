/**
 * O nickname — a única coisa da pessoa que aparece na busca pública.
 *
 * Este arquivo não importa nada, nem do Node nem do DOM: as MESMAS regras
 * precisam valer no formulário (para avisar enquanto a pessoa digita) e na
 * rota (que é quem de fato decide). Duas cópias das regras viram duas regras
 * diferentes na primeira vez que uma delas mudar.
 */

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;

/**
 * Só letras sem acento, números e `_`, começando por letra.
 *
 * A restrição é contra falsificação de identidade, não contra teclado: com
 * acento e Unicode liberados, `brunо` com o "о" cirílico é um nickname
 * diferente de `bruno` e visualmente idêntico. Quem cai nisso é a pessoa que
 * clica em "Conectar" achando que é o amigo dela.
 */
const FORMATO = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * Nomes que passariam por conta oficial, ou que já significam outra coisa na
 * interface. Reservar é barato; recuperar depois de alguém se passar pelo
 * suporte, não.
 */
const RESERVADOS = new Set([
  'admin', 'administrador', 'administrator', 'root', 'sistema', 'system',
  'suporte', 'support', 'ajuda', 'help', 'globo', 'globo3d', 'meuglobo',
  'oficial', 'official', 'moderador', 'moderator', 'staff', 'equipe',
  'null', 'undefined', 'anonimo', 'anonymous', 'eu', 'you', 'voce',
]);

/** "  BrUnO_07 " -> "bruno_07". É esta forma que vai para o banco. */
export function normalizeNickname(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * Devolve a mensagem de erro, ou null quando está válido.
 *
 * Mensagem em vez de booleano porque quem chama SEMPRE precisa dizer à pessoa
 * o que houve — um `false` obrigaria cada chamador a reinventar o texto, e
 * eles divergiriam.
 */
export function validateNickname(valor: string): string | null {
  const nick = normalizeNickname(valor);

  if (!nick) return 'Escolha um nickname.';
  if (nick.length < NICKNAME_MIN) {
    return `O nickname precisa de pelo menos ${NICKNAME_MIN} caracteres.`;
  }
  if (nick.length > NICKNAME_MAX) {
    return `O nickname pode ter no máximo ${NICKNAME_MAX} caracteres.`;
  }
  if (!FORMATO.test(nick)) {
    return 'Use apenas letras sem acento, números e _ , começando por uma letra.';
  }
  if (RESERVADOS.has(nick)) return 'Esse nickname é reservado. Escolha outro.';

  return null;
}
