'use client';

/**
 * Os avisos que chegam com o app fechado — do lado do navegador.
 *
 * QUANDO PEDIR A PERMISSÃO é a decisão que mais importa aqui, e pedir ao abrir
 * a página é o erro clássico: a pessoa acabou de chegar, ainda não sabe o que o
 * site faz, e o navegador registra a recusa PARA SEMPRE. Um "não" dado por
 * reflexo não tem volta — nem o app nem a pessoa conseguem reabrir aquela caixa
 * depois, só as configurações do navegador.
 *
 * Por isso o pedido nasce de um gesto: a pessoa abriu uma conversa. Naquele
 * momento "quer saber quando responderem?" é uma pergunta que se explica
 * sozinha.
 *
 * NO IPHONE SÓ FUNCIONA DEPOIS DE ADICIONAR À TELA DE INÍCIO. Não é limitação
 * nossa: o Safari só permite notificação para site instalado como app. No
 * navegador comum a API nem existe, e é por isso que este arquivo detecta e
 * explica, em vez de oferecer um botão que não faria nada.
 */

/** A chave pública do par VAPID. Sem ela, o navegador não aceita a inscrição. */
const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type EstadoDosAvisos =
  | 'indisponivel'
  | 'precisa-instalar'
  | 'pode-pedir'
  | 'ligados'
  | 'negados';

/** O navegador está rodando como app instalado? */
export function instalado(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // O Safari do iPhone não implementa `display-mode`; usa esta propriedade.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function ehIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPad moderno se anuncia como Mac; o toque é o que o entrega.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function estadoDosAvisos(): EstadoDosAvisos {
  if (typeof window === 'undefined') return 'indisponivel';
  if (!CHAVE_PUBLICA) return 'indisponivel';

  const temAPI =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  // No iPhone fora da tela de início a API simplesmente não existe. Dizer
  // "indisponível" seria verdade e inútil: há o que fazer, e é instalar.
  if (!temAPI) return ehIOS() && !instalado() ? 'precisa-instalar' : 'indisponivel';

  if (Notification.permission === 'granted') return 'ligados';
  if (Notification.permission === 'denied') return 'negados';
  if (ehIOS() && !instalado()) return 'precisa-instalar';
  return 'pode-pedir';
}

/** Registra o service worker. Idempotente: o navegador reaproveita o que já há. */
export async function registrarWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

/**
 * Pede a permissão e inscreve este aparelho.
 *
 * Devolve o estado final, e não um booleano, porque quem chama precisa mostrar
 * coisas diferentes para "negou" e "não dá neste navegador".
 */
export async function ligarAvisos(): Promise<EstadoDosAvisos> {
  const estado = estadoDosAvisos();
  if (estado !== 'pode-pedir' && estado !== 'ligados') return estado;

  if (Notification.permission !== 'granted') {
    const resposta = await Notification.requestPermission();
    if (resposta !== 'granted') return resposta === 'denied' ? 'negados' : 'pode-pedir';
  }

  const registro = await registrarWorker();
  if (!registro) return 'indisponivel';

  // Espera o worker assumir: inscrever antes disso falha em parte dos
  // navegadores, e falha de um jeito que parece "a permissão não pegou".
  await navigator.serviceWorker.ready;

  try {
    const jaTem = await registro.pushManager.getSubscription();
    const inscricao =
      jaTem ??
      (await registro.pushManager.subscribe({
        // Obrigatório: o navegador só aceita inscrição que sempre resulte em
        // notificação visível. Push silencioso para rastrear gente não passa.
        userVisibleOnly: true,
        applicationServerKey: paraUint8(CHAVE_PUBLICA),
      }));

    const bruto = inscricao.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    const r = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: bruto.endpoint, keys: bruto.keys }),
    });
    if (!r.ok) return 'indisponivel';

    return 'ligados';
  } catch {
    return 'indisponivel';
  }
}

/** Desliga neste aparelho: tira do navegador e do nosso banco. */
export async function desligarAvisos(): Promise<void> {
  const registro = await navigator.serviceWorker?.getRegistration('/');
  const inscricao = await registro?.pushManager.getSubscription();
  if (!inscricao) return;

  const endpoint = inscricao.endpoint;
  await inscricao.unsubscribe().catch(() => undefined);
  await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
}

/**
 * A chave vem em base64url e o navegador exige bytes.
 *
 * `atob` não entende base64url: ele quebra em `-` e `_`, e precisa do
 * preenchimento com `=`. Sem esta conversão a inscrição falha com um erro que
 * não diz nada sobre o motivo.
 */
function paraUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const preenchido = base64url.padEnd(
    base64url.length + ((4 - (base64url.length % 4)) % 4),
    '=',
  );
  const bruto = atob(preenchido.replace(/-/g, '+').replace(/_/g, '/'));
  // O tipo diz ArrayBuffer (e nao ArrayBufferLike) porque `applicationServerKey`
  // recusa memoria compartilhada. Construir a partir de um ArrayBuffer proprio
  // deixa isso explicito para o TypeScript, em vez de uma conversao forcada.
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}
