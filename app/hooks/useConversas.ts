'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  apagarConversa as apagarNoDisco,
  carregarTudo,
  guardar,
  marcarEntrega,
  migrarDoLocalStorage,
  type MensagemGuardada,
} from '@/lib/chat/armazem';
import { deBase64, paraBase64, type TipoDeMidia } from '@/lib/chat/midia';
import { getSocket } from '@/lib/realtime/socket';
import type { Envelope, MsgErrorValue } from '@/realtime/shared/protocol';

/**
 * As conversas — pelo servidor, com histórico neste aparelho.
 *
 * POR QUE UM HOOK SEPARADO do `useLiveRealtime`. Aquele cuida do que só existe
 * ao vivo: quem está online, onde, e a chamada de vídeo. Conversa não é "ao
 * vivo": ela existe com a outra pessoa offline, sobrevive a fechar a aba e não
 * depende de negociação nenhuma. São dois ciclos de vida diferentes, e juntá-los
 * faria o estado de um morrer junto com o outro.
 *
 * O HISTÓRICO MORA AQUI, não no servidor. O servidor guarda só o que ainda não
 * foi entregue e apaga assim que entrega. Sem a cópia local, ler uma mensagem e
 * atualizar a página a perderia para sempre.
 *
 * E ELE MORA NO INDEXEDDB, não mais no localStorage: foto e áudio são `Blob`, e
 * o localStorage só guarda texto — em base64, inflado 33%, dentro de uma cota
 * de 5 MB que estoura em poucas dúzias de imagens, derrubando o histórico de
 * texto junto.
 */

export type EstadoDaEntrega = 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou';

export interface Mensagem {
  id: string;
  de: 'eu' | 'outro';
  tipo: 'texto' | 'imagem' | 'audio' | 'video';
  texto?: string;
  /** `blob:` URL criada nesta sessão a partir dos bytes guardados. */
  midiaUrl?: string;
  mime?: string;
  duracaoMs?: number;
  quando: number;
  entrega?: EstadoDaEntrega;
  erro?: MsgErrorValue;
}

export type Conversas = Record<string, Mensagem[]>;

const idNovo = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** O que viaja dentro do envelope opaco. */
interface CorpoDaMensagem {
  texto?: string;
  b64?: string;
  mime?: string;
  duracaoMs?: number;
}

function paraTela(g: MensagemGuardada): Mensagem {
  return {
    id: g.id,
    de: g.de,
    tipo: g.tipo,
    texto: g.texto,
    mime: g.mime,
    duracaoMs: g.duracaoMs,
    quando: g.quando,
    entrega: g.entrega as EstadoDaEntrega | undefined,
    erro: g.erro as MsgErrorValue | undefined,
    ...(g.midia ? { midiaUrl: URL.createObjectURL(g.midia) } : {}),
  };
}

export function useConversas(meuNickname?: string, socketPronto?: boolean) {
  const [conversas, setConversas] = useState<Conversas>({});
  const [abertaCom, setAbertaCom] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const abertaRef = useRef<string | null>(null);
  abertaRef.current = abertaCom;

  /**
   * O que foi escrito antes de a conexão existir.
   *
   * A conexão demora alguns segundos depois de a página abrir, e quem ia direto
   * conversar tocava em enviar sem que nada acontecesse. Agora a mensagem entra
   * na conversa na hora e espera aqui.
   */
  const filaRef = useRef<
    { msgId: string; para: string; kind: string; payload: string }[]
  >([]);

  /** Espelho para os handlers do socket, que são registrados uma vez só. */
  const conversasRef = useRef<Conversas>({});
  conversasRef.current = conversas;

  // --- Histórico do aparelho -------------------------------------------------

  useEffect(() => {
    let vivo = true;
    void (async () => {
      await migrarDoLocalStorage();
      const tudo = await carregarTudo();
      if (!vivo) return;
      const agrupado: Conversas = {};
      for (const g of tudo) {
        (agrupado[g.com] ??= []).push(paraTela(g));
      }
      setConversas(agrupado);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const acrescentar = useCallback((com: string, msg: Mensagem, midia?: Blob) => {
    setConversas((atual) => {
      const lista = atual[com] ?? [];
      // Dedupe pelo id: a mesma mensagem pode chegar duas vezes (entrega ao
      // vivo e depois a sincronização, se o ack se perdeu no meio).
      if (lista.some((m) => m.id === msg.id)) return atual;
      return { ...atual, [com]: [...lista, msg] };
    });

    void guardar({
      id: msg.id,
      com,
      de: msg.de,
      tipo: msg.tipo,
      texto: msg.texto,
      mime: msg.mime,
      duracaoMs: msg.duracaoMs,
      quando: msg.quando,
      entrega: msg.entrega,
      ...(midia ? { midia } : {}),
    });
  }, []);

  const mudarEntrega = useCallback((ids: string[], estado: EstadoDaEntrega) => {
    const alvo = new Set(ids);
    // A ordem importa: "entregue" não pode rebaixar "lida", e a rede reordena.
    const ordem: EstadoDaEntrega[] = ['enviando', 'enviada', 'entregue', 'lida'];
    setConversas((atual) => {
      const novo: Conversas = {};
      for (const [com, msgs] of Object.entries(atual)) {
        novo[com] = msgs.map((m) => {
          if (!alvo.has(m.id) || m.de !== 'eu') return m;
          if (ordem.indexOf(estado) <= ordem.indexOf(m.entrega ?? 'enviando')) return m;
          void marcarEntrega(m.id, estado);
          return { ...m, entrega: estado };
        });
      }
      return novo;
    });
  }, []);

  // --- Escuta do servidor ----------------------------------------------------

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !socketPronto) return;

    const aoChegar = (e: Envelope) => {
      let corpo: CorpoDaMensagem;
      try {
        corpo = JSON.parse(e.payload) as CorpoDaMensagem;
      } catch {
        return; // payload que não entendemos: ignorado, sem derrubar nada
      }

      const midia =
        corpo.b64 && corpo.mime ? deBase64(corpo.b64, corpo.mime) : undefined;

      acrescentar(
        e.from,
        {
          id: e.msgId,
          de: 'outro',
          tipo: e.kind,
          texto: corpo.texto,
          mime: corpo.mime,
          duracaoMs: corpo.duracaoMs,
          quando: new Date(e.sentAt).getTime(),
          ...(midia ? { midiaUrl: URL.createObjectURL(midia) } : {}),
        },
        midia,
      );

      /*
       * O ACK APAGA A MENSAGEM DO SERVIDOR.
       *
       * Mandar agora, e não quando a pessoa abrir a conversa, é o que faz o
       * servidor parar de guardar — ela já está neste aparelho.
       */
      socket.emit('msg:ack', { msgIds: [e.msgId] });
    };

    const aoAceitar = ({ msgId }: { msgId: string }) => mudarEntrega([msgId], 'enviada');
    const aoEntregar = ({ msgIds }: { msgIds: string[] }) =>
      mudarEntrega(msgIds, 'entregue');
    const aoLer = ({ msgIds }: { from: string; msgIds: string[] }) =>
      mudarEntrega(msgIds, 'lida');

    const aoFalhar = ({ msgId, code }: { msgId: string; code: MsgErrorValue }) => {
      setConversas((atual) => {
        const novo: Conversas = {};
        for (const [com, msgs] of Object.entries(atual)) {
          novo[com] = msgs.map((m) =>
            m.id === msgId ? { ...m, entrega: 'falhou' as const, erro: code } : m,
          );
        }
        return novo;
      });
      void marcarEntrega(msgId, 'falhou');
    };

    /**
     * Manda o que ficou esperando — a fila desta sessão e o que ficou preso de
     * sessões anteriores.
     *
     * A fila vive na memória: fechar a aba com algo por enviar perdia a fila,
     * mas não a mensagem, que continuava marcada como "enviando" e ficaria com
     * o relógio rodando para sempre. Repetir é seguro: o servidor guarda por
     * `msgId`, e a segunda cópia não vira uma segunda mensagem para ninguém.
     */
    const esvaziarFila = () => {
      const pendentes = filaRef.current;
      filaRef.current = [];
      for (const p of pendentes) {
        socket.emit('msg:send', {
          msgId: p.msgId,
          to: p.para,
          kind: p.kind as 'texto',
          payload: p.payload,
        });
      }

      for (const [com, msgs] of Object.entries(conversasRef.current)) {
        for (const m of msgs) {
          if (m.de !== 'eu' || m.entrega !== 'enviando') continue;
          // Só texto se reenvia sozinho. Refazer o payload de uma mídia exigiria
          // reler o blob do disco aqui dentro, e uma falha no meio deixaria a
          // varredura pela metade; mídia presa se reenvia pelo botão da bolha.
          if (m.tipo !== 'texto') continue;
          socket.emit('msg:send', {
            msgId: m.id,
            to: com,
            kind: 'texto',
            payload: JSON.stringify({ texto: m.texto ?? '' }),
          });
        }
      }
    };

    socket.on('msg:new', aoChegar);
    socket.on('msg:accepted', aoAceitar);
    socket.on('msg:delivered', aoEntregar);
    socket.on('msg:read', aoLer);
    socket.on('msg:failed', aoFalhar);
    socket.on('connect', esvaziarFila);
    if (socket.connected) esvaziarFila();

    socket.emit('msg:sync');

    return () => {
      socket.off('msg:new', aoChegar);
      socket.off('msg:accepted', aoAceitar);
      socket.off('msg:delivered', aoEntregar);
      socket.off('msg:read', aoLer);
      socket.off('msg:failed', aoFalhar);
      socket.off('connect', esvaziarFila);
    };
  }, [socketPronto, acrescentar, mudarEntrega]);

  // --- Envio -----------------------------------------------------------------

  const despachar = useCallback(
    (msgId: string, para: string, kind: string, payload: string) => {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('msg:send', { msgId, to: para, kind: kind as 'texto', payload });
      } else {
        filaRef.current.push({ msgId, para, kind, payload });
      }
    },
    [],
  );

  const enviarTexto = useCallback(
    (para: string, texto: string) => {
      const limpo = texto.trim().slice(0, 4000);
      if (!limpo || !para) return false;

      const msgId = idNovo();
      acrescentar(para, {
        id: msgId,
        de: 'eu',
        tipo: 'texto',
        texto: limpo,
        quando: Date.now(),
        entrega: 'enviando',
      });
      // O payload é opaco para o servidor. Hoje é este JSON; com criptografia
      // ponta a ponta vira texto cifrado, e nada no caminho muda.
      despachar(msgId, para, 'texto', JSON.stringify({ texto: limpo }));
      return true;
    },
    [acrescentar, despachar],
  );

  /**
   * Manda foto, áudio ou vídeo.
   *
   * Recebe a mídia JÁ PREPARADA (ver lib/chat/midia.ts): quem chama é que
   * encolhe a foto e confere o tamanho, porque é lá que dá para explicar à
   * pessoa o que aconteceu com o arquivo dela.
   */
  const enviarMidia = useCallback(
    async (
      para: string,
      tipo: TipoDeMidia,
      blob: Blob,
      mime: string,
      duracaoMs?: number,
    ) => {
      if (!para) return false;

      const msgId = idNovo();
      acrescentar(
        para,
        {
          id: msgId,
          de: 'eu',
          tipo,
          mime,
          duracaoMs,
          quando: Date.now(),
          entrega: 'enviando',
          midiaUrl: URL.createObjectURL(blob),
        },
        blob,
      );

      const b64 = await paraBase64(blob);
      despachar(msgId, para, tipo, JSON.stringify({ b64, mime, duracaoMs }));
      return true;
    },
    [acrescentar, despachar],
  );

  /** "Eu vi." Só faz sentido com a conversa aberta e a janela à vista. */
  const marcarLidas = useCallback((com: string) => {
    const socket = getSocket();
    if (!socket || !com) return;
    setConversas((atual) => {
      const msgs = atual[com] ?? [];
      const naoLidas = msgs.filter((m) => m.de === 'outro' && !m.entrega);
      if (naoLidas.length === 0) return atual;
      socket.emit('msg:read', { to: com, msgIds: naoLidas.map((m) => m.id) });
      const ids = new Set(naoLidas.map((m) => m.id));
      for (const id of ids) void marcarEntrega(id, 'lida');
      return {
        ...atual,
        [com]: msgs.map((m) => (ids.has(m.id) ? { ...m, entrega: 'lida' as const } : m)),
      };
    });
  }, []);

  const abrirConversa = useCallback((com: string) => setAbertaCom(com), []);
  const fecharConversa = useCallback(() => setAbertaCom(null), []);

  const apagarConversa = useCallback((com: string) => {
    void apagarNoDisco(com);
    setConversas((atual) => {
      const novo = { ...atual };
      delete novo[com];
      return novo;
    });
    setAbertaCom((aberta) => (aberta === com ? null : aberta));
  }, []);

  const naoLidasPorConversa = Object.fromEntries(
    Object.entries(conversas).map(([com, msgs]) => [
      com,
      msgs.filter((m) => m.de === 'outro' && !m.entrega).length,
    ]),
  );

  return {
    conversas,
    mensagensAbertas: abertaCom ? (conversas[abertaCom] ?? []) : [],
    abertaCom,
    naoLidasPorConversa,
    meuNickname,
    aviso,
    limparAviso: () => setAviso(null),
    avisar: setAviso,
    abrirConversa,
    fecharConversa,
    apagarConversa,
    enviarTexto,
    enviarMidia,
    marcarLidas,
  };
}
