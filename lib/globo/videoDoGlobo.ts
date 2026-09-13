'use client';

import { useSyncExternalStore } from 'react';

/**
 * O único `<video>` que toca sobre o globo — e o motivo de ele ser único.
 *
 * O DEFEITO QUE ISTO RESOLVE: no celular, o vídeo sobre o globo tocava MUDO.
 * A regra dos navegadores móveis é estrita: som só quando o `play()` acontece
 * DENTRO do toque da pessoa. O nosso `play()` acontecia num efeito do React,
 * depois de o globo voar até o lugar — muito longe do toque. O navegador
 * recusava, o código caía para mudo, e não havia botão para ligar o som.
 *
 * O TRUQUE, que é o mesmo que todo tocador de vídeo na web usa: um elemento
 * que já foi tocado dentro de um toque fica "destravado" — chamadas de
 * `play()` posteriores nele, mesmo fora de qualquer gesto, são aceitas. Então
 * o elemento é criado UMA vez, `play()` é chamado nele no próprio manipulador
 * do clique (antes de o globo voar, antes de o React fazer qualquer coisa), e a
 * cena passa a usar ESSE elemento como textura em vez de criar o seu.
 *
 * QUANDO NEM ISSO BASTA — política mais dura, ou a URL ainda não conhecida no
 * momento do toque —, o elemento fica mudo e TOCANDO, e este módulo diz isso
 * para a tela mostrar um botão "ligar som". O botão é um toque de verdade, e
 * portanto sempre funciona. Vídeo parado sem explicação parece defeito; vídeo
 * mudo com um botão é uma escolha do navegador que a pessoa consegue desfazer.
 */

let elemento: HTMLVideoElement | null = null;
/** A URL que está carregada no elemento, para não recarregar à toa. */
let urlAtual: string | null = null;
let mudo = false;

const ouvintes = new Set<() => void>();
const avisar = () => {
  for (const f of ouvintes) f();
};

function marcar(novoMudo: boolean) {
  if (mudo === novoMudo) return;
  mudo = novoMudo;
  avisar();
}

/**
 * O elemento, criado na primeira vez e nunca mais.
 *
 * NO DOCUMENTO, fora da tela — e não `display:none`. Um `<video>` solto o
 * navegador trata como descartável e não produz quadros; escondido com
 * `display:none` também para de desenhar. Um pixel no canto, sem receber
 * toque, é o que o mantém vivo para servir de textura.
 */
export function elementoDoGlobo(): HTMLVideoElement {
  if (elemento) return elemento;
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  /*
   * SEM `loop`. Um vídeo de quatro minutos tocando com som sobre o globo, de
   * novo e de novo, não é uma publicação — é um alarme. Ele toca uma vez, do
   * começo ao fim, e para no último quadro; quem quiser de novo toca no botão
   * de novo.
   *
   * E foi assim que apareceu o relato "está em loop, não vai do começo ao
   * fim": com `loop` ligado, o fim era invisível — o vídeo voltava ao começo
   * antes de a pessoa perceber que havia terminado.
   */
  v.loop = false;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  v.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(v);
  elemento = v;
  return v;
}

/** Aponta o elemento para uma URL, sem recarregar se já for ela. */
function carregar(url: string): HTMLVideoElement {
  const v = elementoDoGlobo();
  if (urlAtual !== url) {
    urlAtual = url;
    v.src = url;
    v.load();
  }
  return v;
}

/**
 * CHAMAR DENTRO DO TOQUE. É a única linha que importa neste arquivo.
 *
 * Tenta com som; se o navegador recusar, segue mudo e avisa a tela. Nos dois
 * casos o vídeo fica TOCANDO — a textura na cena precisa de quadros, e um
 * vídeo parado é um retângulo preto sobre a cidade.
 */
export function destravarComSom(url: string): void {
  const v = carregar(url);
  v.muted = false;
  v.volume = 1;
  void v
    .play()
    .then(() => marcar(false))
    .catch(() => {
      v.muted = true;
      marcar(true);
      void v.play().catch(() => undefined);
    });
}

/**
 * O que a cena chama quando monta: garante que o vídeo certo está tocando.
 *
 * Se o toque já destravou este mesmo URL, não faz nada além de confirmar. Se
 * não (a pessoa chegou aqui por outro caminho, ou a URL só ficou conhecida
 * agora), tenta do mesmo jeito — e cai para mudo com aviso, como acima.
 */
export function garantirTocando(url: string): HTMLVideoElement {
  const v = carregar(url);
  if (v.paused) {
    void v
      .play()
      .then(() => marcar(v.muted))
      .catch(() => {
        v.muted = true;
        marcar(true);
        void v.play().catch(() => undefined);
      });
  }
  return v;
}

/** O botão "ligar som": um toque de verdade, então sempre funciona. */
export function ligarSom(): void {
  const v = elementoDoGlobo();
  v.muted = false;
  v.volume = 1;
  void v
    .play()
    .then(() => marcar(false))
    .catch(() => marcar(true));
}

/**
 * Solta o vídeo — mas SÓ se ele ainda for o que esta cena estava usando.
 *
 * A ordem dos acontecimentos ao trocar de publicação na faixa é: o toque
 * destrava e carrega o vídeo NOVO; o React re-renderiza; a limpeza do efeito
 * ANTIGO roda; o efeito novo monta. Se a limpeza parasse o elemento sem olhar,
 * ela mataria o vídeo que o toque acabou de destravar — e o efeito novo teria
 * de chamar `play()` de novo, fora do gesto, mudo. Conferir a URL é o que
 * impede a limpeza de um efeito de desfazer o trabalho do toque seguinte.
 */
export function soltarVideoDoGlobo(url: string): void {
  if (urlAtual !== url) return;
  pararVideoDoGlobo();
}

/** Para e esvazia — chamado quando a publicação sai do globo. */
export function pararVideoDoGlobo(): void {
  if (!elemento) return;
  elemento.pause();
  elemento.removeAttribute('src');
  elemento.load();
  urlAtual = null;
}

const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
};
const ler = () => mudo;
const lerNoServidor = () => false;

/** `true` quando o vídeo do globo está tocando mudo por recusa do navegador. */
export function useVideoDoGloboMudo(): boolean {
  return useSyncExternalStore(assinar, ler, lerNoServidor);
}
