/**
 * Presença: quem está no globo, e onde.
 *
 * Uma pessoa entra dizendo onde está; fica viva enquanto bate o heartbeat; sai
 * ao fechar a aba ou ao parar de bater. Nada aqui é broadcast de conteúdo — o
 * que trafega é "fulano está aqui", e só para a região dele.
 *
 * O RECORTE DO ANÚNCIO É A CÉLULA, e não mais a região.
 *
 * Cada socket entrava numa sala com o nome da `regionKey` — "são paulo" era uma
 * sala só —, e cada entrada, saída ou sinal era anunciado a todos ali. Isso
 * custa uma entrega por pessoa presente, o que significa que uma RODADA custa o
 * QUADRADO da população daquele lugar. Medido: 24 pessoas na mesma região
 * acendendo sinal produziram 576 entregas, que é 24² exatamente. Mil pessoas em
 * São Paulo dariam um milhão por rodada; cinquenta mil, dois bilhões e meio.
 *
 * A célula (ver shared/celulas.ts) quebra isso. Cada pessoa ESCUTA as nove
 * células à sua volta e FALA só na sua: o anúncio alcança quem está a cerca de
 * dois quilômetros, e o custo passa a depender de quanta gente há por perto —
 * não de quanta gente há na cidade. São Paulo deixa de ser uma sala e vira
 * algumas centenas.
 *
 * A REGIÃO CONTINUA EXISTINDO para o que não é anúncio: o retrato que quem
 * entra recebe, e a lista de sinais do lugar. Essas são uma consulta por
 * entrada, com teto — custo constante, não quadrático.
 */

import type { Server, Socket } from 'socket.io';

import type {
  ClientToServer,
  Presence,
  ServerToClient,
} from '../shared/protocol.js';
import { celulaDe, celulasVizinhas } from '../shared/celulas.js';
import { ErrorCode, PRESENCAS_MAX } from '../shared/protocol.js';
import { restaurarBeacon, TTL_DO_SINAL_SEC } from './beacons.js';
import type { PresenceStore } from './store.js';

/** O que o servidor guarda por conexão. */
export interface SocketData {
  /**
   * A conta dona desta conexão, provada pelo token do aperto de mão
   * (ver src/auth.ts). Ausente em quem entrou sem login — que continua vendo
   * o globo, mas não tem nome público nem caixa postal.
   */
  userId?: string;
  clientId?: string;
  regionKey?: string;
  /**
   * A célula desta conexão — a sala em que ela FALA.
   *
   * Guardada à parte da presença pelo mesmo motivo do `beaconRegionKey`: no
   * `disconnect` os handlers rodam na ordem de registro, e o da presença apaga
   * `socket.data.presence` antes de o do beacon rodar. Sem esta cópia, a
   * limpeza não saberia em que célula anunciar a saída.
   */
  celula?: string;
  /**
   * O nome público, vindo do TOKEN — nunca do que o cliente enviou.
   *
   * É preenchido no aperto de mão (src/auth.ts) e sobrevive ao `disconnect`
   * pela mesma razão do `beaconRegionKey`: os handlers de saída rodam na ordem
   * de registro, e o da presença limpa `socket.data.presence` antes de os
   * outros rodarem. Sem uma cópia à parte, a limpeza do diretório não saberia
   * qual nickname desindexar.
   */
  nickname?: string;
  presence?: Presence;
  /** Beacon aceso por esta conexão, se houver. Um por pessoa. */
  beaconId?: string;
  /**
   * Em que região o beacon foi aceso.
   *
   * Guardado à parte de `presence` de propósito: no `disconnect`, os handlers
   * rodam na ordem em que foram registrados, e o da presença apaga
   * `socket.data.presence` antes de o do beacon rodar. Sem esta cópia, a
   * limpeza não sabia de qual região tirar o sinal e o beacon ficava órfão
   * até vencer o TTL — visto acontecendo no teste.
   */
  beaconRegionKey?: string;
  /**
   * Com quem esta conexão foi APRESENTADA. É esta lista que autoriza a
   * sinalização — ver signaling.ts.
   */
  peers?: Set<string>;
}

export type RealtimeServer = Server<
  ClientToServer,
  ServerToClient,
  Record<string, never>,
  SocketData
>;
export type RealtimeSocket = Socket<
  ClientToServer,
  ServerToClient,
  Record<string, never>,
  SocketData
>;

const coordenadaValida = (n: unknown, limite: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limite;

/**
 * Quanta gente recebe um anúncio ao vivo.
 *
 * POR QUE UM LIMITE, E NÃO SÓ A CÉLULA. A célula divide o mundo por geografia,
 * e isso ajuda — mas não resolve sozinha, por um motivo que só aparece no uso:
 * a coordenada de quem se cadastra vem da LISTA DE CIDADES, e a lista tem um
 * ponto por cidade. Todo mundo que escolhe "São Paulo" recebe exatamente
 * -23,55 / -46,63. Uma cidade inteira cai numa célula só, e a divisão
 * geográfica não divide nada.
 *
 * Sem limite, cada anúncio custa uma entrega por pessoa presente — e uma rodada
 * custa o QUADRADO da população daquele lugar. Medido: 64 pessoas no mesmo
 * lugar acendendo sinal produziram 4.096 entregas, que é 64² exatamente. Mil
 * pessoas numa cidade dariam um milhão por rodada; cinquenta mil, dois bilhões
 * e meio.
 *
 * TRINTA É ESCOLHIDO PELO PRODUTO: é mais gente do que cabe no campo de visão
 * de um globo antes de os pontos virarem mancha. Mudar este número muda o custo
 * por evento diretamente — é um botão de escala, e o teste de estresse afirma o
 * limite, não o valor.
 */
const PLATEIA_MAX = 30;

/**
 * Anuncia na célula, para no máximo `PLATEIA_MAX` pessoas.
 *
 * AMOSTRA, E NÃO CORTE — e a diferença é o produto inteiro. A primeira versão
 * simplesmente não anunciava quando a célula passava do limite, e o teste
 * mostrou o que isso significa: com 64 pessoas no mesmo lugar, ZERO entregas.
 * Um lugar cheio ficaria mudo, e lugar cheio é exatamente onde o globo precisa
 * parecer vivo. O limite virava um precipício em vez de um teto.
 *
 * Agora o anúncio sempre acontece; o que muda é para quantos. Em lugar pequeno
 * vai para todos, como antes. Em lugar cheio vai para trinta, escolhidos a
 * partir de um ponto de partida sorteado — então não são sempre os mesmos
 * trinta, e ao longo de alguns minutos todo mundo vê movimento.
 *
 * A JANELA É PERCORRIDA SEM COPIAR A SALA. Materializar a lista de todos os
 * presentes para escolher trinta seria pagar, em memória, exatamente o preço
 * que este limite existe para não pagar.
 *
 * Devolve quantos receberam — quem chama usa isso para o log.
 */
export function anunciarNaCelula(
  io: RealtimeServer,
  celula: string,
  anunciar: (para: ReturnType<RealtimeServer['to']>) => void,
): number {
  const sala = io.sockets.adapter.rooms.get(celula);
  const quantos = sala?.size ?? 0;
  if (quantos === 0) return 0;

  if (quantos <= PLATEIA_MAX) {
    anunciar(io.to(celula));
    return quantos;
  }

  const comeco = Math.floor(Math.random() * quantos);
  const escolhidos: string[] = [];
  let i = 0;
  for (const id of sala!) {
    // Começa no sorteado e dá a volta: `(i - comeco + quantos) % quantos` diria
    // o mesmo com uma conta a mais por iteração.
    if (i >= comeco && escolhidos.length < PLATEIA_MAX) escolhidos.push(id);
    i++;
  }
  for (const id of sala!) {
    if (escolhidos.length >= PLATEIA_MAX) break;
    escolhidos.push(id);
  }

  // Cada socket também é uma sala com o próprio id: é assim que se fala com um
  // punhado de conexões sem inventar uma sala nova para cada anúncio.
  anunciar(io.to(escolhidos));
  return escolhidos.length;
}

export function registerPresence(
  io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
  log: (...args: unknown[]) => void,
): void {
  socket.on('presence:join', async (p) => {
    if (
      !p ||
      typeof p.clientId !== 'string' ||
      p.clientId.length === 0 ||
      typeof p.regionKey !== 'string' ||
      p.regionKey.length === 0 ||
      !coordenadaValida(p.lat, 90) ||
      !coordenadaValida(p.lon, 180)
    ) {
      socket.emit('error', {
        code: ErrorCode.BAD_PAYLOAD,
        message: 'presence:join precisa de clientId, regionKey, lat e lon validos.',
      });
      return;
    }

    // Entrar duas vezes é normal: o cliente reconecta e reenvia. Sai da região
    // anterior antes, senão fica um fantasma na sala antiga.
    if (socket.data.regionKey && socket.data.regionKey !== p.regionKey) {
      await sairDaRegiao(io, socket, store);
    }

    const presence: Presence = {
      clientId: p.clientId,
      lat: p.lat,
      lon: p.lon,
      regionKey: p.regionKey,
      ...(typeof p.name === 'string' && p.name.trim() ? { name: p.name.trim() } : {}),
      // Do crachá, e não do payload: é isto que impede alguém de entrar
      // dizendo ser outra pessoa.
      ...(socket.data.nickname ? { nickname: socket.data.nickname } : {}),
    };

    socket.data.clientId = presence.clientId;
    socket.data.regionKey = presence.regionKey;
    socket.data.presence = presence;
    // `socket.data.nickname` NÃO é escrito aqui: ele veio do token e é a
    // fonte da verdade. Regravá-lo a partir da presença o apagaria para quem
    // entrou sem nickname, e abriria de volta a porta que o token fechou.

    await store.add(socket.id, presence);
    // O índice da lupa. Só quem tem conta tem nickname — quem entra sem login
    // aparece no globo, mas não é encontrável por nome.
    if (presence.nickname) {
      await store.bindNickname(presence.nickname, presence.clientId);
    }
    // De clientId para esta conexão: é assim que um pedido de conexão
    // endereçado à PESSOA encontra a aba aberta dela agora.
    await store.bindClient(presence.clientId, socket.id);

    /*
     * ESCUTA NOVE, FALA EM UMA.
     *
     * A conexão entra nas nove salas em volta (a própria e as oito vizinhas) e
     * anuncia só na própria. Assim B recebe o anúncio de A exatamente quando a
     * célula de A está entre as nove de B — ou seja, quando os dois estão a
     * cerca de dois quilômetros um do outro. A relação é simétrica, e resolve
     * o caso de quem mora na borda: duas pessoas separadas por uma rua não
     * ficam invisíveis uma para a outra só por caírem em células diferentes.
     */
    const celula = celulaDe(presence.lat, presence.lon);
    socket.data.celula = celula;
    await socket.join(celulasVizinhas(celula));

    /*
     * O SINAL DELA AINDA ESTA ACESO? Entao volta a valer o tempo cheio.
     *
     * Toda reconexao passa por aqui, e e' aqui que a carencia do sinal (ver
     * beacons.ts) deixa de ser um adiamento e vira o que foi prometido: quem
     * acendeu por quinze minutos e bloqueou a tela no meio encontra o sinal
     * inteiro ao voltar, em vez de ter que acender de novo.
     */
    await restaurarBeacon(socket, store, TTL_DO_SINAL_SEC);

    // O snapshot vai só para quem entrou; o update vai para os outros. Se o
    // update fosse para a sala inteira incluindo o remetente, quem entra se
    // veria entrando.
    const [presences, beacons] = await Promise.all([
      store.listRegion(presence.regionKey),
      // Os sinais da REGIAO. Os do mundo sao pedidos a' parte, por
      // `beacon:find` — mandar todos aqui faria cada entrada no app carregar
      // a lista inteira do planeta.
      store.listBeacons(presence.regionKey),
    ]);
    /*
     * O TETO E' APLICADO AQUI, e nao na consulta, de proposito: o `total`
     * precisa ser o numero verdadeiro. Mandar so' o que cabe e dizer quantos
     * sao e' honesto; mandar so' o que cabe e calar sobre o resto faria a
     * pessoa achar que a regiao esta vazia.
     */
    socket.emit('presence:snapshot', {
      presences: presences.slice(0, PRESENCAS_MAX),
      beacons,
      total: presences.length,
    });
    anunciarNaCelula(io, celula, (para) =>
      para.emit('presence:update', { kind: 'join', presence }),
    );

    log(
      `join   ${socket.id} clientId=${presence.clientId} regiao=${presence.regionKey} celula=${celula} (${presences.length} na regiao, ${beacons.length} beacon(s))`,
    );
  });

  socket.on('presence:heartbeat', async () => {
    const { regionKey, presence, nickname } = socket.data;
    if (!regionKey || !presence) {
      socket.emit('error', {
        code: ErrorCode.NOT_JOINED,
        message: 'heartbeat antes de presence:join.',
      });
      return;
    }

    const vivo = await store.touch(socket.id, regionKey);
    if (!vivo) {
      // Expirou (aba dormindo, rede caída). Regrava em vez de exigir um novo
      // join: o cliente já provou que está aqui.
      await store.add(socket.id, presence);
      const celula = socket.data.celula ?? celulaDe(presence.lat, presence.lon);
      anunciarNaCelula(io, celula, (para) =>
        para.emit('presence:update', { kind: 'join', presence }),
      );
      log(`revive ${socket.id} regiao=${regionKey}`);
    }

    /*
     * OS PONTEIROS TAMBÉM PRECISAM SER RENOVADOS, e esquecer disso custou caro.
     *
     * São três chaves com três vidas diferentes: a presença
     * (`presence:<socketId>`, 45s) é renovada pelo `touch` acima, mas
     * `client:<clientId>` e `nick:<nickname>` eram gravados SÓ no join, com
     * TTL de 180s. Passados três minutos, eles venciam com a pessoa ali,
     * conectada, batendo heartbeat — e o efeito não era um erro, era pior:
     *
     *   - a busca passava a dizer que ela estava OFFLINE;
     *   - o pedido de conexão respondia "essa pessoa não está disponível".
     *
     * No store de MEMÓRIA isso nunca aparecia, porque lá os ponteiros são
     * entradas de Map, sem expiração. O defeito só existe com Redis — ou seja,
     * só em produção, e só depois de três minutos. Foi relatado do celular
     * antes de qualquer teste daqui pegar.
     */
    if (presence.clientId) {
      await store.bindClient(presence.clientId, socket.id);
      if (nickname) await store.bindNickname(nickname, presence.clientId);
    }
  });

  socket.on('presence:leave', async () => {
    await sairDaRegiao(io, socket, store);
    log(`leave  ${socket.id}`);
  });

  socket.on('disconnect', async (motivo) => {
    await sairDaRegiao(io, socket, store);
    log(`bye    ${socket.id} (${motivo})`);
  });
}

/**
 * Tira a presença do store, avisa a região e limpa o estado do socket.
 *
 * Idempotente de propósito: `presence:leave` seguido do `disconnect` é o
 * caminho normal quando o usuário fecha a aba, e o segundo não pode anunciar
 * uma saída que já foi anunciada.
 */
async function sairDaRegiao(
  io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
): Promise<void> {
  const { regionKey, presence, nickname } = socket.data;
  if (!regionKey || !presence) return;

  const celula = socket.data.celula ?? celulaDe(presence.lat, presence.lon);

  socket.data.regionKey = undefined;
  socket.data.presence = undefined;
  socket.data.celula = undefined;
  // O nickname do crachá fica: sair da região não deixa de ser você. Ele só
  // some quando a conexão morre, junto com o resto do `socket.data`.

  if (presence.clientId) await store.unbindClient(presence.clientId, socket.id);
  if (nickname) await store.unbindNickname(nickname, presence.clientId);
  await store.remove(socket.id, regionKey);
  for (const sala of celulasVizinhas(celula)) await socket.leave(sala);
  anunciarNaCelula(io, celula, (para) =>
    para.emit('presence:update', { kind: 'leave', presence }),
  );
}
