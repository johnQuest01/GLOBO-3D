'use client';

/**
 * Encolher a mídia no navegador, ANTES de ela subir.
 *
 * POR QUE ISTO EXISTE. Um vídeo que sai da câmera de um celular tem entre 50 MB
 * (trinta segundos em 1080p) e 400 MB (dois minutos em 4K). Nada disso sobe: o
 * teto do armazenamento barra, e mesmo que não barrasse, ninguém espera o envio
 * terminar num 4G. O resultado que a pessoa vê é "não consegui enviar o
 * arquivo" — e ela conclui, com razão, que o aplicativo não aceita vídeo.
 *
 * O SEGUNDO PROBLEMA, MENOS ÓBVIO: um iPhone grava em HEVC dentro de um `.mov`.
 * Esse arquivo sobe inteiro e depois NÃO TOCA no Chrome nem no Firefox do
 * computador, que não sabem decodificar HEVC. O vídeo fica preto, sem erro
 * nenhum, e parece defeito do aplicativo. Recodificar aqui resolve os dois
 * casos de uma vez: o que sai daqui é H.264 ou VP9, que tocam em tudo.
 *
 * COMO: o navegador decodifica o vídeo original (o celular que gravou sempre
 * sabe ler o próprio formato), nós desenhamos cada quadro num `canvas` menor, e
 * o `MediaRecorder` grava esse canvas junto com o áudio original.
 *
 * O CUSTO, dito sem rodeio: isso acontece em TEMPO REAL. Um vídeo de um minuto
 * leva um minuto para ser preparado, porque o navegador precisa realmente tocá-lo
 * do começo ao fim. Por isso existe `aoAndar`: sem uma barra de progresso, um
 * minuto de espera é indistinguível de um travamento.
 *
 * O CAMINHO MELHOR, quando valer a pena: `WebCodecs` recodifica mais rápido que
 * o tempo real, mas precisa de uma biblioteca para montar o arquivo MP4 no fim.
 * Não vale a dependência enquanto a espera for de um minuto.
 */

// ---------------------------------------------------------------------------
// Os números
// ---------------------------------------------------------------------------

/** O maior lado de uma imagem depois de encolhida. */
const IMAGEM_LADO_MAX = 1600;
const IMAGEM_QUALIDADE = 0.82;

/**
 * O maior lado de um vídeo, e a taxa de bits.
 *
 * 1280 de lado com 1,6 Mb/s dá cerca de 12 MB por minuto — cabe no teto, sobe
 * num 4G e ainda assim enche uma tela de celular sem borrar. Subir para 1080p
 * dobraria o arquivo para ganhar o que quase ninguém vê num telefone.
 */
const VIDEO_LADO_MAX = 1280;
const VIDEO_BITS = 1_600_000;
const AUDIO_BITS = 96_000;
const QUADROS_POR_SEG = 30;

/**
 * O vídeo mais longo que aceitamos preparar.
 *
 * ESTE NÚMERO É UMA ESCOLHA DE PRODUTO, e está aqui sozinho para ser fácil de
 * mudar. Como o preparo é em tempo real, aceitar meia hora de vídeo significa
 * prender a pessoa meia hora numa tela de espera. Três minutos é o limite em
 * que a espera ainda é espera, e não abandono.
 */
export const VIDEO_SEG_MAX = 180;

/** O cartaz: um quadro só, para o cartão ter o que mostrar enquanto carrega. */
const CARTAZ_LADO_MAX = 640;
const CARTAZ_QUALIDADE = 0.72;

/** Quanto tempo esperamos o navegador decidir se sabe ler o arquivo. */
const PACIENCIA_MS = 20_000;

// ---------------------------------------------------------------------------
// O que sai daqui
// ---------------------------------------------------------------------------

export type MotivoDeRecusa = 'longo-demais' | 'nao-decodifica';

export interface MidiaPronta {
  blob: Blob;
  mime: string;
  /** Um quadro do vídeo, guardado à parte para o cartão não ficar cinza. */
  cartaz: Blob | null;
  bytesAntes: number;
  bytesDepois: number;
  /** Quando não deu para encolher — o original segue, e isto explica por quê. */
  recusa?: MotivoDeRecusa;
  duracaoSeg?: number;
}

export type AoAndar = (fracao: number) => void;

// ---------------------------------------------------------------------------
// Ferramentas pequenas
// ---------------------------------------------------------------------------

/** As medidas que cabem no lado máximo, mantendo a proporção. E pares: alguns
 *  codificadores recusam largura ou altura ímpar. */
function caber(l: number, a: number, maior: number) {
  const escala = Math.min(1, maior / Math.max(l, a));
  const par = (n: number) => Math.max(2, Math.round((n * escala) / 2) * 2);
  return { largura: par(l), altura: par(a) };
}

function paraBlob(
  tela: HTMLCanvasElement,
  mime: string,
  qualidade: number,
): Promise<Blob | null> {
  return new Promise((pronto) => tela.toBlob(pronto, mime, qualidade));
}

/** O melhor formato de saída que ESTE navegador sabe gravar. */
function melhorSaida(): { mime: string; simples: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidatos: [string, string][] = [
    // MP4/H.264 primeiro: é o único que toca em absolutamente todo lugar,
    // inclusive no Safari, que não lê WebM antigo.
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'],
    ['video/mp4', 'video/mp4'],
    ['video/webm;codecs=vp9,opus', 'video/webm'],
    ['video/webm;codecs=vp8,opus', 'video/webm'],
    ['video/webm', 'video/webm'],
  ];
  for (const [mime, simples] of candidatos) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, simples };
  }
  return null;
}

let webpOk: boolean | null = null;
function suportaWebp(): boolean {
  if (webpOk !== null) return webpOk;
  const t = document.createElement('canvas');
  t.width = t.height = 1;
  webpOk = t.toDataURL('image/webp').startsWith('data:image/webp');
  return webpOk;
}

// ---------------------------------------------------------------------------
// Imagem
// ---------------------------------------------------------------------------

/**
 * Uma foto de celular tem 12 megapixels e uns 5 MB. Numa tela ela nunca passa
 * de 1600 pixels de lado — o resto é peso que ninguém vê. Encolher aqui corta
 * uns 90% e faz a imagem aparecer na hora em vez de aparecer aos poucos.
 */
async function encolherImagem(arquivo: File): Promise<MidiaPronta> {
  const intacto: MidiaPronta = {
    blob: arquivo,
    mime: arquivo.type || 'image/jpeg',
    cartaz: null,
    bytesAntes: arquivo.size,
    bytesDepois: arquivo.size,
  };

  // GIF fica de fora: encolher com canvas mataria a animação, e um GIF parado
  // não é a mesma coisa que o GIF que a pessoa escolheu.
  if (arquivo.type === 'image/gif') return intacto;

  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) return { ...intacto, recusa: 'nao-decodifica' };

  const { largura, altura } = caber(bitmap.width, bitmap.height, IMAGEM_LADO_MAX);
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const pincel = tela.getContext('2d');
  if (!pincel) {
    bitmap.close();
    return intacto;
  }
  pincel.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const mime = suportaWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await paraBlob(tela, mime, IMAGEM_QUALIDADE);

  // NUNCA PIORAR. Uma imagem já otimizada pode sair maior do que entrou; nesse
  // caso o original é a melhor versão que temos.
  if (!blob || blob.size >= arquivo.size) return intacto;

  return {
    blob,
    mime,
    cartaz: null,
    bytesAntes: arquivo.size,
    bytesDepois: blob.size,
  };
}

// ---------------------------------------------------------------------------
// Vídeo
// ---------------------------------------------------------------------------

async function encolherVideo(
  arquivo: File,
  aoAndar?: AoAndar,
): Promise<MidiaPronta> {
  const intacto: MidiaPronta = {
    blob: arquivo,
    mime: arquivo.type || 'video/mp4',
    cartaz: null,
    bytesAntes: arquivo.size,
    bytesDepois: arquivo.size,
  };

  const saida = melhorSaida();
  if (!saida) return intacto;

  const endereco = URL.createObjectURL(arquivo);
  const video = document.createElement('video');
  video.src = endereco;
  video.playsInline = true;
  video.preload = 'auto';
  // MUDO DE PROPÓSITO: um vídeo com som não toca sozinho sem um gesto, e este
  // toca escondido, só para ser lido. O áudio continua vindo na trilha que o
  // `captureStream` entrega — mudo silencia o alto-falante, não a captura.
  video.muted = true;

  const limpar = () => {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(endereco);
  };

  try {
    await new Promise<void>((ok, falhou) => {
      const prazo = setTimeout(() => falhou(new Error('demorou')), PACIENCIA_MS);
      video.onloadedmetadata = () => {
        clearTimeout(prazo);
        ok();
      };
      video.onerror = () => {
        clearTimeout(prazo);
        falhou(new Error('nao-decodifica'));
      };
    });

    const duracao = video.duration;
    if (!Number.isFinite(duracao) || duracao <= 0) {
      limpar();
      return intacto;
    }
    if (duracao > VIDEO_SEG_MAX) {
      limpar();
      return { ...intacto, recusa: 'longo-demais', duracaoSeg: duracao };
    }

    const { largura, altura } = caber(
      video.videoWidth,
      video.videoHeight,
      VIDEO_LADO_MAX,
    );
    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    const pincel = tela.getContext('2d', { alpha: false });
    if (!pincel) {
      limpar();
      return intacto;
    }

    // -- O cartaz, antes de tudo -------------------------------------------
    // Um quadro lá pelos 10% do vídeo: o primeiro quadro costuma ser preto,
    // porque a câmera ainda estava ajustando quando começou a gravar.
    let cartaz: Blob | null = null;
    try {
      await new Promise<void>((ok) => {
        video.onseeked = () => ok();
        video.currentTime = Math.min(duracao * 0.1, 1);
        setTimeout(ok, 4000);
      });
      const c = caber(video.videoWidth, video.videoHeight, CARTAZ_LADO_MAX);
      const telaCartaz = document.createElement('canvas');
      telaCartaz.width = c.largura;
      telaCartaz.height = c.altura;
      telaCartaz.getContext('2d')?.drawImage(video, 0, 0, c.largura, c.altura);
      cartaz = await paraBlob(telaCartaz, 'image/jpeg', CARTAZ_QUALIDADE);
    } catch {
      cartaz = null;
    }

    // -- A gravação ---------------------------------------------------------
    await new Promise<void>((ok) => {
      video.onseeked = () => ok();
      video.currentTime = 0;
      setTimeout(ok, 4000);
    });

    const fluxo = tela.captureStream(QUADROS_POR_SEG);
    const comAudio = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    try {
      const origem = comAudio.captureStream?.() ?? comAudio.mozCaptureStream?.();
      for (const trilha of origem?.getAudioTracks() ?? []) fluxo.addTrack(trilha);
    } catch {
      // Sem áudio é pior que com áudio, mas muito melhor que sem vídeo.
    }

    const gravador = new MediaRecorder(fluxo, {
      mimeType: saida.mime,
      videoBitsPerSecond: VIDEO_BITS,
      audioBitsPerSecond: AUDIO_BITS,
    });
    const pedacos: Blob[] = [];
    gravador.ondataavailable = (e) => {
      if (e.data.size > 0) pedacos.push(e.data);
    };
    const gravou = new Promise<void>((ok) => {
      gravador.onstop = () => ok();
    });

    gravador.start(1000);
    await video.play();

    const desenhar = () => {
      if (video.ended || video.paused) return;
      pincel.drawImage(video, 0, 0, largura, altura);
      aoAndar?.(Math.min(0.99, video.currentTime / duracao));
      requestAnimationFrame(desenhar);
    };
    requestAnimationFrame(desenhar);

    await new Promise<void>((ok) => {
      video.onended = () => ok();
      // Rede de segurança: se `ended` não vier (acontece com arquivos de
      // duração torta), paramos pelo relógio, com folga.
      setTimeout(ok, (duracao + 8) * 1000);
    });

    if (gravador.state !== 'inactive') gravador.stop();
    await gravou;
    for (const t of fluxo.getTracks()) t.stop();
    limpar();

    const blob = new Blob(pedacos, { type: saida.simples });
    aoAndar?.(1);

    if (blob.size === 0 || blob.size >= arquivo.size) {
      // Recodificar não ajudou. Mas se o original era HEVC, ele não tocaria —
      // então o que saiu daqui vale mais, mesmo maior, desde que exista.
      if (blob.size === 0) return intacto;
    }

    return {
      blob,
      mime: saida.simples,
      cartaz,
      bytesAntes: arquivo.size,
      bytesDepois: blob.size,
      duracaoSeg: duracao,
    };
  } catch (e) {
    limpar();
    const motivo = e instanceof Error && e.message === 'nao-decodifica';
    return motivo ? { ...intacto, recusa: 'nao-decodifica' } : intacto;
  }
}

// ---------------------------------------------------------------------------
// A porta de entrada
// ---------------------------------------------------------------------------

/**
 * Prepara qualquer arquivo escolhido por uma pessoa para subir.
 *
 * SEMPRE DEVOLVE ALGO. Quando não dá para encolher, devolve o original com um
 * `recusa` dizendo o motivo — quem chama decide se avisa ou se tenta subir
 * assim mesmo. Falhar no preparo não pode ser o mesmo que perder o arquivo.
 */
export async function prepararMidia(
  arquivo: File,
  aoAndar?: AoAndar,
): Promise<MidiaPronta> {
  const tipo = arquivo.type || '';
  if (tipo.startsWith('image/')) return encolherImagem(arquivo);
  if (tipo.startsWith('video/')) return encolherVideo(arquivo, aoAndar);
  return {
    blob: arquivo,
    mime: tipo || 'application/octet-stream',
    cartaz: null,
    bytesAntes: arquivo.size,
    bytesDepois: arquivo.size,
  };
}
