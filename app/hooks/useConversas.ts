'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  apagarConversa as apagarNoDisco,
  carregarTudo,
  guardar,
  marcarEntrega,
  limparFormatoAntigo,
  VERSAO_DO_ARMAZEM,
  type MensagemGuardada,
} from '@/lib/chat/armazem';
import { BYTES_MAX, deBase64, paraBase64, type TipoDeMidia } from '@/lib/chat/midia';
import { subirMidia, urlDaMidia } from '@/lib/chat/midiaRemota';
import { getSocket } from '@/lib/realtime/socket';
import {
  TYPING_PING_MS,
  TYPING_TTL_MS,
  type Envelope,
  type MsgErrorValue,
} from '@/realtime/shared/protocol';

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
  tipo: 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
  /** So' em documento: o nome do arquivo. */
  nome?: string;
  /** So' em documento: o tamanho, para a pessoa saber antes de baixar. */
  bytes?: number;
  texto?: string;
  /** `blob:` URL criada nesta sessão a partir dos bytes guardados. */
  midiaUrl?: string;
  /** O objeto no armazenamento, quando a mídia não está neste aparelho. */
  chave?: string;
  mime?: string;
  duracaoMs?: number;
  quando: number;
  entrega?: EstadoDaEntrega;
  erro?: MsgErrorValue;
}

export type Conversas = Record<string, Mensagem[]>;

/**
 * Até onde este aparelho já sincronizou.
 *
 * Fica no `localStorage` e não no IndexedDB de propósito: é UM valor, lido no
 * instante em que a conexão abre, e esperar uma transação de banco para
 * descobrir o que pedir atrasaria a única coisa que a pessoa está esperando.
 *
 * Perder este valor não perde mensagem: sem ele o aparelho pede o histórico
 * inteiro e o dedupe por id cuida do resto.
 */
const CHAVE_CORTE = 'globoUltimaSync';

/** Uma chave por conta: dois logins no mesmo navegador nao compartilham corte. */
const chaveDoCorte = (conta: string) =>
  `${CHAVE_CORTE}:v${VERSAO_DO_ARMAZEM}:${conta}`;

function lerCorte(conta: string): string | null {
  try {
    return conta ? localStorage.getItem(chaveDoCorte(conta)) : null;
  } catch {
    return null;
  }
}

function guardarCorte(conta: string, sentAt: string): void {
  if (!conta) return;
  try {
    const atual = localStorage.getItem(chaveDoCorte(conta));
    // Só anda para a frente: a sincronização entrega em ordem, mas a entrega ao
    // vivo pode chegar no meio, e recuar o corte faria o aparelho rebaixar o
    // que já tinha.
    if (!atual || sentAt > atual) localStorage.setItem(chaveDoCorte(conta), sentAt);
  } catch {
    /* sem localStorage o aparelho sincroniza tudo de novo; nao perde nada */
  }
}

const idNovo = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** O que viaja dentro do envelope opaco. */
interface CorpoDaMensagem {
  texto?: string;
  /** O caminho novo: só o nome do objeto. */
  chave?: string;
  /** O caminho antigo: os bytes inteiros. Mantido para ler o que já foi enviado. */
  b64?: string;
  mime?: string;
  duracaoMs?: number;
  /** Documento: o nome escolhido por quem enviou, e o tamanho. */
  nome?: string;
  bytes?: number;
}

function paraTela(g: MensagemGuardada): Mensagem {
  return {
    id: g.id,
    de: g.de,
    tipo: g.tipo,
    texto: g.texto,
    mime: g.mime,
    duracaoMs: g.duracaoMs,
    nome: g.nome,
    quando: g.quando,
    chave: g.chave,
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

  /**
   * Quem está escrevendo para mim agora, por nickname.
   *
   * Um mapa e não um booleano: duas pessoas podem estar escrevendo ao mesmo
   * tempo, e a lista de conversas mostra isso em cada linha.
   */
  const [digitando, setDigitando] = useState<Record<string, boolean>>({});

  /** Os relógios que apagam cada "digitando" quando o aviso envelhece. */
  const apagarDigitandoRef = useRef<Map<string, number>>(new Map());

  /** Quando avisei, pela última vez, que estou escrevendo para cada pessoa. */
  const aviseiEmRef = useRef<Map<string, number>>(new Map());

  /** O relógio que manda o "parei" depois de a pessoa parar de teclar. */
  const pareiRef = useRef<number | null>(null);

  /** Espelho para os handlers do socket, que são registrados uma vez só. */
  const conversasRef = useRef<Conversas>({});
  conversasRef.current = conversas;

  // --- Histórico do aparelho -------------------------------------------------

  useEffect(() => {
    let vivo = true;

    // Trocou de conta neste navegador: a tela nao pode ficar com o que era da
    // anterior enquanto o historico novo carrega.
    setConversas({});
    if (!meuNickname) return;

    void (async () => {
      limparFormatoAntigo();
      const tudo = await carregarTudo(meuNickname);
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
  }, [meuNickname]);

  const acrescentar = useCallback((com: string, msg: Mensagem, midia?: Blob) => {
    /*
     * JA' CONHECO ESTA MENSAGEM?
     *
     * A pergunta precisa ser feita AQUI, e não só dentro do `setConversas`, por
     * causa do que vem depois: a gravação em disco. A mesma mensagem chega
     * duas vezes com facilidade — entrega ao vivo e, depois, a sincronização,
     * quando o ack se perdeu no meio.
     *
     * Enquanto a gravação acontecia sempre, a segunda cópia REESCREVIA a linha
     * do disco com `entrega` vazia — apagando o "lida" que a pessoa tinha
     * acabado de produzir ao abrir a conversa. O sintoma: sair da conversa,
     * voltar, e reencontrar como não lidas as mensagens que ela já tinha lido.
     */
    const jaTenho = (conversasRef.current[com] ?? []).some((m) => m.id === msg.id);

    setConversas((atual) => {
      const lista = atual[com] ?? [];
      if (lista.some((m) => m.id === msg.id)) return atual;
      return { ...atual, [com]: [...lista, msg] };
    });

    if (jaTenho) return;

    void guardar({
      id: msg.id,
      conta: meuNickname ?? '',
      com,
      de: msg.de,
      tipo: msg.tipo,
      texto: msg.texto,
      mime: msg.mime,
      duracaoMs: msg.duracaoMs,
      quando: msg.quando,
      entrega: msg.entrega,
      ...(msg.nome ? { nome: msg.nome } : {}),
      ...(msg.chave ? { chave: msg.chave } : {}),
      ...(midia ? { midia } : {}),
    });
  }, [meuNickname]);

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

      /*
       * DOIS FORMATOS, e o antigo precisa continuar sendo lido.
       *
       * O novo traz só o nome do objeto; a mídia é buscada do armazenamento
       * quando a conversa for aberta. O antigo trazia os bytes dentro da
       * mensagem — e as mensagens que já foram enviadas assim continuam no
       * servidor até vencerem. Descartar o formato velho apagaria conversa de
       * gente.
       */
      const midia =
        corpo.b64 && corpo.mime ? deBase64(corpo.b64, corpo.mime) : undefined;

      /*
       * COM QUEM É ESTA CONVERSA?
       *
       * Nem sempre é com quem mandou. Desde que o histórico passou a viver no
       * servidor, o meu outro aparelho recebe de volta as mensagens que EU
       * mandei — e a conversa delas é com quem as recebeu, não comigo. Colocar
       * pelo remetente criaria uma conversa comigo mesmo.
       */
      const minha = Boolean(e.minha);
      const com = minha ? (e.to ?? '') : e.from;
      if (!com) return;

      const quando = new Date(e.sentAt).getTime();

      acrescentar(
        com,
        {
          id: e.msgId,
          de: minha ? 'eu' : 'outro',
          tipo: e.kind,
          texto: corpo.texto,
          mime: corpo.mime,
          duracaoMs: corpo.duracaoMs,
          nome: corpo.nome,
          bytes: corpo.bytes,
          quando,
          ...(corpo.chave ? { chave: corpo.chave } : {}),
          /*
           * O ESTADO VEM DO SERVIDOR NOS DOIS SENTIDOS.
           *
           * Nas MINHAS ele diz se chegou e se foi lida — o tique. Nas que
           * RECEBI ele diz se eu ja' as li em ALGUM aparelho: sem isso, tudo o
           * que a pessoa leu no celular reapareceria como nao lido no
           * computador, que e' metade do sentido de sincronizar.
           */
          ...(minha
            ? { entrega: (e.lida ? 'lida' : e.entregue ? 'entregue' : 'enviada') as EstadoDaEntrega }
            : e.lida
              ? { entrega: 'lida' as EstadoDaEntrega }
              : {}),
          ...(midia ? { midiaUrl: URL.createObjectURL(midia) } : {}),
        },
        midia,
      );

      // O corte anda para a frente com a mensagem mais nova que este aparelho
      // viu. É o que a próxima sincronização vai perguntar.
      guardarCorte(meuNickname ?? '', e.sentAt);

      /*
       * O ACK NÃO APAGA MAIS NADA — ele carimba "chegou".
       *
       * Só faz sentido para o que recebi: avisar que a minha própria mensagem
       * chegou até mim não quer dizer coisa nenhuma.
       */
      if (!minha) socket.emit('msg:ack', { msgIds: [e.msgId] });
    };

    const aoAceitar = ({ msgId, sentAt }: { msgId: string; sentAt: string }) => {
      mudarEntrega([msgId], 'enviada');
      /*
       * O CORTE ANDA TAMBEM COM O QUE EU MANDO.
       *
       * Sem isto, a proxima sincronizacao devolveria as minhas proprias
       * mensagens — com as fotos e os audios dentro — para um aparelho que ja'
       * as tem guardadas. E' seguro avancar aqui porque o servidor devolve
       * SEMPRE o que ainda nao foi entregue a ninguem, independente do corte
       * (ver o `where` em realtime/src/db.ts).
       */
      guardarCorte(meuNickname ?? '', sentAt);
    };
    const aoEntregar = ({ msgIds }: { msgIds: string[] }) =>
      mudarEntrega(msgIds, 'entregue');
    const aoLer = ({ msgIds }: { from: string; msgIds: string[] }) =>
      mudarEntrega(msgIds, 'lida');

    /*
     * O "digitando…" do outro lado.
     *
     * APAGA SOZINHO, sempre. O "parei de escrever" pode nunca chegar — a aba
     * fecha, o metrô entra no túnel, o celular dorme —, e um aviso que só
     * apaga quando avisam ficaria aceso para sempre, mentindo. Por isso cada
     * aviso vale por um tempo e é o relógio daqui que o desliga; quem escreve
     * repete o aviso enquanto estiver escrevendo.
     */
    const aoDigitar = ({ from, typing }: { from: string; typing: boolean }) => {
      const quem = from.toLowerCase();
      const antigo = apagarDigitandoRef.current.get(quem);
      if (antigo) window.clearTimeout(antigo);

      if (!typing) {
        apagarDigitandoRef.current.delete(quem);
        setDigitando((atual) => {
          if (!atual[quem]) return atual;
          const novo = { ...atual };
          delete novo[quem];
          return novo;
        });
        return;
      }

      setDigitando((atual) => (atual[quem] ? atual : { ...atual, [quem]: true }));
      apagarDigitandoRef.current.set(
        quem,
        window.setTimeout(() => {
          apagarDigitandoRef.current.delete(quem);
          setDigitando((atual) => {
            if (!atual[quem]) return atual;
            const novo = { ...atual };
            delete novo[quem];
            return novo;
          });
        }, TYPING_TTL_MS),
      );
    };

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

    socket.on('msg:typing', aoDigitar);
    socket.on('msg:new', aoChegar);
    socket.on('msg:accepted', aoAceitar);
    socket.on('msg:delivered', aoEntregar);
    socket.on('msg:read', aoLer);
    socket.on('msg:failed', aoFalhar);
    const aoConectar = () => {
      esvaziarFila();
      // Reconectou: pergunta o que perdeu enquanto esteve fora.
      socket.emit('msg:sync', { desde: lerCorte(meuNickname ?? '') });
    };
    socket.on('connect', aoConectar);
    if (socket.connected) esvaziarFila();

    /*
     * PEDE SÓ O QUE FALTA.
     *
     * O corte é o instante da mensagem mais nova que este aparelho tem. Sem
     * ele, cada reconexão de celular baixaria o histórico inteiro de novo —
     * com as fotos e os áudios dentro.
     */
    socket.emit('msg:sync', { desde: lerCorte(meuNickname ?? '') });

    return () => {
      socket.off('msg:typing', aoDigitar);
      socket.off('msg:new', aoChegar);
      socket.off('msg:accepted', aoAceitar);
      socket.off('msg:delivered', aoEntregar);
      socket.off('msg:read', aoLer);
      socket.off('msg:failed', aoFalhar);
      socket.off('connect', aoConectar);
    };
  }, [socketPronto, acrescentar, mudarEntrega, meuNickname]);

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

  /**
   * "Estou escrevendo para fulano."
   *
   * Chamada a cada tecla, mas só vira evento de rede uma vez a cada
   * `TYPING_PING_MS`. Sem esse freio, escrever uma frase mandaria dezenas de
   * eventos pela rede do celular para dizer sempre a mesma coisa.
   *
   * O "parei" sai por conta própria depois de um tempo sem teclar — e também
   * ao enviar, porque quem enviou obviamente parou.
   */
  const avisarQueEstouEscrevendo = useCallback((para: string) => {
    const socket = getSocket();
    if (!socket?.connected || !para) return;

    const agora = Date.now();
    const ultimo = aviseiEmRef.current.get(para) ?? 0;
    if (agora - ultimo >= TYPING_PING_MS) {
      aviseiEmRef.current.set(para, agora);
      socket.emit('msg:typing', { to: para, typing: true });
    }

    if (pareiRef.current) window.clearTimeout(pareiRef.current);
    pareiRef.current = window.setTimeout(() => {
      pareiRef.current = null;
      aviseiEmRef.current.delete(para);
      getSocket()?.emit('msg:typing', { to: para, typing: false });
    }, TYPING_PING_MS);
  }, []);

  /** Encerra o aviso na hora. Usado ao enviar e ao fechar a conversa. */
  const pararDeAvisar = useCallback((para: string) => {
    if (pareiRef.current) {
      window.clearTimeout(pareiRef.current);
      pareiRef.current = null;
    }
    if (!para) return;
    if (aviseiEmRef.current.delete(para)) {
      getSocket()?.emit('msg:typing', { to: para, typing: false });
    }
  }, []);

  const enviarTexto = useCallback(
    (para: string, texto: string) => {
      const limpo = texto.trim().slice(0, 4000);
      if (!limpo || !para) return false;

      pararDeAvisar(para);

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
    [acrescentar, despachar, pararDeAvisar],
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
      /** So' documento usa: sem o nome, o arquivo chega sem rotulo nenhum. */
      nome?: string,
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
          nome,
          bytes: blob.size,
          quando: Date.now(),
          entrega: 'enviando',
          midiaUrl: URL.createObjectURL(blob),
        },
        blob,
      );

      /*
       * TENTA O ARMAZENAMENTO PRIMEIRO; O BASE64 É A REDE DE SEGURANÇA.
       *
       * Com o armazenamento configurado, a mensagem leva umas dezenas de bytes
       * em vez de centenas de milhares, e o arquivo nem passa pelo nosso
       * servidor. Sem ele configurado — ou se a subida falhar — a mensagem
       * ainda sai pelo caminho antigo, porque uma foto que não vai é pior que
       * uma foto cara.
       */
      const subida = await subirMidia(blob, mime);
      if (subida) {
        // O remetente já tem os bytes; guardar a chave junto é o que faz a
        // mensagem existir também nos outros aparelhos dele.
        acrescentar(para, {
          id: msgId,
          de: 'eu',
          tipo,
          mime,
          duracaoMs,
          nome,
          bytes: blob.size,
          quando: Date.now(),
          entrega: 'enviando',
          chave: subida.chave,
        });
        despachar(
          msgId,
          para,
          tipo,
          JSON.stringify({ chave: subida.chave, mime, duracaoMs, nome, bytes: blob.size }),
        );
        return true;
      }

      /*
       * O CAMINHO ANTIGO TEM TETO, e o novo nao.
       *
       * Sem armazenamento, os bytes viajam dentro da mensagem e o envelope tem
       * limite. Um arquivo que nao cabe ali precisa falhar DIZENDO isso, e nao
       * ser truncado nem ficar girando para sempre.
       */
      if (blob.size > BYTES_MAX) {
        setConversas((atual) => ({
          ...atual,
          [para]: (atual[para] ?? []).map((m) =>
            m.id === msgId
              ? { ...m, entrega: 'falhou' as const, erro: 'GRANDE_DEMAIS' as MsgErrorValue }
              : m,
          ),
        }));
        void marcarEntrega(msgId, 'falhou');
        return false;
      }

      const b64 = await paraBase64(blob);
      despachar(msgId, para, tipo, JSON.stringify({ b64, mime, duracaoMs, nome }));
      return true;
    },
    [acrescentar, despachar],
  );

  /** "Eu vi." Só faz sentido com a conversa aberta e a janela à vista. */
  const marcarLidas = useCallback((com: string) => {
    if (!com) return;

    /*
     * LER E' LOCAL; AVISAR O OUTRO E' QUE DEPENDE DA REDE.
     *
     * Antes, sem socket a função inteira desistia — e abrir a conversa nos
     * primeiros segundos depois de carregar a página (quando a conexão ainda
     * está subindo, o que no celular é comum) não marcava nada. A pessoa lia,
     * saia, e a conversa continuava com o número de não lidas aceso.
     *
     * Agora o "eu vi" vale sempre. Se o socket não estiver de pé, o que se
     * perde é o recibo do outro lado — que é justamente o que o projeto já
     * decidiu não guardar (ver mailbox.ts).
     */
    const socket = getSocket();
    setConversas((atual) => {
      const msgs = atual[com] ?? [];
      const naoLidas = msgs.filter((m) => m.de === 'outro' && !m.entrega);
      if (naoLidas.length === 0) return atual;
      socket?.emit('msg:read', { to: com, msgIds: naoLidas.map((m) => m.id) });
      const ids = new Set(naoLidas.map((m) => m.id));
      for (const id of ids) void marcarEntrega(id, 'lida');
      return {
        ...atual,
        [com]: msgs.map((m) => (ids.has(m.id) ? { ...m, entrega: 'lida' as const } : m)),
      };
    });
  }, []);

  /**
   * Busca as URLs da mídia que está no armazenamento.
   *
   * SÓ DA CONVERSA ABERTA, e só do que ainda não tem URL. Resolver tudo de
   * uma vez pediria uma assinatura por foto de toda a história da pessoa — e
   * as assinaturas vencem, então o trabalho seria refeito e jogado fora.
   *
   * As URLs não são gravadas em disco em lugar nenhum: elas têm hora para
   * morrer, e uma URL vencida guardada é uma foto que não abre amanhã.
   */
  useEffect(() => {
    const com = abertaCom;
    if (!com) return;

    const pendentes = (conversasRef.current[com] ?? []).filter(
      (m) => m.chave && !m.midiaUrl,
    );
    if (pendentes.length === 0) return;

    let vivo = true;
    void (async () => {
      for (const m of pendentes) {
        const url = await urlDaMidia(m.chave!);
        if (!vivo || !url) continue;
        setConversas((atual) => {
          const lista = atual[com] ?? [];
          return {
            ...atual,
            [com]: lista.map((x) => (x.id === m.id ? { ...x, midiaUrl: url } : x)),
          };
        });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [abertaCom, conversas]);

  const abrirConversa = useCallback((com: string) => setAbertaCom(com), []);

  const fecharConversa = useCallback(() => {
    // Fechar a conversa com o texto pela metade deixaria o "digitando" aceso
    // na tela do outro até o relógio dele apagar.
    if (abertaRef.current) pararDeAvisar(abertaRef.current);
    setAbertaCom(null);
  }, [pararDeAvisar]);

  const apagarConversa = useCallback((com: string) => {
    void apagarNoDisco(meuNickname ?? '', com);
    setConversas((atual) => {
      const novo = { ...atual };
      delete novo[com];
      return novo;
    });
    setAbertaCom((aberta) => (aberta === com ? null : aberta));
    // `meuNickname` na lista: sem ele, trocar de conta faria este apagar
    // procurar pelo nome da conta anterior — e nao apagar nada.
  }, [meuNickname]);

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
    digitando,
    avisarQueEstouEscrevendo,
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
