'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  PeerConnection,
  type EstadoDaConexao,
  type EstadoDaEntrega,
  type TipoDeMidia,
} from '@/lib/realtime/peer';
import { connectSocket, getSocket, isRealtimeEnabled } from '@/lib/realtime/socket';
import type { Beacon, Presence } from '@/realtime/shared/protocol';
import { HEARTBEAT_INTERVAL_MS } from '@/realtime/shared/protocol';
import { useGeoMapping } from '@/app/hooks/useGeoMapping';
import type { UserProfileData } from '@/app/types/user';

/**
 * Presença, busca, beacons e a conversa ao vivo — do lado do navegador.
 *
 * Um hook só, e não quatro, porque as coisas são o mesmo fio: a presença diz
 * onde você está, a busca encontra alguém em qualquer região, o convite aceito
 * vira o canal P2P e a conversa acontece dentro dele. Separá-los obrigaria a
 * compartilhar o socket, o par e o estado da negociação entre hooks — que é o
 * mesmo estado, só que espalhado.
 *
 * O QUE É EFÊMERO E O QUE É GRAVADO: tudo aqui é efêmero. Nenhuma mensagem
 * desta conversa toca o Neon, nem passa pelo servidor de realtime. O que o
 * projeto persiste é outra coisa (perfil e comportamento), e continua onde
 * estava.
 */

export interface MensagemDoChat {
  id: string;
  de: 'eu' | 'outro';
  tipo: 'texto' | 'imagem' | 'audio';
  texto?: string;
  /** Um blob: URL local. Nunca uma URL de servidor — não existe servidor aqui. */
  midiaUrl?: string;
  duracaoMs?: number;
  quando: number;
  /** Só nas minhas mensagens: o ✓ / ✓✓ da interface. */
  entrega?: EstadoDaEntrega;
}

export interface ConviteRecebido {
  requestId: string;
  fromClientId: string;
  fromName?: string;
  fromNickname?: string;
}

/** Um resultado da lupa, já com as duas metades juntas. */
export interface PessoaEncontrada {
  nickname: string;
  /** Do cadastro (Neon): onde a pessoa disse que mora. */
  country: string | null;
  state: string | null;
  city: string | null;
  /** Do realtime: onde ela está AGORA. Nulo quando está offline. */
  presenca: Presence | null;
}

export interface EstadoDoRealtime {
  ligado: boolean;
  conectado: boolean;
  presencas: Presence[];
  beacons: Beacon[];
  meuBeacon: Beacon | null;
  convite: ConviteRecebido | null;
  emChamada: boolean;
  estadoDaChamada: EstadoDaConexao | null;
  parClientId: string | null;
  /** Quem é o par, com coordenada — mesmo que ele esteja em outra região. */
  parPresenca: Presence | null;
  parNome: string | null;
  mensagens: MensagemDoChat[];
  /** O outro lado está escrevendo agora. */
  digitando: boolean;
  videoRemoto: MediaStream | null;
  videoLocal: MediaStream | null;
  aviso: string | null;
}

const idNovo = () => Math.random().toString(36).slice(2);

export function useLiveRealtime(user: UserProfileData | null) {
  const { keyToLatLon, isLoading: carregandoMapa } = useGeoMapping();

  const [presencas, setPresencas] = useState<Presence[]>([]);
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [convite, setConvite] = useState<ConviteRecebido | null>(null);
  const [mensagens, setMensagens] = useState<MensagemDoChat[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [estadoDaChamada, setEstadoDaChamada] = useState<EstadoDaConexao | null>(null);
  const [parClientId, setParClientId] = useState<string | null>(null);
  const [parPresenca, setParPresenca] = useState<Presence | null>(null);
  const [parNome, setParNome] = useState<string | null>(null);
  const [videoRemoto, setVideoRemoto] = useState<MediaStream | null>(null);
  const [videoLocal, setVideoLocal] = useState<MediaStream | null>(null);
  const [conectado, setConectado] = useState(false);
  /**
   * A conexão já existe?
   *
   * Não é o mesmo que `conectado`. Este diz que o objeto socket foi criado (o
   * crachá chegou e o `io()` rodou); aquele diz que o servidor respondeu. O
   * efeito do par depende DESTE: sem ele, ele rodaria no primeiro render, não
   * acharia socket nenhum e nunca mais tentaria.
   */
  const [socketPronto, setSocketPronto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Quem está online entre os nicknames já perguntados.
   *
   * Fica aqui, e não dentro do painel de busca, porque o resultado sobrevive ao
   * fechar do painel: é ele que diz ao globo onde desenhar o pino da pessoa
   * encontrada.
   */
  const [presencaPorNickname, setPresencaPorNickname] = useState<
    Record<string, Presence | null>
  >({});

  const peerRef = useRef<PeerConnection | null>(null);
  const peerSocketIdRef = useRef<string | null>(null);
  const meuClientIdRef = useRef<string>('');
  /** Espelho do nickname do par, para resolver a coordenada dele depois do aceite. */
  const parNicknameRef = useRef<string | null>(null);

  const meuNickname = user?.nickname?.trim().toLowerCase() || undefined;

  /**
   * Onde a pessoa está, para efeito de presença.
   *
   * Sai do cadastro dela (estado, com o país de reserva) e a coordenada vem do
   * `geo-mapping.json` que o globo JÁ carrega. Não há download novo, e a chave
   * é a mesma que o resto do projeto usa para achar um lugar.
   */
  const local = useMemo(() => {
    if (!user) return null;
    const candidatos = [user.state, user.city, user.country]
      .filter((v): v is string => Boolean(v && v.trim()))
      .map((v) => v.trim().toLowerCase());

    for (const chave of candidatos) {
      const coord = keyToLatLon(chave);
      if (coord) return { regionKey: chave, ...coord };
    }
    return null;
  }, [user, keyToLatLon]);

  // --- Conexão e presença ---------------------------------------------------

  useEffect(() => {
    if (!isRealtimeEnabled || !local || carregandoMapa) return;

    const clientId = localStorage.getItem('globoClientId') ?? `anon-${idNovo()}`;
    meuClientIdRef.current = clientId;

    // Copia o lugar depois da checagem acima. `registrar` e' uma funcao
    // declarada (icada), e o TypeScript nao leva o estreitamento de tipo para
    // dentro dela: la, `local` voltaria a poder ser nulo.
    const aqui = local;

    /*
     * Conectar virou assíncrono: o crachá (/api/realtime/token) vem ANTES do
     * socket, porque autenticar depois de conectado deixaria uma janela em que
     * os eventos chegam sem dono.
     *
     * `vivo` e `desfazer` são a dança de sempre com efeito assíncrono: o
     * componente pode desmontar enquanto a promessa está no ar, e aí não há o
     * que registrar — nem o que limpar, se nunca chegou a registrar.
     */
    let vivo = true;
    let desfazer: (() => void) | null = null;

    void connectSocket().then((socket) => {
      if (!socket || !vivo) return;
      setSocketPronto(true);
      desfazer = registrar(socket);
    });

    return () => {
      vivo = false;
      desfazer?.();
    };

    function registrar(socket: NonNullable<ReturnType<typeof getSocket>>) {

    const entrar = () => {
      setConectado(true);
      socket.emit('presence:join', {
        clientId,
        lat: aqui.lat,
        lon: aqui.lon,
        regionKey: aqui.regionKey,
        ...(user?.fullName ? { name: user.fullName.split(' ')[0] } : {}),
        // O nickname NÃO vai aqui: quem o informa ao servidor é o token do
        // aperto de mão. Enquanto ele vinha neste payload, qualquer pessoa
        // entrava com o nome de outra e ficava no lugar dela na busca.
      });
    };

    const aoDesconectar = () => setConectado(false);

    const aoSnapshot = ({
      presences,
      beacons: bs,
    }: {
      presences: Presence[];
      beacons: Beacon[];
    }) => {
      setPresencas(presences);
      setBeacons(bs);
    };

    const aoAtualizarPresenca = ({
      kind,
      presence,
    }: {
      kind: 'join' | 'leave' | 'move';
      presence: Presence;
    }) => {
      setPresencas((atual) => {
        const semEle = atual.filter((p) => p.clientId !== presence.clientId);
        return kind === 'leave' ? semEle : [...semEle, presence];
      });
    };

    const aoBeaconNovo = (b: Beacon) =>
      setBeacons((atual) => [...atual.filter((x) => x.beaconId !== b.beaconId), b]);

    const aoBeaconSumir = ({ beaconId }: { beaconId: string }) =>
      setBeacons((atual) => atual.filter((b) => b.beaconId !== beaconId));

    const aoResultadoDaBusca = ({
      encontrados,
    }: {
      encontrados: { nickname: string; presence: Presence | null }[];
    }) => {
      setPresencaPorNickname((atual) => {
        const novo = { ...atual };
        for (const { nickname, presence } of encontrados) novo[nickname] = presence;
        return novo;
      });

      // Se uma dessas respostas é a do par, ela é a coordenada que o arco do
      // globo estava esperando.
      const doPar = encontrados.find((e) => e.nickname === parNicknameRef.current);
      if (doPar?.presence) setParPresenca(doPar.presence);
    };

    const aoConviteChegar = (p: ConviteRecebido) => setConvite(p);

    const aoRecusarem = () => setAviso('A pessoa não está disponível agora.');

    const aoLimitar = ({
      action,
      retryAfterMs,
    }: {
      action: string;
      retryAfterMs: number;
    }) => {
      const s = Math.ceil(retryAfterMs / 1000);
      setAviso(
        action === 'beacon:raise'
          ? `Espere ${s}s para acender outro sinal.`
          : action === 'directory:find'
            ? `Muitas buscas seguidas. Tente de novo em ${s}s.`
            : `Muitos pedidos. Tente de novo em ${s}s.`,
      );
    };

    const aoErro = ({ message }: { message: string }) => setAviso(message);

    if (socket.connected) entrar();
    socket.on('connect', entrar);
    socket.on('disconnect', aoDesconectar);
    socket.on('presence:snapshot', aoSnapshot);
    socket.on('presence:update', aoAtualizarPresenca);
    socket.on('beacon:new', aoBeaconNovo);
    socket.on('beacon:gone', aoBeaconSumir);
    socket.on('directory:result', aoResultadoDaBusca);
    socket.on('connect:incoming', aoConviteChegar);
    socket.on('connect:declined', aoRecusarem);
    socket.on('rate_limited', aoLimitar);
    socket.on('error', aoErro);

    const batida = setInterval(() => {
      if (socket.connected) socket.emit('presence:heartbeat');
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(batida);
      socket.emit('presence:leave');

      /*
       * SÓ OS OUVINTES DESTE EFEITO.
       *
       * Aqui havia um `socket.removeAllListeners()`, e ele apagava também os
       * ouvintes do OUTRO efeito — o do par (`connect:accepted`, `signal`,
       * `peer:disconnected`). Como aquele efeito tem dependências próprias, ele
       * não voltava a registrar nada, e o socket ficava surdo justamente para o
       * aperto de mão.
       *
       * O sintoma, visto acontecendo no teste com dois navegadores: quem
       * convidou nunca abria a conversa, e quem aceitou ficava eternamente em
       * "conectando…". Nenhum erro no console, nenhum erro no servidor — o
       * evento chegava e não havia mais ninguém escutando.
       */
      socket.off('connect', entrar);
      socket.off('disconnect', aoDesconectar);
      socket.off('presence:snapshot', aoSnapshot);
      socket.off('presence:update', aoAtualizarPresenca);
      socket.off('beacon:new', aoBeaconNovo);
      socket.off('beacon:gone', aoBeaconSumir);
      socket.off('directory:result', aoResultadoDaBusca);
      socket.off('connect:incoming', aoConviteChegar);
      socket.off('connect:declined', aoRecusarem);
      socket.off('rate_limited', aoLimitar);
      socket.off('error', aoErro);
    };
    }
  }, [local, carregandoMapa, user?.fullName]);

  // --- O par ----------------------------------------------------------------

  const encerrarChamada = useCallback(() => {
    const socket = getSocket();
    if (peerSocketIdRef.current) {
      socket?.emit('peer:hangup', { peerSocketId: peerSocketIdRef.current });
    }
    peerRef.current?.encerrar();
    peerRef.current = null;
    peerSocketIdRef.current = null;
    parNicknameRef.current = null;
    setParClientId(null);
    setParPresenca(null);
    setParNome(null);
    setEstadoDaChamada(null);
    setDigitando(false);
    // As mensagens somem com o painel: elas só existiam na memória desta aba,
    // e é isso que "não fica gravado em lugar nenhum" quer dizer.
    setMensagens((antigas) => {
      for (const m of antigas) {
        if (m.midiaUrl) URL.revokeObjectURL(m.midiaUrl);
      }
      return [];
    });
    setVideoRemoto(null);
    setVideoLocal(null);
  }, []);

  useEffect(() => {
    // Depende de `socketPronto` porque a conexão agora nasce assíncrona: sem
    // isso este efeito rodaria uma vez, no primeiro render, não acharia socket
    // e ficaria surdo para sempre ao aperto de mão.
    const socket = getSocket();
    if (!socket) return;

    const aoAceitar = ({
      peerSocketId,
      polite,
      iceServers,
    }: {
      peerSocketId: string;
      polite: boolean;
      iceServers: { urls: string | string[]; username?: string; credential?: string }[];
    }) => {
      peerSocketIdRef.current = peerSocketId;

      if (iceServers.length === 0) {
        setAviso(
          'Sem servidores STUN/TURN configurados — a conexão provavelmente não vai fechar.',
        );
      }

      const peer = new PeerConnection(iceServers, polite, {
        onSignal: (data) => socket.emit('signal', { toSocketId: peerSocketId, data }),

        onTexto: (id, texto) =>
          setMensagens((m) => [
            ...m,
            { id, de: 'outro', tipo: 'texto', texto, quando: Date.now() },
          ]),

        onMidia: (id, tipo, midiaUrl, _mime, duracaoMs) =>
          setMensagens((m) => [
            ...m,
            {
              id,
              de: 'outro',
              tipo: tipo === 'audio' ? 'audio' : 'imagem',
              midiaUrl,
              duracaoMs,
              quando: Date.now(),
            },
          ]),

        onDigitando: setDigitando,

        // O recibo chega com o id da mensagem, e só sobe o estado: um "lido"
        // que chegasse antes do "entregue" (rede reordena) não pode rebaixar.
        onRecibo: (id, estado) =>
          setMensagens((m) =>
            m.map((msg) =>
              msg.id === id && msg.de === 'eu'
                ? {
                    ...msg,
                    entrega:
                      msg.entrega === 'lido' ? 'lido' : (estado as EstadoDaEntrega),
                  }
                : msg,
            ),
          ),

        onVideoRemoto: setVideoRemoto,
        onEstado: setEstadoDaChamada,
      });

      peerRef.current = peer;
      peer.iniciar();
    };

    const aoSinal = ({ data }: { data: unknown }) => {
      void peerRef.current?.aoReceberSinal(data);
    };

    const aoDesconectarPar = () => {
      /*
       * SÓ AVISA QUEM NÃO FOI O AUTOR.
       *
       * Encerrar é uma conversa de ida e volta: quem sai avisa o outro, o
       * outro encerra do lado dele e o `peer:hangup` dele volta para cá. Sem
       * esta guarda, quem apertou Esc recebia "a outra pessoa encerrou a
       * conversa" — o aplicativo culpando o outro pelo que a própria pessoa
       * acabou de fazer. Visto acontecendo no teste com dois navegadores.
       *
       * `peerRef.current` já é nulo quando o encerramento partiu daqui, e é
       * isso que distingue os dois casos.
       */
      if (!peerRef.current) return;
      setAviso('A outra pessoa encerrou a conversa.');
      encerrarChamada();
    };

    socket.on('connect:accepted', aoAceitar);
    socket.on('signal', aoSinal);
    socket.on('peer:disconnected', aoDesconectarPar);

    return () => {
      socket.off('connect:accepted', aoAceitar);
      socket.off('signal', aoSinal);
      socket.off('peer:disconnected', aoDesconectarPar);
    };
  }, [encerrarChamada, socketPronto]);

  // --- Busca ----------------------------------------------------------------

  /**
   * Pergunta ao diretório quem, desta lista, está online agora.
   *
   * Em lote de propósito: a lupa mostra vários resultados, e um evento por
   * nome consumiria o limite de taxa do servidor em poucas teclas.
   */
  const verQuemEstaOnline = useCallback((nicknames: string[]) => {
    const limpos = nicknames
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10);
    if (limpos.length === 0) return;
    getSocket()?.emit('directory:find', { nicknames: limpos });
  }, []);

  // --- Ações ----------------------------------------------------------------

  const acenderBeacon = useCallback((topic: string, ttlSec = 900) => {
    getSocket()?.emit('beacon:raise', { topic, ttlSec });
  }, []);

  const apagarBeacon = useCallback(() => {
    getSocket()?.emit('beacon:lower');
  }, []);

  /**
   * Pede conversa. `pessoa` vem da lupa — é dela que saem o nome e a
   * coordenada que o globo usa enquanto o convite não é respondido.
   */
  const pedirConexao = useCallback(
    (targetClientId: string, pessoa?: { nickname?: string; presenca?: Presence | null }) => {
      setParClientId(targetClientId);
      if (pessoa?.nickname) {
        parNicknameRef.current = pessoa.nickname;
        setParNome(pessoa.nickname);
      }
      if (pessoa?.presenca) setParPresenca(pessoa.presenca);
      getSocket()?.emit('connect:request', { targetClientId });
    },
    [],
  );

  const aceitarConvite = useCallback(() => {
    if (!convite) return;
    setParClientId(convite.fromClientId);
    setParNome(convite.fromNickname ?? convite.fromName ?? null);
    parNicknameRef.current = convite.fromNickname ?? null;

    // Quem aceita quase nunca tem a coordenada de quem chamou: a pessoa está
    // em outra região, e a lista de presença desta aba não a contém. Uma
    // consulta ao diretório resolve, e é ela que faz o arco aparecer nos DOIS
    // lados do globo, e não só no de quem procurou.
    if (convite.fromNickname) {
      getSocket()?.emit('directory:find', { nicknames: [convite.fromNickname] });
    }

    getSocket()?.emit('connect:accept', { requestId: convite.requestId });
    setConvite(null);
  }, [convite]);

  const recusarConvite = useCallback(() => {
    if (!convite) return;
    getSocket()?.emit('connect:decline', { requestId: convite.requestId });
    setConvite(null);
  }, [convite]);

  const enviarTexto = useCallback((texto: string) => {
    const limpo = texto.trim().slice(0, 4000);
    if (!limpo) return false;
    const id = peerRef.current?.enviarTexto(limpo);
    if (!id) return false;
    setMensagens((m) => [
      ...m,
      { id, de: 'eu', tipo: 'texto', texto: limpo, quando: Date.now(), entrega: 'enviando' },
    ]);
    return true;
  }, []);

  const enviarMidia = useCallback(
    async (arquivo: Blob, tipo: TipoDeMidia, duracaoMs?: number) => {
      const id = await peerRef.current?.enviarMidia(arquivo, tipo, duracaoMs);
      if (!id) {
        setAviso(
          tipo === 'audio'
            ? 'Não foi possível enviar o áudio (muito grande ou canal fechado).'
            : 'Não foi possível enviar a imagem (muito grande ou canal fechado).',
        );
        return false;
      }
      setMensagens((m) => [
        ...m,
        {
          id,
          de: 'eu',
          tipo: tipo === 'audio' ? 'audio' : 'imagem',
          midiaUrl: URL.createObjectURL(arquivo),
          duracaoMs,
          quando: Date.now(),
          entrega: 'enviando',
        },
      ]);
      return true;
    },
    [],
  );

  const enviarImagem = useCallback(
    (arquivo: Blob) => enviarMidia(arquivo, 'imagem'),
    [enviarMidia],
  );

  const enviarAudio = useCallback(
    (arquivo: Blob, duracaoMs: number) => enviarMidia(arquivo, 'audio', duracaoMs),
    [enviarMidia],
  );

  const avisarDigitando = useCallback((ativo: boolean) => {
    peerRef.current?.enviarDigitando(ativo);
  }, []);

  /**
   * "Eu vi." Avisa o outro lado sobre as mensagens dele que ainda não tinham
   * recibo de leitura. Quem chama é a tela, quando ela está de fato visível —
   * marcar como lido com a aba em segundo plano seria mentira.
   */
  const marcarLidas = useCallback(() => {
    const peer = peerRef.current;
    if (!peer) return;
    setMensagens((atual) => {
      const naoLidas = atual.filter((m) => m.de === 'outro' && !m.entrega);
      if (naoLidas.length === 0) return atual;
      peer.marcarComoLido(naoLidas.map((m) => m.id));
      const ids = new Set(naoLidas.map((m) => m.id));
      return atual.map((m) => (ids.has(m.id) ? { ...m, entrega: 'lido' as const } : m));
    });
  }, []);

  const alternarVideo = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer) return;
    if (videoLocal) {
      peer.desligarVideo();
      setVideoLocal(null);
    } else {
      setVideoLocal(await peer.ligarVideo());
    }
  }, [videoLocal]);

  /**
   * Denunciar e bloquear.
   *
   * Os dois encerram a conversa na hora. Manter o painel aberto depois de
   * denunciar seria obrigar a pessoa a continuar vendo quem ela acabou de
   * dizer que não quer ver.
   */
  const denunciar = useCallback(
    (motivo: string) => {
      if (!parClientId) return;
      getSocket()?.emit('report', { targetClientId: parClientId, reason: motivo });
      encerrarChamada();
      setAviso('Denúncia registrada. Essa pessoa não vai mais te procurar.');
    },
    [parClientId, encerrarChamada],
  );

  const bloquear = useCallback(() => {
    if (!parClientId) return;
    getSocket()?.emit('block', { targetClientId: parClientId });
    encerrarChamada();
    setAviso('Pessoa bloqueada.');
  }, [parClientId, encerrarChamada]);

  const meuBeacon = useMemo(
    () => beacons.find((b) => b.clientId === meuClientIdRef.current) ?? null,
    [beacons],
  );

  /** Minha própria posição no globo, para a ponta de cá do arco. */
  const minhaPresenca = useMemo<Presence | null>(
    () =>
      local
        ? {
            clientId: meuClientIdRef.current,
            lat: local.lat,
            lon: local.lon,
            regionKey: local.regionKey,
            ...(meuNickname ? { nickname: meuNickname } : {}),
          }
        : null,
    [local, meuNickname],
  );

  const estado: EstadoDoRealtime = {
    ligado: isRealtimeEnabled,
    conectado,
    presencas,
    beacons,
    meuBeacon,
    convite,
    emChamada: peerRef.current !== null,
    estadoDaChamada,
    parClientId,
    parPresenca,
    parNome,
    mensagens,
    digitando,
    videoRemoto,
    videoLocal,
    aviso,
  };

  return {
    estado,
    meuClientId: meuClientIdRef.current,
    meuNickname,
    /** Para quem precisa esperar a conexao existir (ver useConversas). */
    socketPronto,
    minhaPresenca,
    presencaPorNickname,
    verQuemEstaOnline,
    acenderBeacon,
    apagarBeacon,
    pedirConexao,
    aceitarConvite,
    recusarConvite,
    enviarTexto,
    enviarImagem,
    enviarAudio,
    avisarDigitando,
    marcarLidas,
    alternarVideo,
    encerrarChamada,
    denunciar,
    bloquear,
    limparAviso: () => setAviso(null),
  };
}
