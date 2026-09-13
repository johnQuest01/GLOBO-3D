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
  /**
   * Quem acendeu, pelo nome publico.
   *
   * Passou a viajar junto quando os sinais viraram MUNDIAIS: de longe, o que
   * a pessoa ve' e' um ponto num pais que ela nao conhece, e sem um nome nao
   * ha' como decidir se quer falar — nem como abrir uma conversa, que e'
   * enderecada por nickname.
   */
  nickname?: string;
  /**
   * O pais de quem acendeu, para o filtro da busca.
   *
   * E' um ROTULO, nao uma permissao: quem procura alguem da Russia esta
   * escolhendo com quem falar, e nao acessando nada. Por isso vem do perfil do
   * cliente sem cerimonia — mentir nele nao da' acesso a coisa nenhuma.
   */
  pais?: string;
  /** Epoch em milissegundos. Passou disso, o beacon não existe mais. */
  expiresAt: number;
}

/**
 * Teto de sinais que um aparelho recebe de uma vez.
 *
 * Sinais sao mundiais, e isso so' se sustenta com um teto: com muita gente
 * online, mandar todos para todo mundo seria um broadcast que cresce com o
 * quadrado da audiencia. Duzentos pontos ja' enchem um globo, e o agrupamento
 * do cliente cuida de mostra-los sem virar mancha.
 */
export const BEACONS_MAX = 200;

/**
 * Teto de presencas que um aparelho recebe de uma vez.
 *
 * O snapshot mandava TODO MUNDO da regiao para quem entrasse. Com mil pessoas
 * em Sao Paulo sao mil registros por pessoa que abre o app; com cinquenta mil,
 * a conta nao fecha — e o problema nao e' de maquina, e' de desenho: o
 * trabalho cresce com o quadrado da audiencia daquele lugar.
 *
 * Cento e vinte pontos ja' enchem um globo. O resto vira um numero, que e' a
 * informacao que sobra quando os pontos nao cabem: "ha mais gente aqui".
 */
export const PRESENCAS_MAX = 120;

/**
 * Uma mensagem, do jeito que ela atravessa o servidor.
 *
 * `payload` e' OPACO: uma string que quem envia montou e que o servidor repassa
 * sem interpretar. Hoje ela e' JSON legivel; quando a criptografia ponta a
 * ponta entrar, vira texto cifrado e NADA neste contrato muda.
 *
 * `kind` fica de fora do payload de proposito. E' o unico pedaco de conteudo
 * que o servidor precisa mesmo enxergar: e' com ele que uma notificacao diz
 * "fulano te mandou uma foto" sem abrir a foto.
 */
export interface Envelope {
  msgId: string;
  /** Quem mandou, pelo nome publico. */
  from: string;
  /**
   * Para quem foi.
   *
   * Passou a existir com o historico no servidor: quando a mensagem e' MINHA,
   * ela chega de volta ao meu outro aparelho, e a conversa nao e' com quem
   * mandou (eu) e sim com quem recebeu.
   */
  to?: string;
  /** Fui eu que mandei? O aparelho usa para saber de que lado desenhar. */
  minha?: boolean;
  /** Ja' foi entregue / lida. So' faz sentido nas minhas. */
  entregue?: boolean;
  lida?: boolean;
  kind: 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
  payload: string;
  /** ISO. Quando o SERVIDOR aceitou — o relogio do remetente nao e' confiavel. */
  sentAt: string;
}

/** Por que uma mensagem nao foi aceita. */
export const MsgError = {
  SEM_CONTA: 'SEM_CONTA',
  SEM_DESTINATARIO: 'SEM_DESTINATARIO',
  BLOQUEADO: 'BLOQUEADO',
  GRANDE_DEMAIS: 'GRANDE_DEMAIS',
  INDISPONIVEL: 'INDISPONIVEL',
} as const;

export type MsgErrorValue = (typeof MsgError)[keyof typeof MsgError];

/**
 * Teto do payload, em caracteres.
 *
 * O payload e' JSON com os bytes em base64, que infla 4/3 — entao este numero
 * vale cerca de 1,5 MB de arquivo. Foi calibrado para caber, com folga: uma
 * foto de celular reduzida para 1280px fica em 200-400 KB, um minuto de audio
 * em opus fica em ~150 KB, e clipes curtos de video passam.
 *
 * O limite existe por dois motivos, e nenhum e' arbitrario: o envelope e'
 * guardado no banco ate a entrega (nao ha bucket), e o socket recusa quadro
 * maior que o `maxHttpBufferSize` do servidor, que precisa acompanhar este
 * valor.
 */
export const PAYLOAD_MAX = 2_000_000;

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

  'beacon:raise': (p: { topic?: string; ttlSec: number; pais?: string }) => void;
  /**
   * "Quem quer conversar agora?" — a busca dos sinais do mundo.
   *
   * POR QUE PERGUNTAR EM VEZ DE RECEBER. Sinal aceso e' publico e mundial, e
   * essa e' a graca: se ninguem da Russia estiver online, alguem da Nigeria
   * estara'. Mas anunciar cada sinal para cada pessoa e' trabalho que cresce
   * com o PRODUTO dos dois numeros — com 25 mil sinais e 50 mil conexoes sao
   * 1,25 bilhao de entregas por rodada, e nenhuma maquina resolve isso.
   *
   * Perguntando, o custo vira uma consulta por pessoa interessada, e so'
   * quando ela esta olhando. O servidor ainda guarda a resposta por alguns
   * segundos, entao mil pessoas perguntando ao mesmo tempo custam uma leitura.
   */
  'beacon:find': (p: { pais?: string; limite?: number }) => void;
  'beacon:lower': () => void;

  'connect:request': (p: { targetClientId: ClientId }) => void;
  'connect:accept': (p: { requestId: string }) => void;
  'connect:decline': (p: { requestId: string }) => void;

  /** Passagem pura de SDP/ICE. O servidor NÃO olha o `data`. */
  'signal': (p: { toSocketId: SocketId; data: unknown }) => void;
  'peer:hangup': (p: { peerSocketId: SocketId }) => void;

  'report': (p: { targetClientId: ClientId; reason: string }) => void;
  /**
   * `targetNickname` entra junto porque agora existem DOIS bloqueios: o antigo,
   * por clientId (o navegador), que continua valendo para o pedido de conexao
   * P2P; e o por CONTA, que e' o que a caixa postal consulta. Bloqueio que se
   * perde quando a pessoa troca de navegador nao serve para mensagem guardada
   * para entregar depois.
   */
  'block': (p: { targetClientId: ClientId; targetNickname?: string }) => void;

  // --- Caixa postal ------------------------------------------------------
  /**
   * Manda uma mensagem. O servidor guarda e entrega — agora ou quando a pessoa
   * voltar.
   *
   * `msgId` e' gerado por quem envia, e e' o que torna o reenvio seguro: a
   * mesma mensagem mandada duas vezes (rede caiu no meio) e' guardada uma vez
   * so.
   */
  'msg:send': (p: {
    msgId: string;
    to: string;
    kind: 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
    payload: string;
  }) => void;

  /**
   * "O que mudou desde o corte que eu conheco?"
   *
   * `desde` e' o instante da mensagem mais nova que ESTE aparelho ja' tem, em
   * ISO. Nulo pede o historico inteiro que ainda existe — e' o caso de um
   * aparelho novo entrando numa conta antiga.
   *
   * A resposta traz os DOIS SENTIDOS: o que a pessoa recebeu e o que ela
   * mandou. Sem o segundo, a mensagem enviada do celular nao existiria no
   * computador, que e' o defeito que trouxe o historico para o servidor.
   */
  'msg:sync': (p?: { desde?: string | null }) => void;

  /** "Recebi." O servidor apaga o envelope e avisa quem mandou. */
  'msg:ack': (p: { msgIds: string[] }) => void;

  /** "Li." Nao e' guardado: se o outro estiver offline, o aviso se perde. */
  'msg:read': (p: { to: string; msgIds: string[] }) => void;

  /**
   * "Estou escrevendo" / "parei".
   *
   * NAO E' GUARDADO, e essa e' a diferenca que importa entre este evento e
   * `msg:send`. Um aviso de digitacao entregue depois e' mentira: dizer
   * "fulano esta digitando" sobre algo que aconteceu ha uma hora e' pior do
   * que nao dizer nada. Se o outro lado nao estiver online agora, o aviso se
   * perde, e e' assim que tem de ser.
   *
   * Por isso tambem ele nao passa pelo banco nem pelo cofre: nao ha o que
   * cifrar num booleano que morre em segundos.
   */
  'msg:typing': (p: { to: string; typing: boolean }) => void;
}

// ---------------------------------------------------------------------------
// Servidor -> Cliente
// ---------------------------------------------------------------------------

export interface ServerToClient {
  /**
   * `presences` vem LIMITADO a PRESENCAS_MAX; `total` diz quantos sao de
   * verdade. A interface mostra os pontos que couberam e o numero do resto.
   */
  'presence:snapshot': (p: {
    presences: Presence[];
    beacons: Beacon[];
    total?: number;
  }) => void;
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

  /**
   * O sinal de quem esta PERTO, ao vivo.
   *
   * Continua sendo anunciado, mas so' dentro da regiao: la' o numero e'
   * pequeno por definicao, e ver o vizinho acender na hora e' o que faz o
   * globo parecer vivo. O mundo inteiro vem por `beacon:list`, sob demanda.
   */
  'beacon:new': (b: Beacon) => void;
  /** A resposta de `beacon:find`: os sinais do mundo, ja' limitados. */
  'beacon:list': (p: { sinais: Beacon[]; total: number }) => void;
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

  // --- Caixa postal ------------------------------------------------------
  /** O servidor assumiu a mensagem. Na tela: o primeiro tique. */
  'msg:accepted': (p: { msgId: string; sentAt: string }) => void;

  /** Chegou uma mensagem para voce — agora, ou guardada de antes. */
  'msg:new': (e: Envelope) => void;

  /** O aparelho do outro confirmou o recebimento. Na tela: o segundo tique. */
  'msg:delivered': (p: { msgIds: string[] }) => void;

  /** O outro lado leu. */
  'msg:read': (p: { from: string; msgIds: string[] }) => void;

  /** O outro lado esta escrevendo agora (ou parou). Nunca guardado. */
  'msg:typing': (p: { from: string; typing: boolean }) => void;

  /** Nao deu. `code` diz por que; a interface e' quem traduz. */
  'msg:failed': (p: { msgId: string; code: MsgErrorValue }) => void;

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

/**
 * De quanto em quanto tempo quem escreve repete o aviso de digitacao.
 *
 * Repetir e' necessario porque o "parei" pode nunca chegar: a pessoa fecha a
 * aba, o metro entra no tunel, o celular dorme. Sem repeticao, o "digitando"
 * do outro lado ficaria eternamente aceso.
 */
export const TYPING_PING_MS = 3_000;

/**
 * Quanto tempo o "digitando" sobrevive sem um aviso novo.
 *
 * Duas repeticoes, e nao uma: uma perdida no caminho nao pode fazer o aviso
 * piscar na tela de quem le.
 */
export const TYPING_TTL_MS = 7_000;

/** Teto de nomes por `directory:find`. Acima disso, o servidor ignora o resto. */
export const DIRECTORY_MAX_POR_BUSCA = 10;

/** Códigos de erro que o servidor emite em 'error'. */
export const ErrorCode = {
  BAD_PAYLOAD: 'BAD_PAYLOAD',
  NOT_JOINED: 'NOT_JOINED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
