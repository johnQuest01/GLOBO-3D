'use client';

import type { IceServer } from '@/realtime/shared/protocol';

/**
 * A conexão ponta a ponta.
 *
 * Depois que o servidor apresenta as duas pessoas, ele sai de cena: texto,
 * imagem e vídeo vão direto de um navegador para o outro. O servidor não tem o
 * que entregar a quem pedir, porque nunca teve — o que passou por ele foi só o
 * "como eu te acho" (SDP e ICE).
 *
 * NEGOCIAÇÃO PERFEITA. Os dois lados podem querer renegociar ao mesmo tempo
 * (por exemplo, os dois ligam a câmera juntos). Quando isso acontece, uma
 * oferta chega enquanto a local está pendente — o "glare" — e a conexão trava.
 * A saída conhecida é um lado ser `polite` e ceder: ele desfaz a própria
 * oferta e aceita a do outro. Quem é quem foi decidido pelo SERVIDOR, no
 * aceite, porque os dois lados precisam receber papéis opostos e nenhum deles
 * pode decidir isso sozinho.
 */

export interface PeerCallbacks {
  /** Manda SDP/ICE para o outro lado (o servidor só repassa). */
  onSignal: (data: unknown) => void;
  onTexto: (texto: string) => void;
  onImagem: (blobUrl: string, mime: string) => void;
  onVideoRemoto: (stream: MediaStream | null) => void;
  onEstado: (estado: EstadoDaConexao) => void;
}

export type EstadoDaConexao =
  | 'conectando'
  | 'conectado'
  | 'reconectando'
  | 'encerrado'
  | 'falhou';

/** Cabeçalho de um pedaço de imagem. Ver o comentário do `enviarImagem`. */
interface CabecalhoImagem {
  tipo: 'imagem:inicio';
  id: string;
  mime: string;
  tamanho: number;
  partes: number;
}

/**
 * Tamanho do pedaço.
 *
 * O DataChannel não aceita qualquer tamanho de mensagem: acima de ~256 KB o
 * canal fecha sozinho em vários navegadores, sem erro claro. 16 KB é o valor
 * seguro em todos eles.
 */
const PEDACO = 16 * 1024;

/**
 * Teto de espera no buffer.
 *
 * Sem isto, uma imagem de 5 MB entra no canal em milissegundos e estoura a
 * memória do lado que envia. O envio pausa quando o buffer enche e continua
 * quando ele drena.
 */
const BUFFER_ALTO = 1 * 1024 * 1024;
const BUFFER_BAIXO = 256 * 1024;

/** Limite do que aceitamos receber, para uma imagem não virar negação de serviço. */
const IMAGEM_MAX = 8 * 1024 * 1024;

export class PeerConnection {
  private pc: RTCPeerConnection;
  private canal: RTCDataChannel | null = null;
  private cb: PeerCallbacks;
  private polite: boolean;

  /** Estado da negociação perfeita. */
  private fazendoOferta = false;
  private ignorandoOferta = false;

  /** Remontagem de imagem que chega em pedaços. */
  private recebendo: { cabecalho: CabecalhoImagem; partes: ArrayBuffer[] } | null = null;

  private streamLocal: MediaStream | null = null;

  constructor(iceServers: IceServer[], polite: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = polite;

    this.pc = new RTCPeerConnection({
      iceServers: iceServers as RTCIceServer[],
    });

    // --- Sinalização de saída ---------------------------------------------
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.cb.onSignal({ candidate });
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.fazendoOferta = true;
        // `setLocalDescription()` sem argumento deixa o navegador escolher o
        // tipo certo (offer ou answer). É a forma recomendada na negociação
        // perfeita, e evita o erro clássico de criar uma oferta no estado
        // errado.
        await this.pc.setLocalDescription();
        this.cb.onSignal({ description: this.pc.localDescription });
      } catch (e) {
        console.error('[peer] falha ao negociar:', e);
      } finally {
        this.fazendoOferta = false;
      }
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'connected') this.cb.onEstado('conectado');
      else if (s === 'disconnected') this.cb.onEstado('reconectando');
      else if (s === 'failed') {
        // Quase sempre é falta de TURN: os dois lados atrás de NAT que não
        // deixa a conexão direta acontecer.
        this.cb.onEstado('falhou');
      } else if (s === 'closed') this.cb.onEstado('encerrado');
    };

    this.pc.ontrack = ({ streams }) => {
      this.cb.onVideoRemoto(streams[0] ?? null);
    };

    // Quem recebe o canal criado pelo outro lado.
    this.pc.ondatachannel = ({ channel }) => this.prepararCanal(channel);
  }

  /**
   * Só um dos dois cria o canal.
   *
   * Se os dois criarem, aparecem dois canais e as mensagens se dividem entre
   * eles — metade das falas some para cada lado. Quem cria é o `impolite`,
   * por ser uma escolha qualquer que os dois conhecem.
   */
  iniciar(): void {
    this.cb.onEstado('conectando');
    if (!this.polite) {
      this.prepararCanal(this.pc.createDataChannel('globo', { ordered: true }));
    }
  }

  private prepararCanal(canal: RTCDataChannel): void {
    this.canal = canal;
    canal.binaryType = 'arraybuffer';
    canal.bufferedAmountLowThreshold = BUFFER_BAIXO;

    canal.onopen = () => this.cb.onEstado('conectado');
    canal.onclose = () => this.cb.onEstado('encerrado');
    canal.onmessage = (ev) => this.receber(ev.data);
  }

  // --- Sinalização de entrada ---------------------------------------------

  /**
   * Trata o que veio do outro lado. É aqui que a negociação perfeita acontece.
   */
  async aoReceberSinal(data: unknown): Promise<void> {
    const msg = data as {
      description?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };

    try {
      if (msg.description) {
        const ehOferta = msg.description.type === 'offer';
        const ocupado =
          this.fazendoOferta || this.pc.signalingState !== 'stable';
        const colisao = ehOferta && ocupado;

        // O impolite ignora a oferta que colidiu e mantém a dele. O polite
        // cede. Se os dois ignorassem, ninguém conectaria; se os dois
        // cedessem, a negociação ficaria indo e voltando.
        this.ignorandoOferta = !this.polite && colisao;
        if (this.ignorandoOferta) return;

        await this.pc.setRemoteDescription(msg.description);
        if (ehOferta) {
          await this.pc.setLocalDescription();
          this.cb.onSignal({ description: this.pc.localDescription });
        }
        return;
      }

      if (msg.candidate) {
        try {
          await this.pc.addIceCandidate(msg.candidate);
        } catch (e) {
          // Candidato que chega depois de uma oferta ignorada é esperado e
          // não é erro: só engoli-lo quando foi esse o caso.
          if (!this.ignorandoOferta) throw e;
        }
      }
    } catch (e) {
      console.error('[peer] sinal invalido:', e);
    }
  }

  // --- Envio ---------------------------------------------------------------

  enviarTexto(texto: string): boolean {
    if (this.canal?.readyState !== 'open') return false;
    this.canal.send(JSON.stringify({ tipo: 'texto', texto }));
    return true;
  }

  /**
   * Imagem em pedaços.
   *
   * Vai como um cabeçalho JSON e depois os bytes crus, e não como base64 num
   * JSON só: base64 inflaria 33% e o canal fecharia no tamanho.
   */
  async enviarImagem(arquivo: Blob): Promise<boolean> {
    if (this.canal?.readyState !== 'open') return false;
    if (arquivo.size > IMAGEM_MAX) return false;

    const buffer = await arquivo.arrayBuffer();
    const partes = Math.ceil(buffer.byteLength / PEDACO);
    const cabecalho: CabecalhoImagem = {
      tipo: 'imagem:inicio',
      id: Math.random().toString(36).slice(2),
      mime: arquivo.type || 'image/jpeg',
      tamanho: buffer.byteLength,
      partes,
    };
    this.canal.send(JSON.stringify(cabecalho));

    for (let i = 0; i < partes; i++) {
      // Espera o buffer drenar antes de continuar.
      if (this.canal.bufferedAmount > BUFFER_ALTO) {
        await new Promise<void>((resolve) => {
          const seguir = () => {
            this.canal?.removeEventListener('bufferedamountlow', seguir);
            resolve();
          };
          this.canal?.addEventListener('bufferedamountlow', seguir);
        });
      }
      if (this.canal.readyState !== 'open') return false;
      this.canal.send(buffer.slice(i * PEDACO, (i + 1) * PEDACO));
    }
    return true;
  }

  private receber(dados: string | ArrayBuffer): void {
    if (typeof dados === 'string') {
      try {
        const msg = JSON.parse(dados);
        if (msg.tipo === 'texto' && typeof msg.texto === 'string') {
          this.cb.onTexto(String(msg.texto).slice(0, 4000));
        } else if (msg.tipo === 'imagem:inicio') {
          if (msg.tamanho > IMAGEM_MAX) return;
          this.recebendo = { cabecalho: msg, partes: [] };
        }
      } catch {
        /* mensagem que não é JSON: ignorada */
      }
      return;
    }

    // Bytes: pedaço de imagem.
    if (!this.recebendo) return;
    this.recebendo.partes.push(dados);

    if (this.recebendo.partes.length >= this.recebendo.cabecalho.partes) {
      const blob = new Blob(this.recebendo.partes, {
        type: this.recebendo.cabecalho.mime,
      });
      this.cb.onImagem(URL.createObjectURL(blob), this.recebendo.cabecalho.mime);
      this.recebendo = null;
    }
  }

  // --- Vídeo ---------------------------------------------------------------

  /**
   * Liga câmera e microfone. Devolve o stream local para a prévia.
   *
   * Adicionar as faixas dispara `onnegotiationneeded` sozinho — é por isso que
   * a negociação perfeita precisa estar de pé ANTES de o vídeo existir: se os
   * dois ligarem a câmera ao mesmo tempo, é exatamente o caso de colisão.
   */
  async ligarVideo(): Promise<MediaStream | null> {
    if (this.streamLocal) return this.streamLocal;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      this.streamLocal = stream;
      for (const faixa of stream.getTracks()) this.pc.addTrack(faixa, stream);
      return stream;
    } catch (e) {
      console.error('[peer] camera/microfone negados:', e);
      return null;
    }
  }

  desligarVideo(): void {
    if (!this.streamLocal) return;
    for (const faixa of this.streamLocal.getTracks()) faixa.stop();
    for (const remetente of this.pc.getSenders()) {
      if (remetente.track) this.pc.removeTrack(remetente);
    }
    this.streamLocal = null;
  }

  // --- Fim ------------------------------------------------------------------

  encerrar(): void {
    this.desligarVideo();
    this.canal?.close();
    this.pc.close();
    this.cb.onEstado('encerrado');
  }
}
