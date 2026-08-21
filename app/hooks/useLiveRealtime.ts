'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PeerConnection, type EstadoDaConexao } from '@/lib/realtime/peer';
import { getSocket, isRealtimeEnabled } from '@/lib/realtime/socket';
import type { Beacon, Presence } from '@/realtime/shared/protocol';
import { HEARTBEAT_INTERVAL_MS } from '@/realtime/shared/protocol';
import { useGeoMapping } from '@/app/hooks/useGeoMapping';
import type { UserProfileData } from '@/app/types/user';

/**
 * Presença, beacons e a conversa ao vivo — do lado do navegador.
 *
 * Um hook só, e não três, porque as três coisas são o mesmo fio: a presença
 * diz onde você está, o beacon anuncia que você quer conversa, e o convite
 * aceito vira o canal P2P. Separá-los obrigaria a compartilhar o socket, o
 * par e o estado da negociação entre hooks — que é o mesmo estado, só que
 * espalhado.
 *
 * O QUE É EFÊMERO E O QUE É GRAVADO: tudo aqui é efêmero. Nenhuma mensagem
 * desta conversa toca o Neon. O que o projeto persiste é outra coisa (perfil e
 * comportamento), e continua onde estava.
 */

export interface MensagemDoChat {
  id: string;
  de: 'eu' | 'outro';
  texto?: string;
  imagemUrl?: string;
  quando: number;
}

export interface ConviteRecebido {
  requestId: string;
  fromClientId: string;
  fromName?: string;
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
  mensagens: MensagemDoChat[];
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
  const [estadoDaChamada, setEstadoDaChamada] = useState<EstadoDaConexao | null>(null);
  const [parClientId, setParClientId] = useState<string | null>(null);
  const [videoRemoto, setVideoRemoto] = useState<MediaStream | null>(null);
  const [videoLocal, setVideoLocal] = useState<MediaStream | null>(null);
  const [conectado, setConectado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const peerRef = useRef<PeerConnection | null>(null);
  const peerSocketIdRef = useRef<string | null>(null);
  const meuClientIdRef = useRef<string>('');

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

    const socket = getSocket();
    if (!socket) return;

    const clientId = localStorage.getItem('globoClientId') ?? `anon-${idNovo()}`;
    meuClientIdRef.current = clientId;

    const entrar = () => {
      setConectado(true);
      socket.emit('presence:join', {
        clientId,
        lat: local.lat,
        lon: local.lon,
        regionKey: local.regionKey,
        ...(user?.fullName ? { name: user.fullName.split(' ')[0] } : {}),
      });
    };

    if (socket.connected) entrar();
    socket.on('connect', entrar);
    socket.on('disconnect', () => setConectado(false));

    socket.on('presence:snapshot', ({ presences, beacons: bs }) => {
      setPresencas(presences);
      setBeacons(bs);
    });

    socket.on('presence:update', ({ kind, presence }) => {
      setPresencas((atual) => {
        const semEle = atual.filter((p) => p.clientId !== presence.clientId);
        return kind === 'leave' ? semEle : [...semEle, presence];
      });
    });

    socket.on('beacon:new', (b) => {
      setBeacons((atual) => [...atual.filter((x) => x.beaconId !== b.beaconId), b]);
    });

    socket.on('beacon:gone', ({ beaconId }) => {
      setBeacons((atual) => atual.filter((b) => b.beaconId !== beaconId));
    });

    socket.on('connect:incoming', (p) => setConvite(p));

    socket.on('connect:declined', () =>
      setAviso('A pessoa não está disponível agora.'),
    );

    socket.on('rate_limited', ({ action, retryAfterMs }) => {
      const s = Math.ceil(retryAfterMs / 1000);
      setAviso(
        action === 'beacon:raise'
          ? `Espere ${s}s para acender outro sinal.`
          : `Muitos pedidos. Tente de novo em ${s}s.`,
      );
    });

    socket.on('error', ({ message }) => setAviso(message));

    const batida = setInterval(() => {
      if (socket.connected) socket.emit('presence:heartbeat');
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(batida);
      socket.emit('presence:leave');
      socket.removeAllListeners();
    };
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
    setParClientId(null);
    setEstadoDaChamada(null);
    setMensagens([]);
    setVideoRemoto(null);
    setVideoLocal(null);
  }, []);

  useEffect(() => {
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
        onTexto: (texto) =>
          setMensagens((m) => [
            ...m,
            { id: idNovo(), de: 'outro', texto, quando: Date.now() },
          ]),
        onImagem: (imagemUrl) =>
          setMensagens((m) => [
            ...m,
            { id: idNovo(), de: 'outro', imagemUrl, quando: Date.now() },
          ]),
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
  }, [encerrarChamada]);

  // --- Ações ----------------------------------------------------------------

  const acenderBeacon = useCallback((topic: string, ttlSec = 900) => {
    getSocket()?.emit('beacon:raise', { topic, ttlSec });
  }, []);

  const apagarBeacon = useCallback(() => {
    getSocket()?.emit('beacon:lower');
  }, []);

  const pedirConexao = useCallback((targetClientId: string) => {
    setParClientId(targetClientId);
    getSocket()?.emit('connect:request', { targetClientId });
  }, []);

  const aceitarConvite = useCallback(() => {
    if (!convite) return;
    setParClientId(convite.fromClientId);
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
    if (!limpo || !peerRef.current?.enviarTexto(limpo)) return false;
    setMensagens((m) => [
      ...m,
      { id: idNovo(), de: 'eu', texto: limpo, quando: Date.now() },
    ]);
    return true;
  }, []);

  const enviarImagem = useCallback(async (arquivo: Blob) => {
    const ok = await peerRef.current?.enviarImagem(arquivo);
    if (!ok) {
      setAviso('Não foi possível enviar a imagem (muito grande ou canal fechado).');
      return false;
    }
    setMensagens((m) => [
      ...m,
      {
        id: idNovo(),
        de: 'eu',
        imagemUrl: URL.createObjectURL(arquivo),
        quando: Date.now(),
      },
    ]);
    return true;
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
    mensagens,
    videoRemoto,
    videoLocal,
    aviso,
  };

  return {
    estado,
    meuClientId: meuClientIdRef.current,
    acenderBeacon,
    apagarBeacon,
    pedirConexao,
    aceitarConvite,
    recusarConvite,
    enviarTexto,
    enviarImagem,
    alternarVideo,
    encerrarChamada,
    denunciar,
    bloquear,
    limparAviso: () => setAviso(null),
  };
}
