'use client';

/**
 * Preparar foto, áudio e vídeo antes de mandar.
 *
 * A regra que manda em tudo aqui: a mensagem viaja DENTRO de um envelope que o
 * servidor guarda no banco até entregar. Não existe "subir o arquivo e mandar o
 * link" — não há bucket, e é de propósito, porque link em bucket sobrevive à
 * entrega e a caixa postal foi feita para não sobreviver.
 *
 * Então o tamanho importa de verdade, e a foto de 4 MB que sai da câmera do
 * celular precisa encolher ANTES de virar mensagem. Encolher no navegador é
 * também o que evita gastar a internet da pessoa mandando pixel que ninguém
 * vai ver numa bolha de conversa.
 */

import { PAYLOAD_MAX } from '@/realtime/shared/protocol';

/**
 * Quanto cabe de verdade num envelope.
 *
 * `PAYLOAD_MAX` conta CARACTERES do payload, e o payload é JSON com os bytes em
 * base64 — que infla 4/3. Tirando a folga do JSON em volta, sobra isto em bytes
 * de arquivo.
 */
export const BYTES_MAX = Math.floor((PAYLOAD_MAX * 3) / 4) - 2048;

/** O lado maior da foto depois de encolher. Suficiente para tela de celular. */
const LADO_MAX = 1280;

export type TipoDeMidia = 'imagem' | 'audio' | 'video';

export interface MidiaPronta {
  blob: Blob;
  mime: string;
  duracaoMs?: number;
}

/** Os bytes viram texto para caber no envelope JSON. */
export async function paraBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Em pedaços: `String.fromCharCode(...bytes)` com um arquivo grande estoura
  // a pilha de chamadas do JavaScript.
  let bruto = '';
  const PEDACO = 0x8000;
  for (let i = 0; i < bytes.length; i += PEDACO) {
    bruto += String.fromCharCode(...bytes.subarray(i, i + PEDACO));
  }
  return btoa(bruto);
}

export function deBase64(b64: string, mime: string): Blob {
  const bruto = atob(b64);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Encolhe a foto até caber, e devolve JPEG.
 *
 * Duas reduções, nesta ordem: primeiro o tamanho em pixels (que é o que mais
 * pesa), depois a qualidade, em degraus, até entrar no envelope. Começar pela
 * qualidade deixaria uma imagem enorme e borrada — pior dos dois mundos.
 *
 * PNG vira JPEG de propósito: uma foto em PNG costuma ser 5 a 10 vezes maior
 * sem nenhum ganho visível. O custo é perder transparência, que não existe em
 * foto.
 */
export async function prepararImagem(arquivo: Blob): Promise<MidiaPronta | null> {
  const bitmap = await criarBitmap(arquivo);
  if (!bitmap) return null;

  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));

  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();

  for (const qualidade of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const blob = await new Promise<Blob | null>((r) =>
      tela.toBlob(r, 'image/jpeg', qualidade),
    );
    if (blob && blob.size <= BYTES_MAX) {
      return { blob, mime: 'image/jpeg' };
    }
  }
  return null;
}

async function criarBitmap(arquivo: Blob): Promise<ImageBitmap | null> {
  try {
    // `createImageBitmap` respeita a orientação EXIF; sem isso, foto tirada de
    // lado chega deitada.
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
}

/**
 * O formato de gravação que este navegador aceita.
 *
 * Opus é o alvo: uma mensagem de voz de um minuto fica em ~150 KB. Safari
 * antigo só tem mp4/aac, e aí o arquivo é maior — por isso o limite de duração
 * existe, e não só o de bytes.
 */
export function formatoDeAudio(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidatos = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  return candidatos.find((t) => MediaRecorder.isTypeSupported(t));
}

/** Teto de gravação. Dois minutos de opus ficam bem abaixo do envelope. */
export const AUDIO_MAX_MS = 2 * 60 * 1000;

/**
 * Vídeo: aceita o que já couber, e diz claramente quando não couber.
 *
 * Não há recodificação aqui. Reencodar vídeo no navegador é lento, esquenta o
 * aparelho e o resultado é pior que o do próprio celular — e o caminho certo
 * para vídeo grande não é espremer, é armazenamento de objeto (R2/S3) com o
 * envelope carregando um ponteiro. Enquanto isso não existe, clipes curtos
 * passam e o resto recebe uma explicação em vez de um erro.
 */
export function cabeComoVideo(arquivo: Blob): boolean {
  return arquivo.size <= BYTES_MAX;
}

/** Duração de um áudio ou vídeo, para a interface mostrar antes de tocar. */
export function duracaoDe(arquivo: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo);
    const el = document.createElement(
      arquivo.type.startsWith('video') ? 'video' : 'audio',
    );
    const encerrar = (valor?: number) => {
      URL.revokeObjectURL(url);
      resolve(valor);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () =>
      encerrar(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined);
    el.onerror = () => encerrar(undefined);
    el.src = url;
    // Alguns navegadores nunca disparam nada para formato que não conhecem.
    setTimeout(() => encerrar(undefined), 3000);
  });
}

/** Para a interface: "2,3 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
