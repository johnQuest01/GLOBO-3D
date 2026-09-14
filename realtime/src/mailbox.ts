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
  aceitaDesconhecidos,
  confirmarLeitura,
  jaConversaram,
  desde,
  confirmarEntrega,
  estaBloqueado,
  guardarEnvelope,
  nicknameDoUserId,
  userIdDoNickname,
} from './db.js';
import type { RealtimeServer, RealtimeSocket } from './presence.js';
import { permitir, type Limitador } from './safety.js';
import { avisarObservadores, estadoDaConta, salaDaConta } from './observadores.js';
import { avisar } from './push.js';
import type { PresenceStore } from './store.js';

/** A caixa postal precisa das duas coisas; sem uma delas ela fica desligada. */
export const mailboxLigada = (): boolean => bancoLigado && cofreLigado();

const TIPOS = new Set(['texto', 'imagem', 'audio', 'video', 'documento']);

/**
 * De conta para conexões.
 *
 * Uma pessoa pode ter o globo aberto em dois lugares. A mensagem vai para
 * todas as abas dela — e é por isso que o índice é uma sala do Socket.io, e
 * não um socketId guardado: sala já resolve várias conexões e ainda funciona
 * quando as abas estão em instâncias diferentes do servidor.
 */
// A sala mora em observadores.ts: quem avisa "entrou/saiu" e quem entrega
// mensagem precisam do MESMO nome, e um so' lugar para defini-lo garante isso.

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

  /*
   * ENTROU: quem observa esta conta fica sabendo AGORA.
   *
   * Sem esperar a coordenada, sem esperar a primeira mensagem. E' esta linha
   * que troca "recarreguei a pagina para ver a bolinha verde" por "acendeu na
   * hora". Avisa mesmo se ja' havia outra aba da mesma conta — para quem
   * observa, "online" duas vezes e' o mesmo que uma, e contar conexoes aqui
   * abriria uma corrida entre duas abas entrando juntas.
   */
  void (async () => {
    await socket.join(salaDaConta(meuId));
    const nick = socket.data.nickname;
    if (nick) avisarObservadores(io, meuId, nick, true, socket.data.presence ?? null);
  })();

  /*
   * SAIU — mas so' se nao sobrou nenhuma aba.
   *
   * No `disconnect` o socket ja' deixou as salas, entao contar o que resta na
   * sala da conta e' contar as OUTRAS conexoes dela. Se houver alguma, a
   * pessoa continua online e ninguem e' avisado de nada.
   */
  socket.on('disconnect', async () => {
    const nick = socket.data.nickname;
    if (!nick) return;
    const { online } = await estadoDaConta(io, meuId);
    if (!online) avisarObservadores(io, meuId, nick, false, null);
  });

  /**
   * Manda para este aparelho tudo o que ele ainda não tem.
   *
   * `corte` é o instante da mensagem mais nova que ELE conhece. Vem do
   * aparelho, e não de um registro do servidor, e essa é a razão de a conta
   * poder ter quantos aparelhos quiser sem o servidor ter que conhecê-los: cada
   * um diz onde parou.
   */
  const sincronizar = async (corte: string | null) => {
    if (!mailboxLigada()) return;
    const mensagens = await desde(meuId, corte);
    if (mensagens.length === 0) return;

    for (const m of mensagens) {
      const envelope: Envelope = {
        msgId: m.msgId,
        from: m.fromNickname ?? '?',
        kind: m.kind as Envelope['kind'],
        payload: m.payload,
        sentAt: m.createdAt,
        ...(m.toNickname ? { to: m.toNickname } : {}),
        ...(m.minha ? { minha: true } : {}),
        ...(m.entregue ? { entregue: true } : {}),
        ...(m.lida ? { lida: true } : {}),
      };
      socket.emit('msg:new', envelope);
    }
    log(`sync   ${meuId.slice(0, 8)}: ${mensagens.length} desde ${corte ?? 'o comeco'}`);
  };

  socket.on('msg:sync', (p) => {
    const corte = typeof p?.desde === 'string' && p.desde ? p.desde : null;
    void sincronizar(corte);
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

    /*
     * QUEM NAO TEM NOME PUBLICO NAO MANDA.
     *
     * Nao e' rigor: a mensagem chega do outro lado identificada pelo nickname
     * do remetente, e sem ele a conversa aparece como "?" — impossivel de
     * responder. Visto no log de producao: `msg ? -> teste01`. Melhor recusar
     * com um motivo do que entregar algo que nao tem volta.
     */
    const meuNick = socket.data.nickname ?? (await nicknameDoUserId(meuId));
    if (!meuNick) {
      socket.emit('msg:failed', { msgId, code: MsgError.SEM_CONTA });
      return;
    }

    if (!permitir(socket, limitador, 'msg:send')) return;

    const destinoId = await userIdDoNickname(to);
    if (!destinoId) {
      socket.emit('msg:failed', { msgId, code: MsgError.SEM_DESTINATARIO });
      return;
    }

    if (destinoId === meuId) return;

    /*
     * A PORTA DE QUEM NAO QUER SER PROCURADO.
     *
     * So' vale para o PRIMEIRO contato: quem ja' trocou mensagem com voce
     * continua trocando. Fechar uma conversa existente seria outra coisa —
     * isso e' o bloqueio, e ele e' explicito.
     *
     * As duas consultas custam, entao elas so' acontecem quando a conversa
     * ainda nao existe: a de historico responde primeiro e, na esmagadora
     * maioria das mensagens, encerra o assunto.
     */
    if (!(await jaConversaram(meuId, destinoId))) {
      if (!(await aceitaDesconhecidos(destinoId))) {
        socket.emit('msg:failed', { msgId, code: MsgError.NAO_ACEITA });
        return;
      }
    }

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

    const remetente = meuNick;
    const envelope: Envelope = { msgId, from: remetente, kind, payload, sentAt };

    /*
     * ONLINE AGORA? A resposta decide entre entregar e ACORDAR O TELEFONE.
     *
     * `fetchSockets` da sala da conta atravessa as instancias do servidor
     * (e' o adaptador do Redis que responde), entao "nenhuma aba aberta" aqui
     * significa nenhuma aba aberta em lugar nenhum — e nao apenas nenhuma
     * nesta maquina.
     *
     * So' quem NAO recebeu ao vivo e' avisado. Mandar os dois faria o telefone
     * tocar com a conversa aberta na tela, que e' o tipo de aviso que ensina a
     * pessoa a desligar os avisos.
     */
    const abertas = await io.in(salaDaConta(destinoId)).fetchSockets();

    // Para TODAS as abas da pessoa. Se não houver nenhuma, não tem problema:
    // o envelope está guardado e sai no próximo `msg:sync`.
    io.to(salaDaConta(destinoId)).emit('msg:new', envelope);

    if (abertas.length === 0) {
      // Sem esperar: o servidor de push de terceiro pode demorar segundos, e
      // isso não pode ficar na frente da próxima mensagem de ninguem.
      void avisar(destinoId, { de: remetente, tipo: kind }, log);
    }

    log(
      `msg    ${remetente} -> ${to} (${kind}, ${payload.length}b)` +
        (abertas.length === 0 ? ' [offline: empurrão]' : ''),
    );
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

  /*
   * O "digitando…".
   *
   * Mesmo caminho do recibo de leitura, e pelo mesmo motivo: vai para as
   * conexões da conta de destino e não encosta no banco. O que o servidor faz
   * aqui é só traduzir nickname em sala e carimbar QUEM está digitando — se
   * viesse do cliente, daria para anunciar digitação em nome de outra pessoa.
   *
   * Não checa bloqueio de propósito: quem está bloqueado não consegue mandar
   * mensagem, então o pior que este evento faz é acender um aviso na tela de
   * alguém que nunca vai receber o texto. Uma ida ao banco a cada três
   * segundos, por conversa aberta, para evitar isso não se paga.
   */
  socket.on('msg:typing', async ({ to, typing }) => {
    if (typeof to !== 'string' || !to || typeof typing !== 'boolean') return;

    const eu = socket.data.nickname;
    if (!eu) return;

    if (!permitir(socket, limitador, 'msg:typing')) return;

    const destinoId = await userIdDoNickname(to);
    if (!destinoId || destinoId === meuId) return;

    io.to(salaDaConta(destinoId)).emit('msg:typing', { from: eu, typing });
  });

  socket.on('msg:read', async ({ to, msgIds }) => {
    if (typeof to !== 'string' || !Array.isArray(msgIds) || msgIds.length === 0) {
      return;
    }
    const destinoId = await userIdDoNickname(to);
    if (!destinoId) return;

    const eu = socket.data.nickname;
    if (!eu) return;

    const limpos = msgIds.filter((m): m is string => typeof m === 'string').slice(0, 500);

    /*
     * A LEITURA AGORA FICA GRAVADA.
     *
     * Antes este aviso so' existia ao vivo: se o remetente estivesse fora, o
     * tique azul se perdia e nunca mais aparecia. Com o historico no servidor
     * ele e' um carimbo na linha — sobrevive ao recarregar, chega ao outro
     * aparelho da mesma pessoa, e volta na proxima sincronizacao.
     */
    await confirmarLeitura(meuId, limpos);

    io.to(salaDaConta(destinoId)).emit('msg:read', { from: eu, msgIds: limpos });
  });

  /*
   * Ao entrar, o servidor NÃO empurra nada por conta própria.
   *
   * Quem pede é o aparelho, com `msg:sync`, porque só ele sabe até onde já
   * tem. Empurrar o histórico inteiro na conexão seria reenviar, a cada
   * reconexão de celular, tudo o que a pessoa já tem guardado.
   */
}
