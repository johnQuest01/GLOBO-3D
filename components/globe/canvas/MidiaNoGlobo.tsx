'use client';

import { Billboard } from '@react-three/drei';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { urlDaMidia } from '@/lib/chat/midiaRemota';

/**
 * A publicação desenhada NO GLOBO, logo acima do nome do lugar.
 *
 * POR QUE AQUI E NÃO NUM CARTÃO NO CANTO. O cartão no canto obrigava o olho a
 * fazer duas viagens: uma até o ponto que acendeu no globo, outra até o canto
 * da tela, e depois de volta para ligar as duas coisas. Aqui a publicação
 * nasce em cima do lugar — o vídeo E o nome da cidade são uma coisa só, e não
 * duas que a pessoa precisa casar sozinha.
 *
 * É TEXTURA, E NÃO HTML POR CIMA. `<Html>` colaria uma janelinha do navegador
 * na frente da cena: ela não recebe a luz, não vira com o globo e desliza por
 * cima do relevo quando a câmera se mexe — parece adesivo. Uma textura num
 * plano pertence à cena: gira junto, some por trás da curvatura do planeta e
 * responde à mesma câmera que tudo o mais.
 *
 * ISSO EXIGE CORS, e é a razão pela qual este arquivo pede a mídia com
 * `crossOrigin`. WebGL recusa desenhar pixels de outra origem sem permissão
 * explícita — uma textura "suja" não pode ser lida, e o navegador derruba a
 * cena inteira em vez de só essa imagem. O balde já responde com a permissão
 * para o endereço do aplicativo e recusa para os outros.
 *
 * O CARTAZ APARECE PRIMEIRO, e o vídeo entra por cima quando estiver pronto.
 * São 8 KB contra megabytes: o quadro parado chega junto com o voo da câmera,
 * e o vídeo troca sozinho um instante depois. Sem isso haveria um retângulo
 * escuro exatamente no momento em que a pessoa está olhando para o lugar.
 */

export interface MidiaDoFoco {
  kind: 'imagem' | 'video';
  midiaChave: string;
  cartazChave: string | null;
}

interface Props {
  midia: MidiaDoFoco | null;
  /** Onde o topo do cartão do nome termina, em unidades da cena. */
  base: number;
}

/**
 * As medidas da miniatura, em unidades da cena (o globo tem raio 1,5).
 *
 * O TETO É DA ALTURA, e não da largura. Vídeo de celular é em pé: limitar a
 * largura deixaria um retrato com o dobro da altura de uma paisagem, e a
 * miniatura passaria a ter tamanhos muito diferentes conforme o que foi
 * filmado. Presa a altura, as duas ocupam o mesmo espaço vertical — e a
 * largura ainda tem teto próprio para uma paisagem muito esticada não virar
 * uma faixa atravessada no planeta.
 */
const ALTURA_MAX = 2.6;
const LARGURA_MAX = 3.6;
/** O respiro entre o nome do lugar e a miniatura. */
const VAO = 0.35;
/** A moldura escura por trás — é ela que separa a mídia do planeta atrás. */
const MOLDURA = 0.14;

const ORDEM = 24;

const MidiaNoGlobo: FC<Props> = ({ midia, base }) => {
  const [textura, setTextura] = useState<THREE.Texture | null>(null);
  const [aspecto, setAspecto] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const chave = midia?.midiaChave ?? null;
  const cartaz = midia?.cartazChave ?? null;
  const kind = midia?.kind ?? null;

  /* -- O cartaz, ou a imagem: o que chega primeiro ------------------------ */
  useEffect(() => {
    const parada = kind === 'imagem' ? chave : cartaz;
    if (!parada) return;
    let vivo = true;
    let minha: THREE.Texture | null = null;

    void urlDaMidia(parada).then((url) => {
      if (!vivo || !url) return;
      const carregador = new THREE.TextureLoader();
      carregador.setCrossOrigin('anonymous');
      carregador.load(
        url,
        (t) => {
          if (!vivo) {
            t.dispose();
            return;
          }
          t.colorSpace = THREE.SRGBColorSpace;
          minha = t;
          const img = t.image as { width?: number; height?: number };
          if (img?.width && img?.height) setAspecto(img.width / img.height);
          // O vídeo, se já tiver chegado, manda: trocar a textura viva por um
          // quadro parado seria andar para trás.
          setTextura((atual) =>
            atual instanceof THREE.VideoTexture ? atual : t,
          );
        },
        undefined,
        () => undefined,
      );
    });

    return () => {
      vivo = false;
      minha?.dispose();
    };
  }, [chave, cartaz, kind]);

  /* -- O vídeo ------------------------------------------------------------ */
  useEffect(() => {
    if (kind !== 'video' || !chave) return;
    let vivo = true;
    let video: HTMLVideoElement | null = null;
    let tex: THREE.VideoTexture | null = null;

    void urlDaMidia(chave).then((url) => {
      if (!vivo || !url) return;

      video = document.createElement('video');
      video.src = url;
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';

      /*
       * COM SOM. Para chegar aqui foi preciso TOCAR no botão "ver este lugar
       * no globo" — som que responde a um toque é outra coisa do que som que
       * começa sozinho enquanto alguém rola uma lista. Se o navegador recusar
       * (a política é dele, e muda entre eles), o vídeo volta mudo e TOCANDO:
       * um vídeo parado sem explicação parece defeito.
       */
      video.muted = false;
      video.volume = 1;

      video.addEventListener('loadedmetadata', () => {
        if (vivo && video?.videoWidth) {
          setAspecto(video.videoWidth / video.videoHeight);
        }
      });

      tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      videoRef.current = video;

      void video.play().catch(() => {
        if (!video) return;
        video.muted = true;
        void video.play().catch(() => undefined);
      });

      // Só entra na cena quando há quadro: entrar antes mostra preto.
      video.addEventListener('canplay', () => {
        if (vivo && tex) setTextura(tex);
      });
    });

    return () => {
      vivo = false;
      videoRef.current = null;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      tex?.dispose();
      // Quem sai é o vídeo; se ainda houver cartaz, a próxima montagem o traz.
      setTextura((atual) => (atual instanceof THREE.VideoTexture ? null : atual));
    };
  }, [chave, kind]);

  /* -- Sumiu o alvo, some tudo ------------------------------------------- */
  useEffect(() => {
    if (!midia) setTextura(null);
  }, [midia]);

  const { largura, altura } = useMemo(() => {
    let a = ALTURA_MAX;
    let l = a * aspecto;
    if (l > LARGURA_MAX) {
      l = LARGURA_MAX;
      a = l / aspecto;
    }
    return { largura: l, altura: a };
  }, [aspecto]);

  if (!midia || !textura) return null;

  const centro = base + VAO + altura / 2;

  return (
    <Billboard position={[0, centro, 0]}>
      {/*
        A MOLDURA EXISTE PARA A MÍDIA TER BORDA. Sem ela, uma foto clara sobre
        o oceano e uma escura sobre a noite do planeta parecem duas coisas
        diferentes — e nenhuma parece um objeto, porque objeto tem contorno.
      */}
      <mesh renderOrder={ORDEM}>
        <planeGeometry args={[largura + MOLDURA, altura + MOLDURA]} />
        <meshBasicMaterial
          color="#0b1220"
          transparent
          opacity={0.92}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0, 0.01]} renderOrder={ORDEM + 1}>
        <planeGeometry args={[largura, altura]} />
        <meshBasicMaterial
          map={textura}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
};

export default MidiaNoGlobo;
