/**
 * Contrato de eventos do realtime — FONTE DA VERDADE.
 *
 * Servidor e front importam daqui. Se um nome de evento mudar, muda neste
 * arquivo e os dois lados quebram juntos no TypeScript, que é exatamente o que
 * se quer: é melhor quebrar na compilação do que descobrir em produção que o
 * cliente emite 'beacon:raise' e o servidor escuta 'beacon:up'.
 *
 * Este arquivo não pode importar nada. Nem do Node, nem do DOM: ele é lido dos
 * dois lados, e qualquer import amarraria um dos dois a um ambiente que ele
 * não tem.
 */

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

/**
 * O mesmo `globoClientId` anônimo que o front já guarda no localStorage
 * (app/hooks/useBehaviorTracker.ts). Não é conta, não é login: é só um
 * identificador de navegador, e é de propósito.
 */
export type ClientId = string;

/** Identificador da CONEXÃO, dado pelo Socket.io. Morre quando a aba fecha. */
export type SocketId = string;

/**
 * País, estado ou cidade — a mesma chave que o resto do projeto usa
 * (`region_key` em behavior_events, `popupKey` nos rótulos do globo).
 */
export type RegionKey = string;

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

export interface Presence {
  clientId: ClientId;
  lat: number;
  lon: number;
  regionKey: RegionKey;
  name?: string;
  /**
   * O nome público da conta (users.nickname), em minúsculas.
   *
   * É o que a lupa procura. Opcional porque presença não exige conta: quem
   * está sem login aparece no globo, mas não é encontrável por nome — e essa
   * é a diferença que o cliente deve mostrar na tela.
   */
  nickname?: string;
}

export interface Beacon {
  beaconId: string;
  clientId: ClientId;
  lat: number;
  lon: number;
  regionKey: RegionKey;
  topic?: string;
  /** Epoch em milissegundos. Passou disso, o beacon não existe mais. */
  expiresAt: number;
}

/**
 * Servidor de STUN/TURN entregue ao cliente no aceite.
 *
 * É a mesma forma do `RTCIceServer` do DOM, redeclarada aqui de propósito: o
 * tipo do DOM não existe no Node, e este arquivo roda dos dois lados. No front
 * ele é atribuível a `RTCIceServer` sem conversão.
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// ---------------------------------------------------------------------------
// Cliente -> Servidor
// ---------------------------------------------------------------------------

export interface ClientToServer {
  /**
   * O `nickname` NÃO entra aqui, e a ausência é o ponto.
   *
   * Ele vem do token do aperto de mão, que o app Next assinou depois de olhar
   * a sessão. Enquanto o cliente podia mandá-lo neste payload, qualquer pessoa
   * entrava anunciando o nome de outra e ficava no lugar dela na busca.
   */
  'presence:join': (p: {
    clientId: ClientId;
    lat: number;
    lon: number;
    regionKey: RegionKey;
    name?: string;
  }) => void;
  /** A cada ~15s. Sem batida, a presença expira sozinha. */
  'presence:heartbeat': () => void;
  'presence:leave': () => void;

  /**
   * "Onde está fulano AGORA?" — a busca da lupa.
   *
   * Separada da busca do banco (/api/users/search) de propósito: o banco
   * responde quem EXISTE, este evento responde quem está ONLINE e com qual
   * coordenada. Presença muda a cada 15s; não é dado de tabela.
   */
  'directory:find': (p: { nicknames: string[] }) => void;

  'beacon:raise': (p: { topic?: string; ttlSec: number }) => void;
  'beacon:lower': () => void;

  'connect:request': (p: { targetClientId: ClientId }) => void;
  'connect:accept': (p: { requestId: string }) => void;
  'connect:decline': (p: { requestId: string }) => void;

  /** Passagem pura de SDP/ICE. O servidor NÃO olha o `data`. */
  'signal': (p: { toSocketId: SocketId; data: unknown }) => void;
  'peer:hangup': (p: { peerSocketId: SocketId }) => void;

  'report': (p: { targetClientId: ClientId; reason: string }) => void;
  'block': (p: { targetClientId: ClientId }) => void;
}

// ---------------------------------------------------------------------------
// Servidor -> Cliente
// ---------------------------------------------------------------------------

export interface ServerToClient {
  'presence:snapshot': (p: { presences: Presence[]; beacons: Beacon[] }) => void;
  'presence:update': (p: {
    kind: 'join' | 'leave' | 'move';
    presence: Presence;
  }) => void;

  /**
   * Um item por nickname perguntado. `presence` nulo = essa pessoa não está
   * online agora.
   *
   * EM LOTE, e não um evento por nome: a lupa mostra até oito resultados de
   * uma vez, e oito eventos por tecla digitada consumiriam o limite de taxa em
   * segundos — o freio contra varredura acabaria punindo o uso normal.
   */
  'directory:result': (p: {
    encontrados: { nickname: string; presence: Presence | null }[];
  }) => void;

  'beacon:new': (b: Beacon) => void;
  'beacon:gone': (p: { beaconId: string }) => void;

  'connect:incoming': (p: {
    requestId: string;
    fromClientId: ClientId;
    fromName?: string;
    /**
     * O nome público de quem convidou.
     *
     * Vai junto porque quem recebe o convite precisa de duas coisas que só
     * este campo dá: mostrar QUEM está chamando (um clientId não diz nada a
     * ninguém) e, depois do aceite, achar a coordenada da pessoa no diretório
     * para desenhar o arco — ela quase sempre está em outra região, e a lista
     * de presença de quem recebe não a contém.
     */
    fromNickname?: string;
  }) => void;
  'connect:accepted': (p: {
    requestId: string;
    peerSocketId: SocketId;
    /** Quem é "polite" cede na colisão de ofertas (perfect negotiation). */
    polite: boolean;
    iceServers: IceServer[];
  }) => void;
  'connect:declined': (p: { requestId: string }) => void;

  'signal': (p: { fromSocketId: SocketId; data: unknown }) => void;
  'peer:disconnected': (p: { peerSocketId: SocketId }) => void;

  'rate_limited': (p: { action: string; retryAfterMs: number }) => void;
  'error': (p: { code: string; message: string }) => void;
}

// ---------------------------------------------------------------------------
// Números que os dois lados precisam concordar
// ---------------------------------------------------------------------------

/** De quanto em quanto tempo o cliente bate o heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Quanto tempo a presença sobrevive sem batida.
 *
 * Três batidas, e não uma: rede de celular perde pacote, aba em segundo plano
 * atrasa timer. Com TTL de uma batida só, todo mundo ficaria piscando na tela
 * dos outros.
 */
export const PRESENCE_TTL_SEC = 45;

/** Teto de nomes por `directory:find`. Acima disso, o servidor ignora o resto. */
export const DIRECTORY_MAX_POR_BUSCA = 10;

/** Códigos de erro que o servidor emite em 'error'. */
export const ErrorCode = {
  BAD_PAYLOAD: 'BAD_PAYLOAD',
  NOT_JOINED: 'NOT_JOINED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
