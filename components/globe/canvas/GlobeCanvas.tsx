'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { useGlobeStateAndHandlers } from '@/app/hooks/useGlobeStateAndHandlers';
import { usePopupContent } from '@/app/hooks/usePopupContent';
import { useMessageSystem } from '@/app/hooks/useMessageSystem';
import { useGeoMapping } from '@/app/hooks/useGeoMapping';
import { useBehaviorTracker } from '@/app/hooks/useBehaviorTracker';
import { useLiveRealtime, type PessoaEncontrada } from '@/app/hooks/useLiveRealtime';
import { useConversas } from '@/app/hooks/useConversas';

import GlobeScene from './GlobeScene';
import type { AlvoDoFoco } from './PersonFocus';
import StatePopup from '@/components/globe/ui/StatePopup';
import CountryPopup from '@/components/globe/ui/CountryPopup';
import TravelPopup from '@/components/globe/ui/TravelPopup';
import BaggagePopup from '@/components/globe/ui/BaggagePopup';
import VacationPopup from '@/components/globe/ui/VacationPopup';
import AdminAnimationPopup from '@/components/globe/ui/AdminAnimationPopup';
import UserProfilePopup from '@/components/globe/ui/UserProfilePopup';
import MenuPopup from '@/components/globe/ui/MenuPopup';
import MyNewsPopup from '@/components/globe/ui/MyNewsPopup';
import MyTouristSitesPopup from '@/components/globe/ui/MyTouristSitesPopup';
import DynamicNewsPopup from '@/components/globe/ui/DynamicNewsPopup';
import AdvertisePopup from '@/components/globe/ui/AdvertisePopup';
import TourismPopup from '@/components/globe/ui/TourismPopup';
import MyVacationSpotsPopup from '@/components/globe/ui/MyVacationSpotsPopup';
import MessageInputPopup from '@/components/globe/ui/MessageInputPopup';
import GlobeModeToggle, { GlobeMode } from '@/components/globe/ui/GlobeModeToggle';
import AdminLoginPopup from '@/components/globe/ui/AdminLoginPopup';
import ModeracaoPanel from '@/components/globe/ui/ModeracaoPanel';
import GlobeClock from '@/components/globe/ui/GlobeClock';
import { latLonToVector3 } from '@/components/lib/utils';
import type { Beacon } from '@/realtime/shared/protocol';
import ChatOverlay from '@/components/globe/ui/ChatOverlay';
import PeopleSearchPanel from '@/components/globe/ui/PeopleSearchPanel';
import ConversasPanel from '@/components/globe/ui/ConversasPanel';
import GrupoDeSinaisPanel from '@/components/globe/ui/GrupoDeSinaisPanel';
import SinalPanel from '@/components/globe/ui/SinalPanel';
import LinhaDoTempo from '@/components/globe/ui/LinhaDoTempo';
import MenuDeAcoes from '@/components/globe/ui/MenuDeAcoes';
import NoticiasPanel from '@/components/globe/ui/NoticiasPanel';
import SinaisDoMundoPanel from '@/components/globe/ui/SinaisDoMundoPanel';
import PerfilPanel from '@/components/globe/ui/PerfilPanel';
import PerfilDeOutroPanel from '@/components/globe/ui/PerfilDeOutroPanel';
import { registrarWorker } from '@/lib/push/avisos';
import EscolherLugar from '@/components/globe/ui/EscolherLugar';
import EscolherNickname from '@/components/globe/ui/EscolherNickname';

import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import ClearPinsButton from '@/components/ui/ClearPinsButton';
import LockControl from '@/components/ui/LockControl';
import SettingsIcon from '@/app/icons/SettingsIcon';

import {
  GlobalNewsItem,
  NewsCategory,
  PlaceContent,
  CountryContent,
} from '@/app/types/globe';


/**
 * Abertura da camera, em graus.
 *
 * NAO aumente isto para tentar ver mais nomes — foi medido e faz o contrario.
 * O nivel de detalhe dos rotulos vem do `viewZoom()`, que mede QUANTOS GRAUS de
 * globo cabem na altura da tela. Abrir a lente faz caber mais graus, entao o
 * app se comporta como se voce tivesse afastado: passa a mostrar menos nomes e
 * mais grossos. Em 58 graus, os nomes colocados cairam de 8 para 2.
 *
 * Para ver mais nomes, os controles certos estao em app/lib/globeLabels.ts:
 * `uiBlockedRects` (area reservada a interface), o fator do horizonte em
 * `placeLabels` e `maxLabelsForViewport`.
 */
const CAMERA_FOV = 50;

const useAllNews = (
  rawContentData: ReturnType<typeof usePopupContent>['rawContentData'],
  translations: ReturnType<typeof usePopupContent>['translations'],
) => {
  return useMemo(() => {
    const allNews: GlobalNewsItem[] = [];
    if (!rawContentData || !translations) return allNews;
    const categoryLabels: Record<NewsCategory, string> = {
      local: 'Local',
      science: 'Ciência',
      business: 'Negócios',
      entertainment: 'Entretenimento',
      sports: 'Esportes',
      health: 'Saúde',
    };
    for (const placeKey in rawContentData) {
      if (placeKey === 'default') continue;
      const content = rawContentData[placeKey];
      if (content && content.news) {
        const placeName = translations[placeKey] || placeKey;
        for (const categoryKey in content.news) {
          const catKeyTyped = categoryKey as NewsCategory;
          const articles = content.news[catKeyTyped];
          if (articles) {
            articles.forEach((article) => {
              allNews.push({
                placeKey,
                placeName,
                categoryKey: catKeyTyped,
                categoryLabel: categoryLabels[catKeyTyped] || catKeyTyped,
                article,
              });
            });
          }
        }
      }
    }
    return allNews;
  }, [rawContentData, translations]);
};

// Logger da câmera
const CameraStateLogger = ({ cameraStateRef }: { cameraStateRef: React.MutableRefObject<{ position: THREE.Vector3, quaternion: THREE.Quaternion }> }) => {
    const { camera } = useThree();
    useFrame(() => {
        cameraStateRef.current.position.copy(camera.position);
        cameraStateRef.current.quaternion.copy(camera.quaternion);
    });
    return null;
};

export default function GlobeCanvas() {
  const { states, setters, handlers, externalData } =
    useGlobeStateAndHandlers();

  const allNewsItems = useAllNews(
    externalData.rawContentData,
    externalData.translations,
  );

  const {
    isMessagePopupOpen,
    handleOpenMessagePopup,
    handleCloseMessagePopup,
    flyingMessages,
    addMessage,
    removeMessage,
  } = useMessageSystem();

  const { keyToVector3, keyToLatLon } = useGeoMapping();

  // Coletor do algoritmo de comportamento. Nada aqui roda por quadro: os
  // eventos vao para uma fila e sao descarregados em lote.
  const { track, startDwell, endDwell } = useBehaviorTracker();

  /**
   * Um local aberto conta duas vezes para o algoritmo: o interesse em abrir, e
   * o tempo que a pessoa ficou lendo. O segundo vale mais — abrir por engano e
   * fechar em um segundo nao e sinal de nada.
   */
  const abertoRef = useRef<string | null>(null);
  useEffect(() => {
    const atual = states.popupNameKey;
    const anterior = abertoRef.current;
    if (atual === anterior) return;

    if (anterior) endDwell(`local:${anterior}`, { regionKey: anterior });
    if (atual) {
      startDwell(`local:${atual}`);
      track({ kind: 'region_view', regionKey: atual });
    }
    abertoRef.current = atual;
  }, [states.popupNameKey, track, startDwell, endDwell]);

  /** Categoria de noticia escolhida: sinal direto de assunto preferido. */
  useEffect(() => {
    if (!states.popupNameKey || !states.newsCategory) return;
    track({
      kind: 'news_open',
      regionKey: states.popupNameKey,
      topic: states.newsCategory,
    });
  }, [states.popupNameKey, states.newsCategory, track]);

  // Modo do globo. Fica no localStorage para o usuário não ter que reescolher
  // a cada visita.
  const [globeMode, setGlobeMode] = useState<GlobeMode>('padrao');
  useEffect(() => {
    const saved = localStorage.getItem('globeMode');
    if (saved === 'padrao' || saved === 'relogio') setGlobeMode(saved);
  }, []);
  const handleGlobeModeChange = (next: GlobeMode) => {
    setGlobeMode(next);
    localStorage.setItem('globeMode', next);
  };

  // Sessão de administrador. Fica em sessionStorage (e não localStorage) para
  // acabar quando a aba fecha — o painel não é para ficar aberto por descuido.
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  /**
   * A fila de moderacao.
   *
   * NAO ABRE SOZINHA no login, ao contrario da tela de animacoes. Entrar como
   * administrador e' a coisa mais comum do mundo (trocar uma configuracao, ver
   * um numero); cair direto numa fila de denuncias transformaria todo login num
   * plantao.
   */
  const [moderacaoAberta, setModeracaoAberta] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem('globeAdmin') === '1') setIsAdmin(true);
  }, []);
  const handleAdminSuccess = () => {
    setIsAdmin(true);
    sessionStorage.setItem('globeAdmin', '1');
    setIsAdminLoginOpen(false);
    handlers.handleOpenAdminAnimPopup();
  };
  const handleAdminExit = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('globeAdmin');
  };

  const cameraStateRef = useRef({
      position: new THREE.Vector3(0, 0, 3),
      quaternion: new THREE.Quaternion(),
  });

  /**
   * Conversa ao vivo: presenca, beacons e o canal P2P.
   *
   * Sem NEXT_PUBLIC_REALTIME_URL configurada, o hook nao conecta em nada e
   * tudo isto simplesmente nao aparece — o globo segue igual ao que era.
   */
  const realtime = useLiveRealtime(states.currentUser);

  /**
   * As conversas. Nao dependem do realtime estar conectado para EXISTIR — o
   * historico vem do proprio aparelho —, so para enviar e receber.
   */
  const conversas = useConversas(
    realtime.meuNickname,
    realtime.socketPronto,
    // Mensagem ou digitacao chegando = a pessoa esta' online AGORA. Uma
    // consulta ao diretorio confirma e traz a posicao dela para o globo.
    (nick) => realtime.verQuemEstaOnline([nick]),
  );

  /** Quantas mensagens esperam resposta, somando todas as conversas. */
  const totalNaoLidas = useMemo(
    () =>
      Object.values(conversas.naoLidasPorConversa).reduce((a, b) => a + b, 0),
    [conversas.naoLidasPorConversa],
  );

  /** A lupa: painel aberto e a pessoa que o globo esta olhando agora. */
  /**
   * A placa de video largou o globo?
   *
   * `webglcontextlost` acontece de verdade e com mais frequencia do que
   * parece: memoria de video no limite (celular, placa integrada), o sistema
   * reiniciando o driver, a aba ficando muito tempo em segundo plano. Quando
   * acontece, o three.js escreve "Context Lost" no console e o canvas para
   * para sempre — sem tratamento, o usuario ve uma tela preta e conclui que o
   * site quebrou. Foi exatamente o que aconteceu aqui.
   *
   * Nao da para "consertar" a cena no lugar: texturas, geometrias e programas
   * de shader morreram com o contexto. O caminho honesto e' dizer o que houve
   * e oferecer o recarregar.
   */
  const [contextoPerdido, setContextoPerdido] = useState(false);

  /**
   * Isto aqui e' um aparelho de toque?
   *
   * Decidido UMA VEZ e guardado: ler `matchMedia` durante a renderizacao faria
   * a resposta mudar entre servidor e navegador e o React reclamaria. E nao
   * muda no meio do uso — ninguem troca de telefone com a pagina aberta.
   */
  const [ehTelaDeToque, setEhTelaDeToque] = useState(false);
  useEffect(() => {
    setEhTelaDeToque(
      window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 820,
    );
  }, []);

  const [buscaAberta, setBuscaAberta] = useState(false);
  const [conversasAbertas, setConversasAbertas] = useState(false);

  /**
   * O "ONLINE" DO CHAT E' VIVO, e nao uma foto tirada ao abrir.
   *
   * O DEFEITO, medido em producao: o outro lado conectava e a bolinha ficava
   * cinza ate' a pessoa recarregar a pagina. A consulta ao diretorio
   * (`directory:find`) era feita UMA vez, ao abrir a conversa; e o
   * `presence:update`, que avisa sozinho, so' cobre quem esta' na mesma
   * celula de 2 km — o outro lado de uma conversa quase nunca esta'.
   *
   * Houve uma fase em que a pergunta era refeita a cada 10 s enquanto a
   * conversa estava aberta. Era remendo: dez segundos de atraso no melhor
   * caso, e "online" ainda significando "desenhado no globo".
   *
   * Agora o aparelho diz UMA VEZ quem esta' na tela (`observar`) e o servidor
   * avisa no instante em que qualquer uma dessas contas conecta ou
   * desconecta. Sem relogio, sem recarregar a pagina.
   */
  const conversaAbertaCom = conversas.abertaCom;
  const contatos = useMemo(
    () => Object.keys(conversas.conversas).slice(0, 10),
    [conversas.conversas],
  );
  useEffect(() => {
    if (!realtime.socketPronto) return;
    // A conversa aberta E os contatos: fechar a conversa e voltar a' lista nao
    // pode deixar a bolinha de ninguem congelada no estado de antes.
    const alvo = [...new Set([...(conversaAbertaCom ? [conversaAbertaCom] : []), ...contatos])];
    realtime.observar(alvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaAbertaCom, contatos, realtime.socketPronto]);
  const [pedindoNickname, setPedindoNickname] = useState(false);
  const [pedindoLugar, setPedindoLugar] = useState(false);
  /** Os sinais de um marcador agrupado, quando a pessoa toca nele. */
  const [grupoDeSinais, setGrupoDeSinais] = useState<Beacon[] | null>(null);
  /** O sinal aberto, quando a pessoa toca em um. */
  const [sinalAberto, setSinalAberto] = useState<Beacon | null>(null);
  /** A lista mundial de quem quer conversar. */
  const [sinaisAbertos, setSinaisAbertos] = useState(false);
  const [muralAberto, setMuralAberto] = useState(false);
  const [noticiasAbertas, setNoticiasAbertas] = useState(false);
  /** A tela de editar o proprio perfil. */
  const [perfilAberto, setPerfilAberto] = useState(false);
  /** O perfil de OUTRA pessoa, quando se toca no nome dela. */
  const [perfilDeOutro, setPerfilDeOutro] = useState<string | null>(null);

  /*
   * O QUE FAZER QUANDO A PESSOA TOCA NA NOTIFICACAO.
   *
   * Duas portas levam aqui, e as duas precisam abrir a mesma conversa: o app
   * ja' estava aberto (o service worker manda um recado para a aba) ou estava
   * fechado (ele abre a pagina com `?conversa=` na URL).
   *
   * A URL e' limpa depois de lida: deixar o parametro faria a conversa reabrir
   * sozinha toda vez que a pessoa recarregasse a pagina, dias depois.
   */
  useEffect(() => {
    const daUrl = new URLSearchParams(window.location.search).get('conversa');
    if (daUrl) {
      conversas.abrirConversa(daUrl.toLowerCase());
      window.history.replaceState({}, '', window.location.pathname);
    }

    const aoRecado = (e: MessageEvent) => {
      if (e.data?.tipo !== 'abrir-conversa' || !e.data?.com) return;
      conversas.abrirConversa(String(e.data.com).toLowerCase());
    };
    navigator.serviceWorker?.addEventListener('message', aoRecado);
    return () => navigator.serviceWorker?.removeEventListener('message', aoRecado);
    // Roda uma vez: `abrirConversa` e' estavel (useCallback sem dependencias).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * REGISTRA O SERVICE WORKER assim que a pagina abre.
   *
   * Registrar NAO pede permissao nenhuma e nao mostra nada — e' so' o que faz
   * o navegador considerar o site instalavel e ter onde entregar um empurrao
   * depois. O pedido de permissao continua nascendo de um gesto, dentro da
   * conversa (ver ConviteDeAvisos).
   */
  useEffect(() => {
    void registrarWorker();
  }, []);

  /**
   * Entrou na conversa sem ter nome público?
   *
   * Conta criada antes do nickname existir consegue mandar mensagem, mas do
   * outro lado a conversa aparece como "?" e nao da para responder. Em vez de
   * deixar a pessoa descobrir isso do pior jeito, o pedido aparece na hora em
   * que ela vai usar a parte social.
   */
  const precisaDeNickname = realtime.estado.ligado && !realtime.meuNickname;
  const [alvoDaBusca, setAlvoDaBusca] = useState<AlvoDoFoco | null>(null);

  /**
   * Leva o globo ate a pessoa.
   *
   * A coordenada preferida e a da PRESENCA (onde ela esta agora); a do
   * cadastro so entra quando ela esta offline. As duas costumam ser a mesma
   * cidade, mas quando nao sao, e a presenca que esta certa.
   */
  const verPessoaNoGlobo = useCallback(
    (pessoa: PessoaEncontrada) => {
      const daPresenca = pessoa.presenca;
      const chave = [pessoa.city, pessoa.state, pessoa.country]
        .filter((v): v is string => Boolean(v && v.trim()))
        .map((v) => v.trim().toLowerCase());

      let lat = daPresenca?.lat;
      let lon = daPresenca?.lon;

      if (lat === undefined || lon === undefined) {
        for (const c of chave) {
          const coord = keyToLatLon(c);
          if (coord) {
            lat = coord.lat;
            lon = coord.lon;
            break;
          }
        }
      }

      if (lat === undefined || lon === undefined) return false;

      setAlvoDaBusca({
        lat,
        lon,
        nickname: pessoa.nickname,
        online: Boolean(daPresenca),
        // O instante e o que reabre a viagem quando a MESMA pessoa e
        // escolhida de novo — sem ele, o segundo clique nao mudaria nada.
        pedidoEm: Date.now(),
      });
      return true;
    },
    [keyToLatLon],
  );

  /**
   * As duas pontas do arco.
   *
   * Saem da lista de presencas, que ja tem a coordenada de cada um: converter
   * aqui evita guardar a mesma posicao em dois lugares e elas discordarem.
   */
  const arco = useMemo(() => {
    const { presencas, parClientId, parPresenca } = realtime.estado;
    if (!parClientId) return null;

    const eu =
      realtime.minhaPresenca ??
      presencas.find((p) => p.clientId === realtime.meuClientId);

    // A presenca do par vem do DIRETORIO quando ele esta em outra regiao — que
    // e o caso comum de quem se achou pela lupa. A lista de presencas so
    // enxerga a propria regiao, e usar so ela deixava o arco sem desenhar
    // justamente na conversa mais interessante, a de longe.
    const outro = parPresenca ?? presencas.find((p) => p.clientId === parClientId);
    if (!eu || !outro) return null;

    return {
      de: latLonToVector3(eu.lat, eu.lon, 1.5),
      para: latLonToVector3(outro.lat, outro.lon, 1.5),
    };
  }, [realtime.estado, realtime.meuClientId, realtime.minhaPresenca]);

  /**
   * Chamada de video aceita: abre a conversa daquela pessoa.
   *
   * O video e' desenhado DENTRO da conversa, entao sem isto uma chamada
   * aceita ficaria acontecendo sem tela nenhuma — com a camera ligada e nada
   * aparecendo.
   */
  useEffect(() => {
    const { emChamada, parNome } = realtime.estado;
    if (emChamada && parNome) conversas.abrirConversa(parNome);
  }, [realtime.estado.emChamada, realtime.estado.parNome, conversas.abrirConversa]);

  // --- LÓGICA DE DESTINO INTELIGENTE ---
  const handleSendMessage = (text: string, destination: string) => {
    let targetVector: THREE.Vector3 | null = null;
    
    // Se o usuário digitou um destino
    if (destination && destination.trim() !== '') {
        const lowerDest = destination.toLowerCase().trim();
        
        // Procura nos locais disponíveis (flightLocations)
        // 1. Tenta correspondência exata primeiro (Nome ou Chave)
        let foundLoc = externalData.flightLocations.find(
            loc => loc.name.toLowerCase() === lowerDest || loc.key.toLowerCase() === lowerDest
        );

        // 2. Se não achar exato, tenta "contém" (ex: "Paulo" acha "São Paulo")
        if (!foundLoc) {
            foundLoc = externalData.flightLocations.find(
                loc => loc.name.toLowerCase().includes(lowerDest)
            );
        }

        if (foundLoc) {
            // Converte para coordenada 3D
            const vec = keyToVector3(foundLoc.key, 1.5);
            if (vec) {
                targetVector = vec;
                console.log(`Mensagem viajando para: ${foundLoc.name}`);
            }
        } else {
            console.log(`Destino "${destination}" não encontrado, enviando para o centro.`);
        }
    }

    // Adiciona a mensagem ao sistema (com ou sem alvo específico)
    addMessage(text, cameraStateRef.current, targetVector);
  };

  return (
    <div
      className="w-full app-viewport bg-black relative"
      style={{ overscrollBehavior: 'none' }}
    >
      <Canvas
        /*
         * O GLOBO PARA DE DESENHAR ENQUANTO A CONVERSA ESTA' ABERTA.
         *
         * A conversa cobre a tela inteira, e o globo continuava rodando a 60
         * quadros por segundo embaixo dela — 27 mil luzes, fronteiras,
         * rotulos, tudo para ninguem ver. No celular, isso e' a GPU inteira
         * ocupada com o que esta' escondido, e o que esta' na frente (a lista
         * de mensagens rolando) fica com as sobras. Foi sentido assim: "um
         * peso ao dar scroll".
         *
         * `never` congela o ultimo quadro; ao fechar a conversa, `always`
         * retoma de onde parou. Nada fora do canvas e' afetado: socket,
         * presenca e caixa postal continuam vivos.
         */
        frameloop={conversas.abertaCom ? 'never' : 'always'}
        /*
         * QUANTOS PIXELS DESENHAR, e no celular esta e' a conta que mais pesa.
         *
         * Um telefone moderno tem densidade 3: a tela de 400 pontos de largura
         * quer 1200 pixels de verdade. Desenhar tudo nessa densidade e' NOVE
         * vezes mais trabalho de preenchimento que desenhar em 1 — e o globo e'
         * feito de superficie, que e' exatamente o que custa preenchimento.
         *
         * Em 1,5 a diferenca visual num globo em movimento e' dificil de notar,
         * e o custo cai para um quarto. No computador, onde sobra folga, fica
         * como estava.
         */
        dpr={ehTelaDeToque ? [1, 1.5] : [1, 2]}
        camera={{ position: [0, 0, 3], fov: CAMERA_FOV, near: 0.1, far: 1000 }}
        onCreated={({ gl }) => {
          const tela = gl.domElement;
          tela.addEventListener('webglcontextlost', (evento) => {
            // `preventDefault` e' o que autoriza o navegador a tentar devolver
            // o contexto depois. Sem isso a perda e' definitiva.
            evento.preventDefault();
            setContextoPerdido(true);
          });
          tela.addEventListener('webglcontextrestored', () => setContextoPerdido(false));
        }}
        gl={{
          powerPreference: 'high-performance',
          /*
           * Suavizacao de bordas so' onde ela se paga.
           *
           * O antialias e' uma segunda passada sobre cada pixel. Em densidade
           * alta as bordas ja' saem suaves porque os pixels sao menores que o
           * olho resolve — entao no celular ele cobra caro por algo que quase
           * nao se ve.
           */
          antialias: !ehTelaDeToque,
          stencil: false,
          depth: true,
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      >
        <CameraStateLogger cameraStateRef={cameraStateRef} />

        <Suspense fallback={null}>
          <GlobeScene
            isPopupOpen={states.isAnyPopupOpen || isMessagePopupOpen}
            popupName={states.popupNameKey}
            openPopup={handlers.openPopup}
            closePopup={handlers.closeAllPopups}
            flightPath={states.flightPath}
            pinnedLocations={states.pinnedLocations}
            tourismPin={states.tourismPin}
            animationState={externalData.animationState}
            setIsZoomedIn={setters.setIsZoomedIn}
            isZoomedIn={states.isZoomedIn}
            activeAds={states.activeAds}
            countryLabels={externalData.countryLabels}
            continentLabels={externalData.continentLabels}
            isLoadingLabels={externalData.isLoadingLabels}
            flyingMessages={flyingMessages}
            onMessageComplete={removeMessage}
            globeMode={globeMode}
            beacons={realtime.estado.beacons}
            meuClientId={realtime.meuClientId}
            onPedirConexao={realtime.pedirConexao}
            onAbrirSinal={setSinalAberto}
            onAbrirGrupoDeSinais={setGrupoDeSinais}
            arco={arco}
            arcoAtivo={realtime.estado.estadoDaChamada === 'conectado'}
            alvoDaBusca={alvoDaBusca}
          />
        </Suspense>
      </Canvas>

      {/* A camada da interface para acima da area segura do celular, entao
          tudo que e ancorado embaixo (rodape, cadeado, limpar pinos e a coluna
          de botoes) sobe junto e deixa de ficar sob a barra do navegador. O
          canvas do globo e irmao disto e segue ocupando a tela inteira. */}
      <div className="absolute top-0 left-0 w-full z-10 pointer-events-none ui-safe-layer">
        <div className="pointer-events-auto">
          {/*
            A BORDA DIREITA E' DA LINHA DO TEMPO enquanto ela estiver aberta —
            inclusive minimizada, quando a faixa ocupa a coluna inteira. O
            hamburguer, o cadeado e os botoes de administrador ficavam por
            baixo, com a metade esquerda a mostra: "partes do botao aparecendo,
            como se a tela de botoes estivesse escondida por baixo". Era
            exatamente isso. Dois conjuntos de alvos no mesmo lugar nao sao
            dois conjuntos; sao um toque errado.
          */}
          <AppHeader
            isVisible={states.isMainUiVisible && !muralAberto}
            onMenuClick={handlers.handleOpenMenuPopup}
          />
          <AppFooter
            isVisible={states.isMainUiVisible && !muralAberto}
            onVacationClick={() => {
              track({ kind: 'search' });
              handlers.handleOpenVacationPopup();
            }}
          />
        </div>
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <GlobeModeToggle
            mode={globeMode}
            onChange={handleGlobeModeChange}
            isVisible={states.isMainUiVisible}
            className="top-[4.5rem] left-4 pointer-events-auto"
          />
          {/* Relogio so no modo Relogio: e ele que explica de onde vem a
              posicao do terminador. */}
          <GlobeClock
            isVisible={states.isMainUiVisible && globeMode === 'relogio'}
            className="top-[4.5rem] left-1/2 -translate-x-1/2 pointer-events-none"
          />
          {!muralAberto && (
          <LockControl
            isVisible={states.isUiVisible}
            onLockClick={handlers.handleLockClick}
            className="pointer-events-auto"
          />
          )}
          {/*
            A COLUNA DE DEZ BOTOES VIROU UM MENU.

            Eram dez, empilhados, cada um com um estilo proprio — e dez botoes
            nao sao dez escolhas, sao uma parede que a pessoa aprende a ignorar.
            O globo, que e' o produto, ficava espiando por entre eles.

            Agora a tela comeca vazia e cada pessoa fixa o que usa. "Ferias"
            fica fora daqui de proposito: ele vive no rodape, e nao na coluna.
          */}
          <MenuDeAcoes
            /*
              SOME COM A LINHA DO TEMPO ABERTA. Minimizada, ela ocupa a mesma
              borda direita com a faixa de cores — e dois conjuntos de alvos no
              mesmo lugar nao sao dois conjuntos, sao um toque errado.
            */
            visivel={states.isMainUiVisible && !muralAberto}
            bloqueado={states.isAnyPopupOpen}
            acoes={[
              ...(realtime.estado.ligado
                ? [
                    {
                      id: 'mural',
                      rotulo: 'Linha do tempo',
                      descricao: 'O que o mundo publicou hoje',
                      cor: '#059669',
                      onSelecionar: () =>
                        precisaDeNickname
                          ? setPedindoNickname(true)
                          : setMuralAberto(true),
                      icone: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="3" y="4" width="18" height="16" rx="2" />
                          <path d="M7 9h10M7 13h6" strokeLinecap="round" />
                        </svg>
                      ),
                    },
                    {
                      id: 'conversas',
                      rotulo: 'Conversas',
                      descricao: 'Suas mensagens',
                      cor: '#475569',
                      contador: totalNaoLidas,
                      onSelecionar: () =>
                        precisaDeNickname
                          ? setPedindoNickname(true)
                          : setConversasAbertas(true),
                      icone: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 10.5h8M8 14h5M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.9-.4-4.1-1L3 21l1.6-5A8.5 8.5 0 1 1 21 12z"
                          />
                        </svg>
                      ),
                    },
                    {
                      id: 'sinais',
                      rotulo: 'Quem quer falar',
                      descricao: 'Sinais acesos no mundo inteiro',
                      cor: '#0e7490',
                      onSelecionar: () => setSinaisAbertos(true),
                      icone: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
                        </svg>
                      ),
                    },
                    {
                      id: 'busca',
                      rotulo: 'Procurar',
                      descricao: 'Achar alguem pelo nickname',
                      cor: '#64748b',
                      onSelecionar: () =>
                        precisaDeNickname
                          ? setPedindoNickname(true)
                          : setBuscaAberta(true),
                      icone: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="7" />
                          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                        </svg>
                      ),
                    },
                    {
                      id: 'sinal',
                      rotulo: realtime.estado.meuBeacon
                        ? 'Apagar meu sinal'
                        : 'Acender sinal',
                      descricao: 'Quem quiser conversar te encontra',
                      cor: realtime.estado.meuBeacon ? '#22d3ee' : '#0891b2',
                      desativado: !realtime.estado.conectado,
                      onSelecionar: () => {
                        // Sem lugar no globo nao ha' de onde acender o sinal.
                        if (realtime.semLugar) {
                          setPedindoLugar(true);
                          return;
                        }
                        if (realtime.estado.meuBeacon) realtime.apagarBeacon();
                        else realtime.acenderBeacon('quero conversar');
                      },
                      icone: (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 18.75a6.75 6.75 0 006.75-6.75M12 18.75A6.75 6.75 0 015.25 12M12 18.75V22m0-19a3 3 0 013 3v4a3 3 0 11-6 0V6a3 3 0 013-3z"
                          />
                        </svg>
                      ),
                    },
                  ]
                : []),
              {
                id: 'perfil',
                rotulo: 'Meu perfil',
                descricao: 'Foto, descricao e o que os outros veem',
                cor: '#7c3aed',
                onSelecionar: () => setPerfilAberto(true),
                icone: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                id: 'mensagem-mundo',
                rotulo: 'Soltar no globo',
                descricao: 'Uma frase que atravessa o planeta e some',
                cor: '#db2777',
                onSelecionar: handleOpenMessagePopup,
                icone: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 5h16v11H7l-3 3V5z" strokeLinejoin="round" />
                  </svg>
                ),
              },
              {
                id: 'noticias',
                rotulo: 'Noticias',
                descricao: 'O que esta acontecendo na sua regiao',
                cor: '#ea580c',
                /*
                  ANTES ISTO ABRIA UM ARQUIVO ESTATICO do proprio projeto: as
                  mesmas manchetes para todo mundo, escritas por ninguem, iguais
                  ontem e amanha. Agora abre o que as pessoas da regiao
                  escreveram.
                */
                onSelecionar: () =>
                  precisaDeNickname
                    ? setPedindoNickname(true)
                    : setNoticiasAbertas(true),
                icone: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 5h13v14H5a1 1 0 0 1-1-1V5z" strokeLinejoin="round" />
                    <path d="M17 9h3v8a2 2 0 0 1-3 1.7" strokeLinejoin="round" />
                    <path d="M7 9h7M7 12.5h7M7 16h4" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                id: 'viagem',
                rotulo: 'Planejar viagem',
                cor: '#2563eb',
                desativado: externalData.isLoadingLocations,
                onSelecionar: handlers.handleOpenTravelPopup,
                icone: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path
                      d="M3 15l7-2 4-8 2 .5-2 7.5 5-1.5 1 2-5 2.5-1 5-2 .5.5-4-5 1.5z"
                      strokeLinejoin="round"
                    />
                  </svg>
                ),
              },
              {
                id: 'bagagem',
                rotulo: 'Bagagem',
                cor: '#4f46e5',
                onSelecionar: handlers.handleOpenBaggagePopup,
                icone: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="4" y="7" width="16" height="13" rx="2" />
                    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeLinejoin="round" />
                  </svg>
                ),
              },
              {
                id: 'anunciar',
                rotulo: 'Anunciar',
                descricao: 'Seu anuncio no globo',
                cor: '#16a34a',
                onSelecionar: handlers.handleOpenAdvertisePopup,
                icone: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 10v4h3l5 4V6l-5 4H4z" strokeLinejoin="round" />
                    <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
                  </svg>
                ),
              },
            ]}
          />

          <ClearPinsButton
            onClick={handlers.handleClearPins}
            isVisible={
              states.isMainUiVisible &&
              (states.pinnedLocations.length > 0 || !!states.tourismPin)
            }
            className="bottom-4 left-4 pointer-events-auto"
          />
          {isAdmin && !muralAberto && (
            <>
              <button
                onClick={() => setters.setIsAdminNewsEnabled((prev) => !prev)}
                title={states.isAdminNewsEnabled ? 'Desabilitar Notícias' : 'Habilitar Notícias'}
                className={`absolute right-4 z-40 px-5 py-3 text-base font-bold rounded-full shadow-lg transition-all duration-300 w-32 ${
                  states.isAdminNewsEnabled
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                  states.isAdminNewsEnabled
                    ? 'focus:ring-red-500'
                    : 'focus:ring-green-500'
                } bottom-[36.5rem] pointer-events-auto`}
              >
                {states.isAdminNewsEnabled ? 'News: ON' : 'News: OFF'}
              </button>
              {/*
                A PORTA DA MODERACAO. Ela so' existe para quem ja' entrou como
                administrador — e o que protege de verdade nao e' este `isAdmin`
                do navegador, que e' so' um estado de tela, e sim o cookie
                assinado que as rotas /api/admin conferem no servidor.
              */}
              <button
                onClick={() => setModeracaoAberta(true)}
                disabled={states.isAnyPopupOpen}
                title="Fila de moderação"
                className="absolute right-4 z-40 p-4 rounded-full shadow-lg bg-amber-600 text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-amber-500 disabled:bg-gray-600 disabled:opacity-50 bottom-[28.5rem] pointer-events-auto"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 3l8 3.5v5c0 4.5-3.2 8.4-8 9.5-4.8-1.1-8-5-8-9.5v-5L12 3z" strokeLinejoin="round" />
                  <path d="M12 9v4M12 16.5v.01" strokeLinecap="round" />
                </svg>
              </button>
              <button
                onClick={handlers.handleOpenAdminAnimPopup}
                disabled={states.isAnyPopupOpen}
                title="Configurar Animações"
                className="absolute right-4 z-40 p-4 rounded-full shadow-lg bg-cyan-600 text-white hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500 disabled:bg-gray-600 disabled:opacity-50 bottom-[32.5rem] pointer-events-auto"
              >
                <SettingsIcon />
              </button>
            </>
          )}
        </div>
        <Suspense fallback={null}>
          {states.isAnyPopupOpen && (
            <div className="absolute top-0 left-0 w-full h-full z-50 pointer-events-auto">
              {states.popupData && !states.popupData.isCountry && (
                <StatePopup
                  name={states.popupData.displayName}
                  onClose={handlers.closeAllPopups}
                  activeTab={states.activeTab}
                  setActiveTab={setters.setActiveTab}
                  content={states.popupData.content as PlaceContent}
                  isAdminNewsEnabled={states.isAdminNewsEnabled}
                  placeKey={states.popupNameKey!}
                  newsCategory={states.newsCategory}
                  setNewsCategory={setters.setNewsCategory}
                  selectedArticleIndex={states.selectedArticleIndex}
                  setSelectedArticleIndex={setters.setSelectedArticleIndex}
                />
              )}
              {states.popupData && states.popupData.isCountry && (
                <CountryPopup
                  name={states.popupData.displayName}
                  onClose={handlers.closeAllPopups}
                  content={states.popupData.content as CountryContent}
                />
              )}
              {states.isDynamicNewsOpen && (
                <DynamicNewsPopup
                  isOpen={states.isDynamicNewsOpen}
                  onClose={handlers.handleCloseDynamicNews}
                  allNews={allNewsItems}
                  onArticleClick={handlers.handleDynamicNewsArticleClick}
                />
              )}
              {states.isTourismPopupOpen && (
                <TourismPopup
                  isOpen={states.isTourismPopupOpen}
                  onClose={handlers.handleCloseTourismPopup}
                  onShowOnGlobe={handlers.handleShowTourismPinOnGlobe}
                />
              )}
              {states.isTravelPopupOpen && (
                <TravelPopup
                  isOpen={states.isTravelPopupOpen}
                  onClose={handlers.handleCloseTravelPopup}
                  onSubmit={handlers.handleTravelSubmit}
                  locations={externalData.flightLocations}
                />
              )}
              {states.isBaggagePopupOpen && (
                <BaggagePopup
                  isOpen={states.isBaggagePopupOpen}
                  onClose={handlers.handleCloseBaggagePopup}
                />
              )}
              {states.isVacationPopupOpen && (
                <VacationPopup
                  isOpen={states.isVacationPopupOpen}
                  onClose={handlers.handleCloseVacationPopup}
                  onSubmit={(escolha) => {
                    handlers.handlePinLocationSubmit(escolha);
                    /*
                     * O GLOBO VAI ATE' O LUGAR, como vai ate' uma pessoa.
                     *
                     * Antes, marcar um lugar de ferias cravava o pino e
                     * deixava a pessoa procurando no planeta onde ele tinha
                     * caido — podia estar do outro lado, invisivel. E' o mesmo
                     * gesto da lupa ("me mostre onde fica"), entao usa o mesmo
                     * voo, que ja' sabe contornar o globo em vez de atravessa-lo.
                     */
                    const lugar = externalData.flightLocations.find(
                      (l) => l.key === escolha.locationKey,
                    );
                    if (lugar) {
                      setAlvoDaBusca({
                        lat: lugar.lat,
                        lon: lugar.lon,
                        tipo: 'lugar',
                        nickname: lugar.name,
                        online: false,
                        pedidoEm: Date.now(),
                      });
                    }
                  }}
                  locations={externalData.flightLocations}
                />
              )}
              {states.isAdminAnimOpen && (
                <AdminAnimationPopup
                  isOpen={states.isAdminAnimOpen}
                  onClose={handlers.handleCloseAdminAnimPopup}
                  animationState={externalData.animationState}
                  toggleAnimation={externalData.animControls.toggleAnimation}
                  stopAllAnimations={
                    externalData.animControls.stopAllAnimations
                  }
                  startAllAnimations={
                    externalData.animControls.startAllAnimations
                  }
                />
              )}
              {states.isUserProfileOpen && (
                <UserProfilePopup
                  isOpen={states.isUserProfileOpen}
                  onClose={handlers.handleCloseUserProfile}
                  onLogout={handlers.handleLogout}
                  user={states.currentUser}
                />
              )}
              {states.isMenuPopupOpen && (
                <MenuPopup
                  isOpen={states.isMenuPopupOpen}
                  onClose={handlers.handleCloseMenuPopup}
                  onMyNewsClick={handlers.handleOpenMyNews}
                  onMyTouristSitesClick={handlers.handleOpenMyTouristSites}
                  onMyVacationSpotsClick={handlers.handleOpenMyVacationSpots}
                  isAdmin={isAdmin}
                  onAdminClick={() => {
                    handlers.handleCloseMenuPopup();
                    setIsAdminLoginOpen(true);
                  }}
                  onAdminExit={() => {
                    handleAdminExit();
                    handlers.handleCloseMenuPopup();
                  }}
                />
              )}
              {states.isMyNewsPopupOpen && (
                <MyNewsPopup
                  isOpen={states.isMyNewsPopupOpen}
                  onClose={handlers.handleCloseMyNews}
                  onArticleClick={handlers.handleOpenSavedNewsArticle}
                />
              )}
              {states.isMyTouristSitesPopupOpen && (
                <MyTouristSitesPopup
                  isOpen={states.isMyTouristSitesPopupOpen}
                  onClose={handlers.handleCloseMyTouristSites}
                />
              )}
              {states.isAdvertisePopupOpen && (
                <AdvertisePopup
                  isOpen={states.isAdvertisePopupOpen}
                  onClose={handlers.handleCloseAdvertisePopup}
                  onAdSubmit={handlers.handleAdSubmit}
                />
              )}
              {states.isMyVacationSpotsPopupOpen && (
                <MyVacationSpotsPopup
                  isOpen={states.isMyVacationSpotsPopupOpen}
                  onClose={handlers.handleCloseMyVacationSpots}
                  onSpotClick={handlers.handleOpenSavedSpotOnGlobe}
                />
              )}
            </div>
          )}
          
          {/* Convite recebido. Bloqueia a decisao numa caixa propria: aceitar
              conversa com estranho nao pode acontecer por clique errado. */}
          {realtime.estado.convite && (
            <div className="absolute inset-0 z-[140] flex items-center justify-center bg-black/60 pointer-events-auto">
              <div className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-stone-900 p-5 ring-1 ring-cyan-700/60 shadow-2xl">
                <p className="text-white text-base">
                  <span className="font-semibold text-cyan-300">
                    {realtime.estado.convite.fromNickname
                      ? `@${realtime.estado.convite.fromNickname}`
                      : (realtime.estado.convite.fromName ?? 'Alguem')}
                  </span>{' '}
                  quer conversar com voce.
                </p>
                <p className="mt-1 text-xs text-white/50">
                  A conversa e direta entre voces dois e nao fica gravada.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={realtime.aceitarConvite}
                    className="flex-1 rounded-lg bg-cyan-600 py-2 font-semibold text-white hover:bg-cyan-500"
                  >
                    Aceitar
                  </button>
                  <button
                    type="button"
                    onClick={realtime.recusarConvite}
                    className="flex-1 rounded-lg bg-white/10 py-2 text-white/80 hover:bg-white/20"
                  >
                    Agora nao
                  </button>
                </div>
              </div>
            </div>
          )}

          {conversas.abertaCom && (
            <div className="pointer-events-auto">
              <ChatOverlay
                aberta
                nome={conversas.abertaCom}
                mensagens={conversas.mensagensAbertas}
                online={Boolean(
                  realtime.onlinePorNickname[conversas.abertaCom],
                )}
                videoRemoto={realtime.estado.videoRemoto}
                videoLocal={realtime.estado.videoLocal}
                digitando={Boolean(conversas.digitando[conversas.abertaCom])}
                onEnviarTexto={(texto) =>
                  conversas.enviarTexto(conversas.abertaCom!, texto)
                }
                onDigitando={() =>
                  conversas.avisarQueEstouEscrevendo(conversas.abertaCom!)
                }
                onEnviarMidia={(tipo, blob, mime, duracaoMs, nomeDoArquivo) =>
                  conversas.enviarMidia(
                    conversas.abertaCom!,
                    tipo,
                    blob,
                    mime,
                    duracaoMs,
                    nomeDoArquivo,
                  )
                }
                onMarcarLidas={() => conversas.marcarLidas(conversas.abertaCom!)}
                onVerPerfil={setPerfilDeOutro}
                onFechar={() => {
                  conversas.fecharConversa();
                  // Fechar a conversa encerra a chamada junto: deixar camera e
                  // microfone ligados atras de uma tela fechada seria o pior
                  // tipo de surpresa.
                  if (realtime.estado.emChamada) realtime.encerrarChamada();
                }}
                onChamarVideo={() => {
                  const presenca =
                    realtime.presencaPorNickname[conversas.abertaCom!];
                  if (!presenca) return;
                  realtime.pedirConexao(presenca.clientId, {
                    nickname: conversas.abertaCom!,
                    presenca,
                  });
                }}
                onDenunciar={(motivo) => realtime.denunciar(motivo, conversas.abertaCom ?? undefined)}
                onBloquear={() => realtime.bloquear(conversas.abertaCom ?? undefined)}
              />
            </div>
          )}

          <div className="pointer-events-auto">
            <EscolherNickname
              aberto={pedindoNickname}
              onFechar={() => setPedindoNickname(false)}
            />
          </div>

          <div className="pointer-events-auto">
            <EscolherLugar
              aberto={pedindoLugar}
              onFechar={() => setPedindoLugar(false)}
            />
          </div>

          <div className="pointer-events-auto">
            <PerfilPanel aberto={perfilAberto} onFechar={() => setPerfilAberto(false)} />
          </div>

          <div className="pointer-events-auto">
            <PerfilDeOutroPanel
              nickname={perfilDeOutro}
              onFechar={() => setPerfilDeOutro(null)}
              onConversar={(apelido) => {
                setPerfilDeOutro(null);
                conversas.abrirConversa(apelido);
              }}
            />
          </div>

          {/*
            A LINHA DO TEMPO NAO FICA DENTRO de `pointer-events-auto` como os
            outros paineis. Ela tem dois estados, e no segundo — minimizada —
            precisa deixar o globo receber o toque atras dela: e' o globo que a
            pessoa esta olhando, e so' a faixa da direita continua clicavel.
          */}
          <div className="pointer-events-auto">
            <NoticiasPanel
              aberto={noticiasAbertas}
              onFechar={() => setNoticiasAbertas(false)}
              meuNickname={realtime.meuNickname}
              onVerPerfil={(apelido) => {
                setNoticiasAbertas(false);
                setPerfilDeOutro(apelido);
              }}
              onVerNoGlobo={(lat, lon, rotulo) => {
                setNoticiasAbertas(false);
                setAlvoDaBusca({
                  lat,
                  lon,
                  tipo: 'lugar',
                  nickname: rotulo,
                  online: false,
                  pedidoEm: Date.now(),
                });
              }}
            />
          </div>

          <LinhaDoTempo
            aberto={muralAberto}
            onFechar={() => setMuralAberto(false)}
            meuNickname={realtime.meuNickname}
            onVerPerfil={(apelido) => {
              setMuralAberto(false);
              setPerfilDeOutro(apelido);
            }}
            onConversar={(apelido) => {
              setMuralAberto(false);
              conversas.abrirConversa(apelido);
            }}
            onFocarNoGlobo={(lat, lon, rotulo, midia) => {
              setAlvoDaBusca({
                lat,
                lon,
                // A publicacao vai junto: e' ela que aparece acima do nome do
                // lugar, desenhada na propria cena.
                midia,
                // `lugar` e nao `pessoa`: o rotulo de um lugar nao leva arroba,
                // e a cor nao deve fingir dizer se alguem esta online. A
                // publicacao e' de um LUGAR, e quem escreveu pode ter fechado o
                // aplicativo horas atras.
                tipo: 'lugar',
                nickname: rotulo,
                online: false,
                // Muda a cada pedido: sem isto, tocar duas vezes no mesmo
                // segmento da faixa nao refaria a viagem.
                pedidoEm: Date.now(),
              });
            }}
          />

          <div className="pointer-events-auto">
            <SinaisDoMundoPanel
              aberto={sinaisAbertos}
              onFechar={() => setSinaisAbertos(false)}
              sinais={realtime.sinaisDoMundo}
              total={realtime.totalDeSinais}
              meuClientId={realtime.meuClientId}
              onBuscar={realtime.buscarSinais}
              onBuscarSugestoes={realtime.buscarSugestoes}
              sugestoes={realtime.sugestoes}
              onAbrirSinal={(sinal) => {
                setSinaisAbertos(false);
                setSinalAberto(sinal);
              }}
            />
          </div>

          <div className="pointer-events-auto">
            <SinalPanel
              sinal={sinalAberto}
              onFechar={() => setSinalAberto(null)}
              meuClientId={realtime.meuClientId}
              onConversar={(apelido) => {
                setSinalAberto(null);
                conversas.abrirConversa(apelido);
              }}
              onChamarVideo={(clientId) => {
                setSinalAberto(null);
                realtime.pedirConexao(clientId);
              }}
              onVerPerfil={(apelido) => {
                setSinalAberto(null);
                setPerfilDeOutro(apelido);
              }}
            />
          </div>

          <div className="pointer-events-auto">
            <GrupoDeSinaisPanel
              itens={grupoDeSinais}
              onFechar={() => setGrupoDeSinais(null)}
              meuClientId={realtime.meuClientId}
              onChamar={(clientId) => {
                // Do grupo para a tela do sinal: a decisao de chamar e' a
                // mesma, e ela merece as mesmas informacoes.
                const escolhido = grupoDeSinais?.find((b) => b.clientId === clientId);
                setGrupoDeSinais(null);
                if (escolhido) setSinalAberto(escolhido);
                else realtime.pedirConexao(clientId);
              }}
            />
          </div>

          <div className="pointer-events-auto">
            <ConversasPanel
              aberto={conversasAbertas}
              onFechar={() => setConversasAbertas(false)}
              conversas={conversas.conversas}
              naoLidasPorConversa={conversas.naoLidasPorConversa}
              digitando={conversas.digitando}
              presencaPorNickname={realtime.presencaPorNickname}
              onlinePorNickname={realtime.onlinePorNickname}
              onAbrir={(com) => {
                conversas.abrirConversa(com);
                setConversasAbertas(false);
                // Pergunta se essa pessoa esta online agora, para o cabecalho
                // da conversa nao mentir dizendo "offline" por falta de dado.
                realtime.verQuemEstaOnline([com]);
              }}
              onApagar={conversas.apagarConversa}
            />
          </div>

          <div className="pointer-events-auto">
            <PeopleSearchPanel
              aberto={buscaAberta}
              onFechar={() => setBuscaAberta(false)}
              meuNickname={realtime.meuNickname}
              presencaPorNickname={realtime.presencaPorNickname}
              onVerQuemEstaOnline={realtime.verQuemEstaOnline}
              onVerNoGlobo={(pessoa) => {
                if (verPessoaNoGlobo(pessoa)) setBuscaAberta(false);
              }}
              onConversar={(pessoa) => {
                // Se der para mostrar onde ela esta, mostra — mas isso nao e'
                // requisito para conversar. Quem esta offline nao tem
                // coordenada, e a conversa abre do mesmo jeito.
                verPessoaNoGlobo(pessoa);
                conversas.abrirConversa(pessoa.nickname);
                setBuscaAberta(false);
              }}
            />
          </div>

          {contextoPerdido && (
            <div className="absolute inset-0 z-[210] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-auto">
              <div className="mx-4 max-w-sm rounded-2xl bg-stone-900 p-5 text-center ring-1 ring-white/15">
                <p className="text-base font-semibold text-white">
                  O globo 3D parou
                </p>
                <p className="mt-2 text-sm text-white/60">
                  A placa de vídeo interrompeu o desenho — costuma acontecer
                  quando a memória aperta, com muitas abas abertas ou no celular.
                  Suas conversas não se perderam.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 w-full rounded-xl bg-cyan-600 py-2.5 font-semibold text-white hover:bg-cyan-500"
                >
                  Recarregar
                </button>
              </div>
            </div>
          )}

          {realtime.estado.aviso && (
            <button
              type="button"
              onClick={realtime.limparAviso}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[150] rounded-full bg-stone-900/95 px-4 py-2 text-sm text-white ring-1 ring-white/15 shadow-lg pointer-events-auto"
            >
              {realtime.estado.aviso}
            </button>
          )}

          <ModeracaoPanel
            aberto={moderacaoAberta}
            onFechar={() => setModeracaoAberta(false)}
          />

          <AdminLoginPopup
            isOpen={isAdminLoginOpen}
            onClose={() => setIsAdminLoginOpen(false)}
            onSuccess={handleAdminSuccess}
          />

          {isMessagePopupOpen && (
            <div className="absolute top-0 left-0 w-full h-full z-[120] pointer-events-auto">
              <MessageInputPopup
                isOpen={isMessagePopupOpen}
                onClose={handleCloseMessagePopup}
                onSend={handleSendMessage}
              />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}