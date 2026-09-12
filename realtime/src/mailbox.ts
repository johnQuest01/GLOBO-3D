/**
 * A caixa postal.
 *
 * O QUE MUDOU NO PROJETO. Até aqui o servidor apresentava duas pessoas e saía
 * de cena: o texto ia direto de um navegador ao outro e não existia em lugar
 * nenhum. Isso tinha um preço que só aparecia no uso — com a outra pessoa
 * offline, não havia o que fazer. Agora a mensagem passa por aqui, fica
 * guardada (cifrada, ver cofre.ts) e é entregue quando der. É o modelo do
 * WhatsApp, e o que ele resolve é exatamente isto.
 *
 * O QUE O SERVIDOR SABE, dito sem rodeio: de quem, para quem, quando, e se é
 * texto, imagem ou áudio. O conteúdo ele repassa sem abrir. Esse metadado é
 * inevitável em qualquer desenho que entregue depois — inclusive com
 * criptografia ponta a ponta: para entregar para alguém, é preciso saber para
 * quem.
 *
 * ENTREGUE É APAGADO. Não existe histórico no servidor: o `msg:ack` do
 * destinatário apaga a linha. O histórico vive nos dois aparelhos.
 */

import { MsgError, PAYLOAD_MAX, type Envelope } from '../shared/protocol.js';
import { cofreLigado } from './cofre.js';
import {
  bancoLigado,
  caixaDeEntrada,
  confirmarEntrega,
  estaBloqueado,
  guardarEnvelope,
  nicknameDoUserId,
  quantosEsperando,
  userIdDoNickname,
} from './db.js';
import type { RealtimeServer, RealtimeSocket } from './presence.js';
import { permitir, type Limitador } from './safety.js';
import type { PresenceStore } from './store.js';

/** A caixa postal precisa das duas coisas; sem uma delas ela fica desligada. */
export const mailboxLigada = (): boolean => bancoLigado && cofreLigado();

const TIPOS = new Set(['texto', 'imagem', 'audio']);

/**
 * De conta para conexões.
 *
 * Uma pessoa pode ter o globo aberto em dois lugares. A mensagem vai para
 * todas as abas dela — e é por isso que o índice é uma sala do Socket.io, e
 * não um socketId guardado: sala já resolve várias conexões e ainda funciona
 * quando as abas estão em instâncias diferentes do servidor.
 */
const salaDaConta = (userId: string) => `conta:${userId}`;

export function registerMailbox(
  io: RealtimeServer,
  socket: RealtimeSocket,
  _store: PresenceStore,
  limitador: Limitador,
  log: (...args: unknown[]) => void,
): void {
  const meuId = socket.data.userId;

  // Sem conta não há caixa postal. A conexão continua valendo para o globo.
  if (!meuId) return;

  void socket.join(salaDaConta(meuId));

  /** Manda para quem está esperando o que já chegou. */
  const entregarPendentes = async () => {
    if (!mailboxLigada()) return;
    const pendentes = await caixaDeEntrada(meuId);
    if (pendentes.length === 0) return;

    for (const p of pendentes) {
      const envelope: Envelope = {
        msgId: p.msgId,
        from: p.fromNickname ?? '?',
        kind: p.kind as Envelope['kind'],
        payload: p.payload,
        sentAt: p.createdAt,
      };
      socket.emit('msg:new', envelope);
    }
    log(`sync   ${meuId.slice(0, 8)}: ${pendentes.length} guardada(s)`);
  };

  socket.on('msg:sync', () => {
    void entregarPendentes();
  });

  socket.on('msg:send', async ({ msgId, to, kind, payload }) => {
    if (
      typeof msgId !== 'string' ||
      !msgId ||
      typeof to !== 'string' ||
      !to ||
      typeof payload !== 'string' ||
      !TIPOS.has(kind)
    ) {
      return;
    }

    if (!mailboxLigada()) {
      socket.emit('msg:failed', { msgId, code: MsgError.INDISPONIVEL });
      return;
    }

    if (payload.length > PAYLOAD_MAX) {
      socket.emit('msg:failed', { msgId, code: MsgError.GRANDE_DEMAIS });
      return;
    }

    if (!permitir(socket, limitador, 'msg:send')) return;

    const destinoId = await userIdDoNickname(to);
    if (!destinoId) {
      socket.emit('msg:failed', { msgId, code: MsgError.SEM_DESTINATARIO });
      return;
    }

    if (destinoId === meuId) return;

    if (await estaBloqueado(meuId, destinoId)) {
      // Bloqueado e inexistente respondem DIFERENTE aqui, ao contrário do que
      // acontece no pedido de conexão. É uma escolha diferente para um caso
      // diferente: lá, quem tenta é um estranho, e "não existe" protege quem
      // bloqueou. Aqui já existe conversa, e deixar a pessoa mandando
      // mensagens para o vazio para sempre seria pior — ela precisa saber que
      // aquilo não chega.
      socket.emit('msg:failed', { msgId, code: MsgError.BLOQUEADO });
      return;
    }

    /*
     * GUARDA ANTES DE ENTREGAR, sempre — inclusive quando o destinatário está
     * online neste segundo.
     *
     * A ordem inversa (entregar primeiro, guardar depois) seria alguns
     * milissegundos mais rápida e abriria um buraco: o servidor cai entre uma
     * coisa e outra, e a mensagem sumiu com o remetente vendo o tique de
     * enviada. O custo dessa garantia é uma ida ao banco por mensagem.
     */
    const novo = await guardarEnvelope({
      msgId,
      fromUserId: meuId,
      toUserId: destinoId,
      kind,
      payload,
    });

    const sentAt = new Date().toISOString();
    socket.emit('msg:accepted', { msgId, sentAt });

    // Reenvio do que já estava guardado: aceita de novo (o remetente precisa
    // do tique) mas não entrega duas vezes.
    if (!novo) return;

    const remetente = socket.data.nickname ?? (await nicknameDoUserId(meuId)) ?? '?';
    const envelope: Envelope = { msgId, from: remetente, kind, payload, sentAt };

    // Para TODAS as abas da pessoa. Se não houver nenhuma, não tem problema:
    // o envelope está guardado e sai no próximo `msg:sync`.
    io.to(salaDaConta(destinoId)).emit('msg:new', envelope);

    log(`msg    ${remetente} -> ${to} (${kind}, ${payload.length}b)`);
  });

  socket.on('msg:ack', async ({ msgIds }) => {
    if (!Array.isArray(msgIds) || msgIds.length === 0) return;
    if (!mailboxLigada()) return;

    const limpos = msgIds.filter(
      (m): m is string => typeof m === 'string' && m.length > 0,
    );
    if (limpos.length === 0) return;

    // Apaga só o que é meu: o `to_user_id` vai no where dentro do db.ts, e é
    // ele que impede que conhecer um msgId permita apagar a mensagem de outro.
    const apagados = await confirmarEntrega(meuId, limpos);
    if (apagados.length === 0) return;
    log(`ack    ${meuId.slice(0, 8)}: ${apagados.length} entregue(s)`);

    /*
     * O tique duplo, para cada remetente e só com as mensagens DELE.
     *
     * O delete devolveu de quem era cada linha — é a única chance de saber,
     * já que a informação some junto com ela. Agrupar aqui evita avisar
     * alguém sobre a entrega de uma mensagem que não era sua.
     *
     * Quem estiver offline não recebe este aviso e verá o tique duplo só
     * quando a conversa for reaberta com os dois online: recibo não é
     * guardado, a mensagem é. Guardar recibo seria uma segunda caixa postal
     * para resolver um detalhe visual.
     */
    const porRemetente = new Map<string, string[]>();
    for (const { fromUserId, msgId } of apagados) {
      const lista = porRemetente.get(fromUserId) ?? [];
      lista.push(msgId);
      porRemetente.set(fromUserId, lista);
    }
    for (const [remetenteId, ids] of porRemetente) {
      io.to(salaDaConta(remetenteId)).emit('msg:delivered', { msgIds: ids });
    }
  });

  socket.on('msg:read', async ({ to, msgIds }) => {
    if (typeof to !== 'string' || !Array.isArray(msgIds) || msgIds.length === 0) {
      return;
    }
    const destinoId = await userIdDoNickname(to);
    if (!destinoId) return;

    const eu = socket.data.nickname;
    if (!eu) return;

    io.to(salaDaConta(destinoId)).emit('msg:read', {
      from: eu,
      msgIds: msgIds.filter((m): m is string => typeof m === 'string').slice(0, 500),
    });
  });

  // Ao entrar, já manda o que estava esperando. É o que faz "abriu o globo e a
  // mensagem estava lá" acontecer sem a interface pedir.
  void (async () => {
    const n = await quantosEsperando(meuId);
    if (n > 0) await entregarPendentes();
  })();
}
