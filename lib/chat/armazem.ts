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
const VERSAO = 1;
const LOJA = 'mensagens';
/** Chave do formato antigo, migrado uma vez e apagado. */
const CHAVE_ANTIGA = 'globoConversas';

export interface MensagemGuardada {
  id: string;
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
      if (!db.objectStoreNames.contains(LOJA)) {
        const loja = db.createObjectStore(LOJA, { keyPath: 'id' });
        // Buscar "as mensagens desta conversa" é a única consulta que existe.
        loja.createIndex('com', 'com', { unique: false });
      }
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

export async function carregarTudo(): Promise<MensagemGuardada[]> {
  const db = await abrir();
  if (!db) return [];
  try {
    const tx = db.transaction(LOJA, 'readonly');
    const tudo = await comoPromessa(
      tx.objectStore(LOJA).getAll() as IDBRequest<MensagemGuardada[]>,
    );
    return tudo.sort((a, b) => a.quando - b.quando);
  } catch {
    return [];
  }
}

export async function apagarConversa(com: string): Promise<void> {
  const db = await abrir();
  if (!db) return;
  try {
    const tx = db.transaction(LOJA, 'readwrite');
    const loja = tx.objectStore(LOJA);
    const chaves = await comoPromessa(
      loja.index('com').getAllKeys(com) as IDBRequest<IDBValidKey[]>,
    );
    for (const chave of chaves) loja.delete(chave);
  } catch {
    /* idem */
  }
}

/**
 * Traz o histórico de texto que ficou no formato antigo.
 *
 * Roda uma vez: quem já estava conversando não perde o que disse só porque o
 * armazenamento mudou de lugar. Depois de copiar, apaga a chave velha — deixar
 * as duas cópias convidaria a uma delas ficar para trás e confundir a próxima
 * pessoa que olhar isto.
 */
export async function migrarDoLocalStorage(): Promise<number> {
  if (typeof localStorage === 'undefined') return 0;
  const cru = localStorage.getItem(CHAVE_ANTIGA);
  if (!cru) return 0;

  let total = 0;
  try {
    const antigo = JSON.parse(cru) as Record<
      string,
      { id: string; de: 'eu' | 'outro'; texto?: string; quando: number; entrega?: string }[]
    >;
    for (const [com, msgs] of Object.entries(antigo)) {
      for (const m of msgs) {
        await guardar({
          id: m.id,
          com,
          de: m.de,
          tipo: 'texto',
          texto: m.texto,
          quando: m.quando,
          entrega: m.entrega,
        });
        total += 1;
      }
    }
  } catch {
    /* formato irreconhecível: melhor ignorar do que abortar a abertura do chat */
  }

  localStorage.removeItem(CHAVE_ANTIGA);
  return total;
}
