'use client';

/**
 * Onde a conversa fica guardada NESTE aparelho.
 *
 * POR QUE INDEXEDDB E NÃO localStorage. O servidor apaga a mensagem assim que
 * entrega, então o histórico só existe aqui — e `localStorage` tem dois
 * defeitos fatais para isso: guarda no máximo ~5 MB no total do site, e só
 * guarda texto. Foto e áudio precisariam virar base64, que incha 33% e estoura
 * a cota em poucas dúzias de imagens. Quando a cota estoura, a gravação falha
 * INTEIRA — ou seja, uma foto a mais apagaria o histórico de texto junto.
 *
 * O IndexedDB guarda `Blob` nativo, sem base64, e tem cota na casa das
 * centenas de megabytes.
 *
 * O QUE FICA GUARDADO: os bytes da mídia, não a `blob:` URL. Aquela URL é um
 * apontador para a memória da aba e morre quando a aba fecha — guardá-la
 * devolveria, no dia seguinte, uma foto que não carrega.
 */

const BANCO = 'globoChat';
const VERSAO = 2;
const LOJA = 'mensagens';
/** Chave do formato antigo, migrado uma vez e apagado. */
const CHAVE_ANTIGA = 'globoConversas';

export interface MensagemGuardada {
  id: string;
  /**
   * De quem é este histórico — o nickname do DONO da conta, não do par.
   *
   * O IndexedDB é do site, não da conta. Sem este campo, sair da conta e
   * entrar com outra no mesmo navegador mostrava as conversas da pessoa
   * anterior: foi visto em teste, com uma conta exibindo "Você: vídeo" numa
   * conversa que era de outra.
   */
  conta: string;
  /** Com quem é a conversa (o nickname do outro). Também é o índice. */
  com: string;
  de: 'eu' | 'outro';
  tipo: 'texto' | 'imagem' | 'audio' | 'video';
  texto?: string;
  midia?: Blob;
  mime?: string;
  duracaoMs?: number;
  quando: number;
  entrega?: string;
  erro?: string;
}

let promessa: Promise<IDBDatabase | null> | null = null;

function abrir(): Promise<IDBDatabase | null> {
  if (promessa) return promessa;

  promessa = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const pedido = indexedDB.open(BANCO, VERSAO);

    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      /*
       * A VERSÃO 2 APAGA O QUE A 1 GUARDOU, e isso é seguro agora.
       *
       * As linhas antigas não dizem de que conta são, e adivinhar seria
       * justamente o vazamento que este campo existe para fechar. Apagar
       * deixou de custar histórico no dia em que ele passou a viver no
       * servidor: o aparelho sincroniza de novo, agora com a conta certa.
       */
      if (pedido.transaction && db.objectStoreNames.contains(LOJA)) {
        db.deleteObjectStore(LOJA);
      }

      const loja = db.createObjectStore(LOJA, { keyPath: 'id' });
      // Buscar "as mensagens desta conversa" é a única consulta que existe.
      loja.createIndex('com', 'com', { unique: false });
      // E "as mensagens desta conta", que é o filtro de tudo.
      loja.createIndex('conta', 'conta', { unique: false });
    };

    pedido.onsuccess = () => resolve(pedido.result);
    // Navegador em janela privada, ou usuário que bloqueou armazenamento:
    // devolve null e o chat funciona sem histórico, em vez de quebrar.
    pedido.onerror = () => resolve(null);
  });

  return promessa;
}

function comoPromessa<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

/** Guarda (ou atualiza) uma mensagem. */
export async function guardar(msg: MensagemGuardada): Promise<void> {
  const db = await abrir();
  if (!db) return;
  try {
    const tx = db.transaction(LOJA, 'readwrite');
    tx.objectStore(LOJA).put(msg);
    await new Promise((r) => {
      tx.oncomplete = r;
      tx.onerror = r;
    });
  } catch {
    /* cota ou banco fechado: perder o histórico é ruim, travar a conversa é pior */
  }
}

/** Muda só o estado de entrega, sem reescrever a mídia. */
export async function marcarEntrega(id: string, entrega: string): Promise<void> {
  const db = await abrir();
  if (!db) return;
  try {
    const tx = db.transaction(LOJA, 'readwrite');
    const loja = tx.objectStore(LOJA);
    const atual = await comoPromessa(loja.get(id) as IDBRequest<MensagemGuardada>);
    if (atual) loja.put({ ...atual, entrega });
  } catch {
    /* idem */
  }
}

/** Só o histórico DESTA conta. Sem conta, nada — e não "tudo". */
export async function carregarTudo(conta: string): Promise<MensagemGuardada[]> {
  const db = await abrir();
  if (!db || !conta) return [];
  try {
    const tx = db.transaction(LOJA, 'readonly');
    const tudo = await comoPromessa(
      tx.objectStore(LOJA).index('conta').getAll(conta) as IDBRequest<
        MensagemGuardada[]
      >,
    );
    return tudo.sort((a, b) => a.quando - b.quando);
  } catch {
    return [];
  }
}

export async function apagarConversa(conta: string, com: string): Promise<void> {
  const db = await abrir();
  if (!db) return;
  try {
    const tx = db.transaction(LOJA, 'readwrite');
    const loja = tx.objectStore(LOJA);
    // Pelo par, e depois filtrando pela conta: apagar "a conversa com fulano"
    // não pode apagar a conversa que OUTRA conta teve com a mesma pessoa
    // neste mesmo navegador.
    const desteePar = await comoPromessa(
      loja.index('com').getAll(com) as IDBRequest<MensagemGuardada[]>,
    );
    for (const m of desteePar) if (m.conta === conta) loja.delete(m.id);
  } catch {
    /* idem */
  }
}

/**
 * Limpa o formato mais antigo de todos, que vivia no localStorage.
 *
 * Antes isto MIGRAVA aquele histórico. Deixou de migrar quando as mensagens
 * passaram a ser guardadas por conta: aquele formato não dizia de quem era, e
 * adivinhar seria o vazamento que a coluna `conta` fecha. Apagar não custa
 * nada agora — o servidor tem o histórico e o aparelho o traz de volta.
 */
export function limparFormatoAntigo(): void {
  try {
    localStorage.removeItem(CHAVE_ANTIGA);
  } catch {
    /* nada a fazer */
  }
}

