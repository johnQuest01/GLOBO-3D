'use client';

import type { IceServer } from '@/realtime/shared/protocol';

/**
 * A conexão ponta a ponta.
 *
 * Depois que o servidor apresenta as duas pessoas, ele sai de cena: texto,
 * imagem, áudio e vídeo vão direto de um navegador para o outro. O servidor não
 * tem o que entregar a quem pedir, porque nunca teve — o que passou por ele foi
 * só o "como eu te acho" (SDP e ICE).
 *
 * ISTO INCLUI O "DIGITANDO" E OS RECIBOS. Poderiam ser eventos do Socket.io, e
 * seria mais fácil; seriam também o servidor sabendo quem fala com quem, a que
 * horas, e com que frequência — ou seja, os metadados, que é justamente o que
 * se quer não ter. Eles vão pelo mesmo canal cego das mensagens.
 *
 * NEGOCIAÇÃO PERFEITA. Os dois lados podem querer renegociar ao mesmo tempo
 * (por exemplo, os dois ligam a câmera juntos). Quando isso acontece, uma
 * oferta chega enquanto a local está pendente — o "glare" — e a conexão trava.
 * A saída conhecida é um lado ser `polite` e ceder: ele desfaz a própria
 * oferta e aceita a do outro. Quem é quem foi decidido pelo SERVIDOR, no
 * aceite, porque os dois lados precisam receber papéis opostos e nenhum deles
 * pode decidir isso sozinho.
 */

export type TipoDeMidia = 'imagem' | 'audio';
export type EstadoDaEntrega = 'enviando' | 'entregue' | 'lido';

export interface PeerCallbacks {
  /** Manda SDP/ICE para o outro lado (o servidor só repassa). */
  onSignal: (data: unknown) => void;
  onTexto: (id: string, texto: string) => void;
  onMidia: (
    id: string,
    tipo: TipoDeMidia,
    blobUrl: string,
    mime: string,
    duracaoMs?: number,
  ) => void;
  /** O outro lado está escrevendo (ou parou). */
  onDigitando: (ativo: boolean) => void;
  /** Uma mensagem NOSSA foi entregue ou lida. */
  onRecibo: (id: string, estado: EstadoDaEntrega) => void;
  onVideoRemoto: (stream: MediaStream | null) => void;
  onEstado: (estado: EstadoDaConexao) => void;
}

export type EstadoDaConexao =
  | 'conectando'
  | 'conectado'
  | 'reconectando'
  | 'encerrado'
  | 'falhou';

/**
 * O que trafega como texto no canal. Os bytes crus que vêm depois de um
 * `midia:inicio` são os pedaços do arquivo.
 */
type Envelope =
  | { tipo: 'texto'; id: string; texto: string }
  | { tipo: 'digitando'; ativo: boolean }
  | { tipo: 'recibo'; id: string; estado: 'entregue' | 'lido' }
  | {
      tipo: 'midia:inicio';
      id: string;
      midia: TipoDeMidia;
      mime: string;
      tamanho: number;
      partes: number;
      /** Só para áudio: quanto tempo dura, para desenhar antes de baixar. */
      duracaoMs?: number;
    };

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

/** Limite do que aceitamos receber, para um arquivo não virar negação de serviço. */
const MIDIA_MAX = 8 * 1024 * 1024;

/** De quanto em quanto tempo o "digitando" é reenviado enquanto a pessoa escreve. */
const DIGITANDO_REENVIO_MS = 1_500;

/**
 * Quanto tempo o "digitando" do outro lado sobrevive sem reforço.
 *
 * Precisa ser maior que o reenvio, senão o aviso pisca entre uma batida e
 * outra. E precisa existir: sem ele, quem fechasse o navegador no meio de uma
 * frase ficaria "digitando…" para sempre na tela do outro.
 */
const DIGITANDO_VALIDADE_MS = 4_000;

const novoId = () => Math.random().toString(36).slice(2, 11);

export class PeerConnection {
  private pc: RTCPeerConnection;
  private canal: RTCDataChannel | null = null;
  private cb: PeerCallbacks;
  private polite: boolean;

  /** Estado da negociação perfeita. */
  private fazendoOferta = false;
  private ignorandoOferta = false;

  /** Remontagem da mídia que chega em pedaços. */
  private recebendo: {
    cabecalho: Extract<Envelope, { tipo: 'midia:inicio' }>;
    partes: ArrayBuffer[];
    recebido: number;
  } | null = null;

  /**
   * Fila de envio.
   *
   * Duas mídias enviadas em sequência rápida (uma foto e logo um áudio) são
   * duas funções `async` correndo ao mesmo tempo, e os pedaços das duas se
   * intercalariam no canal. Como o lado que recebe tem UM slot de remontagem,
   * o resultado seria um arquivo corrompido — e silenciosamente, que é o pior
   * jeito. A fila serializa: um arquivo inteiro, depois o outro.
   */
  private fila: Promise<unknown> = Promise.resolve();

  private streamLocal: MediaStream | null = null;

  /** Última vez que anunciamos "estou digitando". */
  private ultimoDigitando = 0;
  private timerDigitandoRemoto: ReturnType<typeof setTimeout> | null = null;

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

  private aberto(): boolean {
    return this.canal?.readyState === 'open';
  }

  private enviarEnvelope(envelope: Envelope): boolean {
    if (!this.aberto()) return false;
    this.canal!.send(JSON.stringify(envelope));
    return true;
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

  /**
   * Manda o texto e devolve o id, ou null se o canal está fechado.
   *
   * O ID É A METADE QUE FALTAVA. Sem ele o recibo não teria a que se referir:
   * "entregue" chegaria sem dizer entregue o quê, e duas mensagens iguais
   * seguidas ("ok", "ok") seriam indistinguíveis.
   */
  enviarTexto(texto: string): string | null {
    const id = novoId();
    if (!this.enviarEnvelope({ tipo: 'texto', id, texto })) return null;
    // Quem estava digitando acabou de enviar: o aviso do outro lado tem que
    // sumir agora, e não daqui a quatro segundos.
    this.enviarDigitando(false);
    return id;
  }

  /**
   * "Estou digitando".
   *
   * Estrangulado aqui dentro, e não em quem chama: cada tecla dispara um
   * evento, e mandar um pacote por tecla é desperdício puro num canal que
   * também carrega áudio e vídeo.
   */
  enviarDigitando(ativo: boolean): void {
    if (!this.aberto()) return;

    if (!ativo) {
      this.ultimoDigitando = 0;
      this.enviarEnvelope({ tipo: 'digitando', ativo: false });
      return;
    }

    const agora = Date.now();
    if (agora - this.ultimoDigitando < DIGITANDO_REENVIO_MS) return;
    this.ultimoDigitando = agora;
    this.enviarEnvelope({ tipo: 'digitando', ativo: true });
  }

  /** Avisa o outro lado de que as mensagens dele foram lidas. */
  marcarComoLido(ids: string[]): void {
    for (const id of ids) {
      this.enviarEnvelope({ tipo: 'recibo', id, estado: 'lido' });
    }
  }

  /**
   * Imagem ou áudio, em pedaços.
   *
   * Vai como um cabeçalho JSON e depois os bytes crus, e não como base64 num
   * JSON só: base64 inflaria 33% e o canal fecharia no tamanho.
   *
   * Devolve o id da mensagem, ou null se não deu para enviar.
   */
  enviarMidia(
    arquivo: Blob,
    tipo: TipoDeMidia,
    duracaoMs?: number,
  ): Promise<string | null> {
    // Entra na fila: o corpo só começa quando o envio anterior terminou.
    const resultado = this.fila.then(() =>
      this.enviarMidiaAgora(arquivo, tipo, duracaoMs),
    );
    // A fila segue mesmo se este envio falhar — senão um erro travaria todos
    // os envios seguintes da conversa.
    this.fila = resultado.catch(() => null);
    return resultado;
  }

  private async enviarMidiaAgora(
    arquivo: Blob,
    tipo: TipoDeMidia,
    duracaoMs?: number,
  ): Promise<string | null> {
    if (!this.aberto()) return null;
    if (arquivo.size > MIDIA_MAX) return null;

    const buffer = await arquivo.arrayBuffer();
    const partes = Math.ceil(buffer.byteLength / PEDACO);
    const id = novoId();

    const enviou = this.enviarEnvelope({
      tipo: 'midia:inicio',
      id,
      midia: tipo,
      mime: arquivo.type || (tipo === 'audio' ? 'audio/webm' : 'image/jpeg'),
      tamanho: buffer.byteLength,
      partes,
      ...(duracaoMs ? { duracaoMs } : {}),
    });
    if (!enviou) return null;

    for (let i = 0; i < partes; i++) {
      // Espera o buffer drenar antes de continuar.
      if (this.canal!.bufferedAmount > BUFFER_ALTO) {
        await new Promise<void>((resolve) => {
          const seguir = () => {
            this.canal?.removeEventListener('bufferedamountlow', seguir);
            resolve();
          };
          this.canal?.addEventListener('bufferedamountlow', seguir);
        });
      }
      if (!this.aberto()) return null;
      this.canal!.send(buffer.slice(i * PEDACO, (i + 1) * PEDACO));
    }
    return id;
  }

  // --- Recepção -------------------------------------------------------------

  private receber(dados: string | ArrayBuffer): void {
    if (typeof dados === 'string') {
      let msg: Envelope;
      try {
        msg = JSON.parse(dados) as Envelope;
      } catch {
        return; // mensagem que não é JSON: ignorada
      }
      this.tratarEnvelope(msg);
      return;
    }

    // Bytes: pedaço da mídia anunciada pelo último cabeçalho.
    if (!this.recebendo) return;

    this.recebendo.recebido += dados.byteLength;
    // O cabeçalho diz o tamanho; os bytes têm que caber nele. Sem esta
    // checagem, um lado mal-intencionado anuncia 1 KB e despeja 500 MB.
    if (this.recebendo.recebido > this.recebendo.cabecalho.tamanho) {
      this.recebendo = null;
      return;
    }
    this.recebendo.partes.push(dados);

    if (this.recebendo.partes.length >= this.recebendo.cabecalho.partes) {
      const { id, mime, midia, duracaoMs } = this.recebendo.cabecalho;
      const blob = new Blob(this.recebendo.partes, { type: mime });
      this.recebendo = null;
      this.cb.onMidia(id, midia, URL.createObjectURL(blob), mime, duracaoMs);
      // O recibo sai no instante em que o último pedaço chega — é isto, e não
      // um relógio, que faz o ✓✓ aparecer na velocidade real da rede.
      this.enviarEnvelope({ tipo: 'recibo', id, estado: 'entregue' });
    }
  }

  private tratarEnvelope(msg: Envelope): void {
    switch (msg.tipo) {
      case 'texto': {
        if (typeof msg.texto !== 'string' || typeof msg.id !== 'string') return;
        // Recebeu: quem estava "digitando" já falou.
        this.marcarDigitandoRemoto(false);
        this.cb.onTexto(msg.id, msg.texto.slice(0, 4000));
        this.enviarEnvelope({ tipo: 'recibo', id: msg.id, estado: 'entregue' });
        return;
      }

      case 'digitando':
        this.marcarDigitandoRemoto(Boolean(msg.ativo));
        return;

      case 'recibo':
        if (msg.estado === 'entregue' || msg.estado === 'lido') {
          this.cb.onRecibo(String(msg.id), msg.estado);
        }
        return;

      case 'midia:inicio': {
        if (
          typeof msg.tamanho !== 'number' ||
          msg.tamanho <= 0 ||
          msg.tamanho > MIDIA_MAX ||
          typeof msg.partes !== 'number' ||
          msg.partes <= 0
        ) {
          return;
        }
        if (msg.midia !== 'imagem' && msg.midia !== 'audio') return;
        this.recebendo = { cabecalho: msg, partes: [], recebido: 0 };
        return;
      }
    }
  }

  /**
   * O "digitando" do outro lado, com validade.
   *
   * Um aviso que só some quando chega um "parei" ficaria preso na tela para
   * sempre se a pessoa fechasse o navegador no meio da frase — e é justamente
   * quando o "parei" não chega.
   */
  private marcarDigitandoRemoto(ativo: boolean): void {
    if (this.timerDigitandoRemoto) {
      clearTimeout(this.timerDigitandoRemoto);
      this.timerDigitandoRemoto = null;
    }
    this.cb.onDigitando(ativo);
    if (ativo) {
      this.timerDigitandoRemoto = setTimeout(
        () => this.cb.onDigitando(false),
        DIGITANDO_VALIDADE_MS,
      );
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
    if (this.timerDigitandoRemoto) clearTimeout(this.timerDigitandoRemoto);
    this.desligarVideo();
    this.canal?.close();
    this.pc.close();
    this.cb.onEstado('encerrado');
  }
}
