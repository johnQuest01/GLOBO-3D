'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getSocket } from '@/lib/realtime/socket';
import type { Envelope, MsgErrorValue } from '@/realtime/shared/protocol';

/**
 * As conversas — agora pelo servidor, e não mais só de navegador a navegador.
 *
 * POR QUE UM HOOK SEPARADO do `useLiveRealtime`. Aquele cuida do que só existe
 * ao vivo: quem está online, onde, e a chamada de vídeo. Conversa deixou de ser
 * "ao vivo": ela existe com a outra pessoa offline, sobrevive a fechar a aba e
 * não depende de nenhuma negociação. São dois ciclos de vida diferentes, e
 * juntá-los faria o estado de um morrer junto com o outro — que é exatamente o
 * que acontecia antes, quando fechar o painel apagava tudo.
 *
 * O HISTÓRICO MORA AQUI, não no servidor. O servidor guarda só o que ainda não
 * foi entregue e apaga assim que entrega. Se este navegador não guardasse a
 * conversa, ler uma mensagem e atualizar a página a perderia para sempre.
 *
 * v1 GUARDA SÓ TEXTO. Foto e áudio ficam na memória da aba e somem ao
 * recarregar — o `localStorage` tem uns 5 MB no total, e duas dúzias de fotos
 * em base64 estouram isso e derrubam o histórico de texto junto. A mudança
 * certa é IndexedDB, e ela vem com a fase da mídia.
 */

export type EstadoDaEntrega = 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou';

export interface Mensagem {
  id: string;
  de: 'eu' | 'outro';
  tipo: 'texto' | 'imagem' | 'audio';
  texto?: string;
  midiaUrl?: string;
  duracaoMs?: number;
  quando: number;
  entrega?: EstadoDaEntrega;
  erro?: MsgErrorValue;
}

export type Conversas = Record<string, Mensagem[]>;

const CHAVE = 'globoConversas';
/** Teto por conversa no armazenamento local. O suficiente para rolar bastante. */
const MAX_GUARDADAS = 200;

const idNovo = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Só o que dá para reconstruir depois de fechar a aba. */
function paraGuardar(conversas: Conversas): Conversas {
  const saida: Conversas = {};
  for (const [com, msgs] of Object.entries(conversas)) {
    const texto = msgs
      .filter((m) => m.tipo === 'texto')
      .slice(-MAX_GUARDADAS)
      .map(({ midiaUrl: _ignora, ...resto }) => resto);
    if (texto.length > 0) saida[com] = texto;
  }
  return saida;
}

function lerDoDisco(): Conversas {
  if (typeof window === 'undefined') return {};
  try {
    const cru = localStorage.getItem(CHAVE);
    return cru ? (JSON.parse(cru) as Conversas) : {};
  } catch {
    return {};
  }
}

export function useConversas(meuNickname?: string, socketPronto?: boolean) {
  const [conversas, setConversas] = useState<Conversas>({});
  const [abertaCom, setAbertaCom] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  /** Espelho para os handlers do socket, que não veem o estado novo. */
  const abertaRef = useRef<string | null>(null);
  abertaRef.current = abertaCom;

  /**
   * O que foi escrito antes de a conexão existir.
   *
   * ISTO NASCEU DE UM DEFEITO RELATADO: quem abria o site e ia direto
   * conversar tocava em enviar e NADA acontecia — a mensagem não entrava na
   * lista, o campo não limpava, nenhum aviso aparecia. O envio simplesmente
   * desistia quando o socket ainda não estava de pé, e a inicialização do
   * globo demora vários segundos.
   *
   * Agora a mensagem sempre entra na conversa (com o relógio de "enviando") e
   * espera aqui. Quando a conexão abre, a fila sai na ordem. É o mesmo
   * princípio da caixa postal, um degrau antes: nada se perde por causa de
   * tempo.
   */
  const filaRef = useRef<{ msgId: string; para: string; payload: string }[]>([]);

  // O histórico volta do disco uma vez, no cliente. Em SSR não existe
  // localStorage, e ler no corpo do hook quebraria a hidratação.
  useEffect(() => {
    setConversas(lerDoDisco());
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(paraGuardar(conversas)));
    } catch {
      // Cota estourada: perder o histórico salvo é ruim, mas derrubar a
      // conversa aberta por causa disso seria pior.
    }
  }, [conversas, carregado]);

  const acrescentar = useCallback((com: string, msg: Mensagem) => {
    setConversas((atual) => {
      const lista = atual[com] ?? [];
      // Dedupe pelo id: a mesma mensagem pode chegar duas vezes (entrega ao
      // vivo e depois a sincronização, se o ack se perdeu no meio).
      if (lista.some((m) => m.id === msg.id)) return atual;
      return { ...atual, [com]: [...lista, msg] };
    });
  }, []);

  const mudarEntrega = useCallback(
    (ids: string[], estado: EstadoDaEntrega) => {
      const alvo = new Set(ids);
      // A ordem importa: entregue não pode rebaixar lida, e a rede reordena.
      const ordem: EstadoDaEntrega[] = ['enviando', 'enviada', 'entregue', 'lida'];
      setConversas((atual) => {
        const novo: Conversas = {};
        for (const [com, msgs] of Object.entries(atual)) {
          novo[com] = msgs.map((m) => {
            if (!alvo.has(m.id) || m.de !== 'eu') return m;
            const atualIdx = ordem.indexOf(m.entrega ?? 'enviando');
            const novoIdx = ordem.indexOf(estado);
            return novoIdx > atualIdx ? { ...m, entrega: estado } : m;
          });
        }
        return novo;
      });
    },
    [],
  );

  // --- Escuta do servidor ----------------------------------------------------

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !socketPronto) return;

    const aoChegar = (e: Envelope) => {
      let texto: string | undefined;
      try {
        const corpo = JSON.parse(e.payload) as { texto?: string };
        texto = typeof corpo.texto === 'string' ? corpo.texto : undefined;
      } catch {
        return; // payload que não entendemos: ignorado, sem derrubar nada
      }

      acrescentar(e.from, {
        id: e.msgId,
        de: 'outro',
        tipo: e.kind,
        texto,
        quando: new Date(e.sentAt).getTime(),
      });

      /*
       * O ACK APAGA A MENSAGEM DO SERVIDOR.
       *
       * Mandar agora, e não quando a pessoa abrir a conversa, é o que faz o
       * servidor parar de guardar — ela já está neste aparelho. O preço é que
       * "entregue" não quer dizer "visto"; quem cuida disso é o recibo de
       * leitura, que sai só quando a tela está de fato aberta.
       */
      socket.emit('msg:ack', { msgIds: [e.msgId] });
    };

    const aoAceitar = ({ msgId }: { msgId: string }) =>
      mudarEntrega([msgId], 'enviada');

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
    };

    /**
     * Manda o que ficou esperando.
     *
     * Roda no `connect` também, e não só uma vez: uma queda de rede no meio da
     * conversa deixa mensagens na fila, e elas precisam sair quando a conexão
     * voltar — sem a pessoa ter que reescrever nada.
     */
    const esvaziarFila = () => {
      const pendentes = filaRef.current;
      if (pendentes.length === 0) return;
      filaRef.current = [];
      for (const { msgId, para, payload } of pendentes) {
        socket.emit('msg:send', { msgId, to: para, kind: 'texto', payload });
      }
    };

    socket.on('msg:new', aoChegar);
    socket.on('msg:accepted', aoAceitar);
    socket.on('msg:delivered', aoEntregar);
    socket.on('msg:read', aoLer);
    socket.on('msg:failed', aoFalhar);
    socket.on('connect', esvaziarFila);
    if (socket.connected) esvaziarFila();

    // Pede o que ficou esperando. O servidor também manda sozinho ao conectar;
    // este pedido cobre o caso de a aba ter voltado do segundo plano.
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

  // --- Ações -----------------------------------------------------------------

  const enviarTexto = useCallback(
    (para: string, texto: string) => {
      const limpo = texto.trim().slice(0, 4000);
      if (!limpo || !para) return false;

      const msgId = idNovo();
      // O payload é uma string opaca para o servidor. Hoje é este JSON; com a
      // criptografia ponta a ponta, será o texto cifrado — e nada no caminho
      // entre aqui e o outro aparelho precisa mudar.
      const payload = JSON.stringify({ texto: limpo });

      // A mensagem entra na conversa SEMPRE, mesmo sem conexão. O que muda é
      // só o tique: ela fica no relógio até sair.
      acrescentar(para, {
        id: msgId,
        de: 'eu',
        tipo: 'texto',
        texto: limpo,
        quando: Date.now(),
        entrega: 'enviando',
      });

      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('msg:send', { msgId, to: para, kind: 'texto', payload });
      } else {
        filaRef.current.push({ msgId, para, payload });
      }
      return true;
    },
    [acrescentar],
  );

  /** "Eu vi." Só faz sentido com a conversa aberta e a janela à vista. */
  const marcarLidas = useCallback(
    (com: string) => {
      const socket = getSocket();
      if (!socket || !com) return;
      setConversas((atual) => {
        const msgs = atual[com] ?? [];
        const naoLidas = msgs.filter((m) => m.de === 'outro' && !m.entrega);
        if (naoLidas.length === 0) return atual;
        socket.emit('msg:read', { to: com, msgIds: naoLidas.map((m) => m.id) });
        const ids = new Set(naoLidas.map((m) => m.id));
        return {
          ...atual,
          [com]: msgs.map((m) =>
            ids.has(m.id) ? { ...m, entrega: 'lida' as const } : m,
          ),
        };
      });
    },
    [],
  );

  const abrirConversa = useCallback((com: string) => setAbertaCom(com), []);
  const fecharConversa = useCallback(() => setAbertaCom(null), []);

  const apagarConversa = useCallback((com: string) => {
    setConversas((atual) => {
      const novo = { ...atual };
      delete novo[com];
      return novo;
    });
    setAbertaCom((aberta) => (aberta === com ? null : aberta));
  }, []);

  /** Quantas mensagens do outro ainda não foram lidas, por conversa. */
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
    abrirConversa,
    fecharConversa,
    apagarConversa,
    enviarTexto,
    marcarLidas,
  };
}
