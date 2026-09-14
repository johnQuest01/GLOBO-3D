'use client';

import { Billboard, RoundedBox } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { FC, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

import { urlDaMidia } from '@/lib/chat/midiaRemota';
import { garantirTocando, soltarVideoDoGlobo } from '@/lib/globo/videoDoGlobo';

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
  kind: 'texto' | 'imagem' | 'video';
  /** Nulo num post de texto: nao ha' arquivo, e o texto e' o conteudo. */
  midiaChave: string | null;
  cartazChave: string | null;
  /** O que foi escrito. Usado quando `kind` e' 'texto'. */
  texto?: string | null;
  /** A cor do pais, para o cartao de texto nao ser cinza. */
  cor?: string | null;
}

interface Props {
  midia: MidiaDoFoco | null;
  /**
   * O cartão do nome do lugar: onde ele está e quanto mede, em unidades.
   *
   * A MÍDIA MORA NO MESMO PAINEL QUE O NOME, e por isso precisa das medidas
   * dele. Ela ficava num painel próprio, deslocada no eixo Y do MUNDO — que é o
   * eixo dos polos. Na latitude de Los Angeles esse eixo aponta em boa parte
   * para a câmera, então "subir 2 unidades" virava "aproximar 2 unidades", e a
   * mídia caía em cima do nome. Dentro de um painel que encara a câmera, Y é
   * para cima NA TELA — que é o único "cima" que interessa.
   */
  centroDoNome: number;
  alturaDoNome: number;
  /**
   * Quantos pixels de tela vale uma unidade da cena.
   *
   * VEM DE FORA porque quem manda nisso é o grupo do marcador, que se
   * redimensiona a cada quadro para o nome do lugar ter sempre o mesmo tamanho
   * na tela. Receber o número em vez de repeti-lo aqui é o que impede os dois
   * arquivos de discordarem no dia em que um deles mudar.
   */
  pxPorUnidade: number;
}

/**
 * As medidas da miniatura, EM PIXELS DE TELA.
 *
 * POR QUE EM PIXELS E NÃO EM UNIDADES DA CENA. O grupo do marcador se
 * redimensiona a cada quadro para o nome do lugar ter sempre o mesmo tamanho na
 * tela, perto ou longe. A miniatura mora dentro desse grupo, então ela herda a
 * mesma regra: uma unidade vale sempre os mesmos pixels. Pensar em unidades era
 * pensar num número sem significado; pensar em pixels é pensar no que a pessoa
 * vê.
 *
 * E É ISSO QUE FAZ FUNCIONAR NO CELULAR. Um tamanho fixo que fica bom num
 * monitor de 1440 ocupa a tela inteira num telefone de 375. Os tetos são o
 * MENOR entre um valor absoluto e uma fração da tela: no desktop manda o
 * absoluto, no celular manda a fração, e em nenhum dos dois a publicação
 * atropela o globo que ela deveria estar apontando.
 *
 * OS DOIS TETOS EXISTEM PORQUE HÁ DOIS FORMATOS, e não um. Vídeo de celular é
 * em pé (9:16); foto e vídeo de câmera são deitados (16:9 ou 4:3). Prender só a
 * altura deixaria um deitado atravessado no planeta; prender só a largura
 * deixaria um em pé com o dobro da altura do outro. Com os dois, cada formato
 * cresce até esbarrar no SEU limite, e nenhum sai da mesma moldura mental — o
 * olho não precisa se reajustar a cada troca na faixa do tempo.
 */
const ALTURA_MAX_PX = 190;
const LARGURA_MAX_PX = 220;
/** Nunca mais que isto da tela, que é o que salva o celular. */
const FATIA_DA_ALTURA = 0.21;
const FATIA_DA_LARGURA = 0.5;

/** O respiro entre o nome do lugar e a miniatura, em unidades. */
const VAO = 0.4;
/**
 * A borda: azul, arredondada, e de cada lado.
 *
 * Em unidades da cena, com 16 px por unidade: 0,2 dá uns 3 px de borda, e o
 * raio de 0,5 dá uns 8 px de canto. Menos que isso e a borda vira um fio que
 * some sobre o oceano; mais e o cartão parece um botão.
 */
const BORDA = 0.2;
const RAIO = 0.5;
const COR_DA_BORDA = '#38bdf8';

const ORDEM = 24;

/**
 * Desenha o post de texto num quadrado, e devolve isso como textura.
 *
 * POR QUE O TEXTO PRECISOU APARECER AQUI. Ele nao aparecia: so' foto e video
 * subiam ao globo, e um post de texto deixava o espaco acima do nome do lugar
 * vazio. O raciocinio original era evitar um retangulo vazio pairando sobre a
 * cidade — mas um cartao COM o texto nao e' vazio, e a ausencia era pior do que
 * o retangulo que ela evitava: quem tocava no botao via o globo girar e nada
 * acontecer, o que e' indistinguivel de estar quebrado.
 *
 * DESENHADO NUM CANVAS, e nao com o `<Text>` do drei. O cartao precisa do mesmo
 * fundo, da mesma moldura e do mesmo caminho de textura que a foto e o video —
 * um componente diferente para o terceiro caso significaria tres codigos de
 * posicionamento para manter em acordo.
 */
function texturaDeTexto(texto: string, cor: string): THREE.CanvasTexture {
  const L = 512;
  const A = 512;
  const tela = document.createElement('canvas');
  tela.width = L;
  tela.height = A;
  const p = tela.getContext('2d')!;

  const fundo = p.createLinearGradient(0, 0, L, A);
  fundo.addColorStop(0, cor);
  fundo.addColorStop(1, '#0b1220');
  p.fillStyle = fundo;
  p.fillRect(0, 0, L, A);

  /*
   * O TAMANHO DA LETRA SAI DO TAMANHO DO TEXTO. Um "oi" com a mesma letra de um
   * paragrafo ficaria perdido no meio do quadrado; um paragrafo com a letra do
   * "oi" nao caberia. Tres faixas bastam — mais que isso e' precisao que
   * ninguem enxerga.
   */
  const limpo = texto.trim().slice(0, 280);
  const corpo = limpo.length < 40 ? 54 : limpo.length < 120 ? 40 : 30;
  p.font = `600 ${corpo}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  p.fillStyle = 'rgba(255,255,255,0.94)';
  p.textAlign = 'center';
  p.textBaseline = 'middle';

  // Quebra por palavra, com margem dos dois lados.
  const largura = L - 72;
  const linhas: string[] = [];
  let linha = '';
  for (const palavra of limpo.split(/\s+/)) {
    const tentativa = linha ? `${linha} ${palavra}` : palavra;
    if (p.measureText(tentativa).width > largura && linha) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = tentativa;
    }
    if (linhas.length >= 8) break;
  }
  if (linha && linhas.length < 9) linhas.push(linha);

  const passo = corpo * 1.32;
  const comeco = A / 2 - ((linhas.length - 1) * passo) / 2;
  linhas.forEach((t, i) => p.fillText(t, L / 2, comeco + i * passo));

  const textura = new THREE.CanvasTexture(tela);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

const MidiaNoGlobo: FC<Props> = ({
  midia,
  centroDoNome,
  alturaDoNome,
  pxPorUnidade,
}) => {
  const { size } = useThree();
  const [textura, setTextura] = useState<THREE.Texture | null>(null);
  const [aspecto, setAspecto] = useState(1);

  const chave = midia?.midiaChave ?? null;
  const cartaz = midia?.cartazChave ?? null;
  const kind = midia?.kind ?? null;

  /* -- O texto: nao precisa de rede, entao chega na hora ------------------ */
  useEffect(() => {
    if (kind !== 'texto') return;
    const escrito = (midia?.texto ?? '').trim();
    if (!escrito) return;
    const t = texturaDeTexto(escrito, midia?.cor ?? '#334155');
    setAspecto(1);
    setTextura(t);
    return () => {
      t.dispose();
    };
  }, [kind, midia?.texto, midia?.cor]);

  /* -- O cartaz, ou a imagem: o que chega primeiro ------------------------ */
  useEffect(() => {
    const parada = kind === 'imagem' ? chave : cartaz;
    if (kind === 'texto' || !parada) return;
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

    const aoTerMedidas = () => {
      if (vivo && video?.videoWidth) {
        setAspecto(video.videoWidth / video.videoHeight);
      }
    };
    /*
     * ENTRA NA CENA QUANDO ESTÁ TOCANDO, e não quando "dá para tocar".
     * `canplay` diz que há dados; `playing` diz que o relógio andou. Entre um
     * e outro cabe a reprodução barrada — e aí a textura entraria preta,
     * apagando o cartaz que já estava certo na tela.
     */
    const aoTocar = () => {
      if (vivo && tex) setTextura(tex);
    };

    let minhaUrl: string | null = null;
    void urlDaMidia(chave).then((url) => {
      if (!vivo || !url) return;
      minhaUrl = url;

      /*
       * O ELEMENTO NÃO É CRIADO AQUI. Ele é o único `<video>` do globo (ver
       * lib/globo/videoDoGlobo.ts), e já foi posto para tocar DENTRO do toque
       * que pediu esta viagem — é isso que faz o som vir no celular. Este
       * efeito só pendura a textura nele e garante que ele está tocando, para o
       * caso de a pessoa ter chegado aqui por um caminho sem toque.
       */
      video = garantirTocando(url);
      tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;

      video.addEventListener('loadedmetadata', aoTerMedidas);
      video.addEventListener('playing', aoTocar);
      // Se o toque já destravou e ele já está tocando, os eventos passaram.
      if (video.videoWidth) aoTerMedidas();
      if (!video.paused && video.readyState >= 2) aoTocar();
    });

    return () => {
      vivo = false;
      if (video) {
        video.removeEventListener('loadedmetadata', aoTerMedidas);
        video.removeEventListener('playing', aoTocar);
      }
      if (minhaUrl) soltarVideoDoGlobo(minhaUrl);
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
    const px = Math.max(1, pxPorUnidade);
    const alturaMax =
      Math.min(ALTURA_MAX_PX, size.height * FATIA_DA_ALTURA) / px;
    const larguraMax =
      Math.min(LARGURA_MAX_PX, size.width * FATIA_DA_LARGURA) / px;

    let a = alturaMax;
    let l = a * aspecto;
    if (l > larguraMax) {
      l = larguraMax;
      a = l / aspecto;
    }
    return { largura: l, altura: a };
  }, [aspecto, pxPorUnidade, size.width, size.height]);

  /*
   * OS CANTOS ARREDONDADOS DA MÍDIA vêm de uma máscara, e não da geometria.
   *
   * Um plano com cantos recortados na malha teria de mapear a textura para
   * uma forma que não é retângulo, e vídeo é retângulo. Uma máscara de alfa
   * — um canvas com o retângulo arredondado em branco — deixa a geometria como
   * está e só apaga os cantos. O raio é calculado em unidades da cena e
   * convertido para pixels do canvas, para ser o mesmo em qualquer formato.
   */
  const mascara = useMemo(() => {
    const L = 512;
    const A = Math.max(64, Math.round((L * altura) / largura));
    const tela = document.createElement('canvas');
    tela.width = L;
    tela.height = A;
    const p = tela.getContext('2d')!;
    p.fillStyle = '#000';
    p.fillRect(0, 0, L, A);
    p.fillStyle = '#fff';
    p.beginPath();
    p.roundRect(0, 0, L, A, (RAIO / largura) * L);
    p.fill();
    const t = new THREE.CanvasTexture(tela);
    return t;
  }, [largura, altura]);
  useEffect(() => () => mascara.dispose(), [mascara]);

  if (!midia || !textura) return null;

  /*
   * ACIMA DO NOME, medido dentro do painel que encara a câmera: metade da
   * altura do nome, o respiro, e metade da altura da mídia. Este Y é "para
   * cima na tela", e por isso a mídia nunca mais cai em cima do nome — ver o
   * comentário em `centroDoNome`.
   */
  const acima = alturaDoNome / 2 + VAO + altura / 2;

  return (
    <Billboard position={[0, centroDoNome, 0]}>
      {/*
        A BORDA: azul, arredondada, um pouco maior que a mídia de cada lado.

        SOBRE OS DOIS PASSES DO three.js — e por que os dois materiais daqui
        são `transparent` com opacidade cheia. O renderizador desenha primeiro
        tudo o que é opaco e só depois tudo o que é transparente, e
        `renderOrder` ordena DENTRO de um passe, nunca entre eles. Isso já
        causou dois defeitos seguidos nesta tela: a moldura semitransparente
        pintando por cima do vídeo, e depois os NOMES DO MAPA (transparentes,
        `renderOrder` 10) atravessando a publicação. `transparent` com
        `opacity` 1 põe tudo no MESMO passe, onde o `renderOrder` manda:
        nomes (10) < borda (24) < mídia (25).
      */}
      <RoundedBox
        args={[largura + BORDA * 2, altura + BORDA * 2, 0.02]}
        radius={RAIO + BORDA}
        smoothness={4}
        position={[0, acima, 0]}
        renderOrder={ORDEM}
      >
        <meshBasicMaterial
          color={COR_DA_BORDA}
          transparent
          opacity={1}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </RoundedBox>

      <mesh position={[0, acima, 0.02]} renderOrder={ORDEM + 1}>
        <planeGeometry args={[largura, altura]} />
        {/*
          O `key` COM O UUID DA TEXTURA RECRIA O MATERIAL quando ela troca.
          Trocar `map` num material já compilado não basta: o programa de
          sombreamento é montado uma vez, e a troca sozinha não pede
          recompilação — o plano fica preto. Acontece duas vezes na vida desta
          tela (o cartaz e depois o vídeo), não a cada quadro.
        */}
        <meshBasicMaterial
          key={textura.uuid + mascara.uuid}
          map={textura}
          alphaMap={mascara}
          transparent
          opacity={1}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
};

export default MidiaNoGlobo;
