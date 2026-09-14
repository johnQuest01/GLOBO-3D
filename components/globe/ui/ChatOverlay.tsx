'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';

import type { Mensagem } from '@/app/hooks/useConversas';
import ConviteDeAvisos from '@/components/globe/ui/ConviteDeAvisos';
import {
  AUDIO_MAX_MS,
  BYTES_MAX,
  duracaoDe,
  formatoDeAudio,
  prepararImagem,
  tamanhoLegivel,
  type TipoDeMidia,
} from '@/lib/chat/midia';

/**
 * A conversa, em tela cheia, com o globo desfocado por baixo.
 *
 * A tela não depende de conexão viva: ela abre com a outra pessoa offline,
 * guarda o que foi dito e continua lá depois de recarregar a página.
 *
 * O AVISO DIZ A VERDADE, e já mudou duas vezes junto com o sistema: quando
 * nada era gravado, ele dizia isso; quando o servidor passou a guardar só até
 * entregar, passou a dizer aquilo. Agora o histórico acompanha a CONTA, e a
 * frase acompanha. Dizer à pessoa uma garantia que o sistema deixou de dar é
 * pior do que não dizer nada.
 *
 * DENUNCIAR E BLOQUEAR continuam a um clique, sem menu escondido.
 */

interface Props {
  aberta: boolean;
  nome: string;
  mensagens: Mensagem[];
  online: boolean;
  videoRemoto?: MediaStream | null;
  videoLocal?: MediaStream | null;
  /** O outro lado está escrevendo agora. */
  digitando?: boolean;
  onEnviarTexto: (texto: string) => boolean;
  /** Chamada a cada tecla. O freio de rede é de quem recebe esta chamada. */
  onDigitando?: () => void;
  onEnviarMidia: (
    tipo: TipoDeMidia,
    blob: Blob,
    mime: string,
    duracaoMs?: number,
    nome?: string,
  ) => Promise<boolean>;
  onMarcarLidas: () => void;
  /** Tocar no nome abre o perfil de quem esta do outro lado. */
  onVerPerfil?: (nickname: string) => void;
  onFechar: () => void;
  onChamarVideo?: () => void;
  onDenunciar: (motivo: string) => void;
  onBloquear: () => void;
}

const hora = (quando: number) =>
  new Date(quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const dia = (quando: number) =>
  new Date(quando).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

const duracaoLegivel = (ms?: number) => {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * O tique.
 *
 * Três estados e não dois, porque "o servidor pegou" e "o aparelho dela pegou"
 * são coisas diferentes — a primeira acontece na hora, a segunda pode acontecer
 * amanhã.
 */
const Recibo: FC<{ estado?: Mensagem['entrega'] }> = ({ estado }) => {
  if (!estado) return null;
  if (estado === 'falhou') return <span className="text-red-300">!</span>;
  if (estado === 'enviando') return <span className="text-white/30">◌</span>;
  if (estado === 'enviada') return <span className="text-white/50">✓</span>;
  return <span className={estado === 'lida' ? 'text-cyan-300' : 'text-white/50'}>✓✓</span>;
};

/** O maior video aceito pelo armazenamento. Ver app/api/midia/route.ts. */
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

const ERRO_EM_PORTUGUES: Record<string, string> = {
  SEM_DESTINATARIO: 'Esse nickname não existe mais.',
  BLOQUEADO: 'Vocês não podem mais se falar.',
  NAO_ACEITA: 'Essa pessoa só recebe mensagem de quem ela já conhece.',
  GRANDE_DEMAIS: 'Conteúdo grande demais.',
  INDISPONIVEL: 'As mensagens estão indisponíveis agora.',
  SEM_CONTA: 'Escolha um nickname para poder conversar.',
};

/**
 * Um item da gaveta de anexos.
 *
 * E' um `label` com o input escondido dentro, e nao um botao que dispara um
 * clique programatico: o navegador so' abre o seletor de arquivos a partir de
 * um gesto direto, e o caminho do label e' o unico que nunca e' bloqueado.
 */
const Anexo: FC<{
  titulo: string;
  cor: string;
  accept: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children: React.ReactNode;
}> = ({ titulo, cor, accept, onChange, children }) => (
  <label
    className="flex w-20 cursor-pointer flex-col items-center gap-1.5 rounded-xl px-2 py-3
               text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
  >
    <span className={`rounded-full bg-white/10 p-3 ${cor}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {children}
      </svg>
    </span>
    {titulo}
    <input type="file" accept={accept} onChange={onChange} className="hidden" />
  </label>
);

/**
 * O campo cresce com o que foi escrito, em vez de rolar por dentro.
 *
 * COM `rows={1}` E ALTURA FIXA, a segunda linha nascia dentro de uma barrinha
 * de rolagem: o texto some para cima, a pessoa perde de vista o que escreveu, e
 * o campo fica com um retangulo apertado no meio da tela. Relatado assim —
 * "um scroll dentro que quebra o app deixando feio".
 *
 * A conta e' direta: zera a altura para o navegador recalcular o `scrollHeight`
 * (sem zerar, ele nunca DIMINUI quando a pessoa apaga), e depois assume esse
 * valor ate' o teto.
 *
 * O TETO EXISTE porque um campo que cresce sem limite acabaria comendo a
 * conversa inteira. Passando dele a rolagem interna volta, e ai' ela e' o
 * comportamento certo.
 *
 * O TETO ERA DE 160px E ISSO ERA ALTO DEMAIS PARA CELULAR. Medido num aparelho
 * de 375x812: com o campo cheio, o rodape inteiro chegava a 209px — mais de um
 * QUARTO da tela ocupado pelo lugar de escrever, e a conversa espremida no que
 * sobrava. Relatado assim: "ao escrever muita coisa a caixa de texto cresce
 * para cima".
 *
 * Agora sao quatro linhas (22px cada, mais 16 de respiro), o que deixa o rodape
 * em ~153px: um quinto da tela, que e' mais ou menos onde os aplicativos de
 * conversa param.
 *
 * E O TETO ACOMPANHA A TELA VISIVEL, que nao e' a mesma coisa que a tela. Com o
 * teclado aberto sobram uns 380px de altura num celular, e um campo de 104px
 * ali ja' seria um quarto do que se enxerga. O `visualViewport` e' a unica
 * medida que sabe do teclado; sem ele o campo ficaria certo com o teclado
 * fechado, que e' justamente quando ninguem esta escrevendo.
 */
const LINHA_PX = 22;
const RESPIRO_PX = 16;
const LINHAS_MAX = 4;
const ALTURA_MAX_PX = LINHAS_MAX * LINHA_PX + RESPIRO_PX;
/** Quanto da tela visivel o campo pode tomar, no maximo. */
const FATIA_DA_TELA = 0.25;

function crescerComOTexto(campo: HTMLTextAreaElement): void {
  const visivel =
    typeof window !== 'undefined' && window.visualViewport
      ? window.visualViewport.height
      : (typeof window !== 'undefined' ? window.innerHeight : 0) || 0;

  const teto = visivel
    ? Math.max(LINHA_PX + RESPIRO_PX, Math.min(ALTURA_MAX_PX, visivel * FATIA_DA_TELA))
    : ALTURA_MAX_PX;

  campo.style.height = 'auto';
  campo.style.height = `${Math.min(campo.scrollHeight, teto)}px`;
}

const ChatOverlay: FC<Props> = ({
  aberta,
  nome,
  mensagens,
  online,
  videoRemoto,
  videoLocal,
  digitando,
  onEnviarTexto,
  onDigitando,
  onEnviarMidia,
  onMarcarLidas,
  onVerPerfil,
  onFechar,
  onChamarVideo,
  onDenunciar,
  onBloquear,
}) => {
  const [texto, setTexto] = useState('');
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [preparando, setPreparando] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [anexosAbertos, setAnexosAbertos] = useState(false);
  /** De onde a pessoa vem, em uma frase. Nulo enquanto nao se sabe. */
  const [origem, setOrigem] = useState<string | null>(null);

  const fim = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const videoRemotoRef = useRef<HTMLVideoElement>(null);
  const videoLocalRef = useRef<HTMLVideoElement>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const cancelarRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const quantidade = mensagens.length;

  useEffect(() => {
    if (aberta) fim.current?.scrollIntoView({ behavior: 'smooth' });
  }, [quantidade, aberta]);

  /*
   * A ALTURA DO CAMPO E' ACERTADA AO ABRIR, e nao so' quando alguem digita.
   *
   * Sem isto, o campo nascia com a altura de uma linha enquanto o texto de
   * ajuda ocupava duas — no celular, onde ele e' estreito, a segunda linha
   * ficava CORTADA na borda de baixo. Relatado tres vezes, e com razao.
   */
  useEffect(() => {
    if (aberta && campoRef.current) crescerComOTexto(campoRef.current);
  }, [aberta]);

  /*
   * E E' ACERTADA DE NOVO QUANDO O TECLADO SOBE.
   *
   * O teto do campo depende da altura VISIVEL, e o teclado corta essa altura
   * pela metade. Sem escutar isso, um campo que ja' tinha crescido com o
   * teclado fechado continuaria com a altura antiga depois que ele subiu —
   * exatamente no momento em que sobra menos tela, e exatamente com a pessoa
   * olhando.
   *
   * `visualViewport` e' o unico que enxerga o teclado; `resize` da janela nao
   * dispara para ele em boa parte dos celulares.
   */
  useEffect(() => {
    if (!aberta) return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;

    const acertar = () => {
      if (campoRef.current) crescerComOTexto(campoRef.current);
    };
    vv.addEventListener('resize', acertar);
    return () => vv.removeEventListener('resize', acertar);
  }, [aberta]);

  /*
   * DE ONDE VEM ESTA PESSOA.
   *
   * Num aplicativo de globo, essa e' metade da graca: "e' da Russia" muda o
   * tom de uma conversa entre desconhecidos antes da primeira palavra.
   *
   * Quem decide quanto aparece e' o servidor, pela vontade dela: perfil aberto
   * devolve pais e cidade; reservado, so' o pais; privado, nada. Aqui nao ha'
   * regra de privacidade nenhuma — so' se mostra o que chegou.
   */
  useEffect(() => {
    if (!aberta || !nome) {
      setOrigem(null);
      return;
    }
    let vivo = true;
    setOrigem(null);

    void (async () => {
      try {
        const r = await fetch(`/api/users/perfil?de=${encodeURIComponent(nome)}`);
        if (!r.ok || !vivo) return;
        const d = (await r.json()) as {
          perfil?: { lugar: string | null; pais: string | null };
        };
        if (!vivo) return;
        // `lugar` ja' vem como "Cidade, Estado, Pais" quando o perfil e'
        // aberto; senao sobra o pais sozinho.
        setOrigem(d.perfil?.lugar ?? d.perfil?.pais ?? null);
      } catch {
        /* sem resposta: o cabecalho mostra o estado de presenca, como antes */
      }
    })();

    return () => {
      vivo = false;
    };
  }, [aberta, nome]);

  /**
   * Marca como lido só com a janela à vista.
   *
   * Sem a checagem de `visibilityState`, uma aba em segundo plano marcaria tudo
   * como lido e o ✓✓ azul do outro lado seria mentira.
   */
  useEffect(() => {
    if (!aberta) return;
    const marcar = () => {
      if (document.visibilityState === 'visible') onMarcarLidas();
    };
    marcar();
    document.addEventListener('visibilitychange', marcar);
    window.addEventListener('focus', marcar);
    return () => {
      document.removeEventListener('visibilitychange', marcar);
      window.removeEventListener('focus', marcar);
    };
  }, [quantidade, aberta, onMarcarLidas]);

  // O elemento de vídeo recebe o stream por propriedade: `src` não aceita
  // MediaStream.
  useEffect(() => {
    if (videoRemotoRef.current) videoRemotoRef.current.srcObject = videoRemoto ?? null;
  }, [videoRemoto]);
  useEffect(() => {
    if (videoLocalRef.current) videoLocalRef.current.srcObject = videoLocal ?? null;
  }, [videoLocal]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ampliada) setAmpliada(null);
      else onFechar();
    };
    if (aberta) window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, onFechar, ampliada]);

  // Microfone preso com a tela fechada seria o pior tipo de surpresa.
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const g = gravadorRef.current;
      if (g && g.state !== 'inactive') {
        cancelarRef.current = true;
        g.stop();
      }
    },
    [],
  );

  // --- Envio de arquivo ------------------------------------------------------

  const escolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    setAnexosAbertos(false);
    if (!arquivo) return;

    setProblema(null);
    setPreparando('Preparando a foto…');
    try {
      // Encolher no navegador é o que faz a foto de 4 MB da câmera virar
      // mensagem. O arquivo original nunca sai do aparelho.
      const pronta = await prepararImagem(arquivo);
      if (!pronta) {
        setProblema('Não consegui preparar essa imagem.');
        return;
      }
      await onEnviarMidia('imagem', pronta.blob, pronta.mime);
    } finally {
      setPreparando(null);
    }
  };

  const escolherDocumento = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    setAnexosAbertos(false);
    if (!arquivo) return;

    setProblema(null);

    if (arquivo.size > VIDEO_MAX_BYTES) {
      setProblema(
        `Esse arquivo tem ${tamanhoLegivel(arquivo.size)} e o limite e' ${tamanhoLegivel(
          VIDEO_MAX_BYTES,
        )}.`,
      );
      return;
    }

    setPreparando('Enviando o arquivo…');
    try {
      /*
       * O NOME DO ARQUIVO VIAJA JUNTO, e sem ele o documento nao teria rotulo
       * nenhum do outro lado: o objeto no armazenamento se chama por 24 bytes
       * sorteados, de proposito.
       *
       * O tipo vem do proprio arquivo; quando o sistema nao souber dizer qual
       * e' (acontece com extensoes menos comuns), vai como binario generico —
       * que o armazenamento aceita e o navegador baixa em vez de tentar abrir.
       */
      const foi = await onEnviarMidia(
        'documento',
        arquivo,
        arquivo.type || 'application/octet-stream',
        undefined,
        arquivo.name,
      );
      if (!foi) setProblema('Nao consegui enviar esse arquivo.');
    } finally {
      setPreparando(null);
    }
  };

  const escolherVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    setAnexosAbertos(false);
    if (!arquivo) return;

    setProblema(null);

    /*
     * O LIMITE DEIXOU DE SER DAQUI.
     *
     * Enquanto os bytes viajavam dentro da mensagem, o teto era o do envelope
     * (~1,5 MB) e quase nenhum video de celular passava. Agora o arquivo vai
     * para o armazenamento, e quem sabe se coube e' o envio — que tenta, e so'
     * recusa se nao houver armazenamento e o arquivo nao couber no caminho
     * antigo. Recusar aqui, antes de tentar, barraria videos que hoje passam.
     */
    if (arquivo.size > VIDEO_MAX_BYTES) {
      setProblema(
        `Esse video tem ${tamanhoLegivel(arquivo.size)} e o limite e' ${tamanhoLegivel(
          VIDEO_MAX_BYTES,
        )}. Mande um trecho mais curto.`,
      );
      return;
    }

    setPreparando('Enviando o video…');
    try {
      const duracaoMs = await duracaoDe(arquivo);
      const foi = await onEnviarMidia('video', arquivo, arquivo.type || 'video/mp4', duracaoMs);
      if (!foi) setProblema('Nao consegui enviar esse video. Tente um trecho menor.');
    } finally {
      setPreparando(null);
    }
  };

  // --- Gravação de áudio -----------------------------------------------------

  const pararDeGravar = useCallback((cancelar: boolean) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelarRef.current = cancelar;
    const g = gravadorRef.current;
    if (g && g.state !== 'inactive') g.stop();
    setGravando(false);
    setSegundos(0);
  }, []);

  const comecarAGravar = useCallback(async () => {
    if (gravadorRef.current) return;
    setProblema(null);

    const mime = formatoDeAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const gravador = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      gravadorRef.current = gravador;
      pedacosRef.current = [];
      cancelarRef.current = false;
      inicioRef.current = Date.now();

      gravador.ondataavailable = (ev) => {
        if (ev.data.size > 0) pedacosRef.current.push(ev.data);
      };

      gravador.onstop = async () => {
        // O microfone precisa ser solto SEMPRE, inclusive quando a gravação foi
        // cancelada: parar o gravador não desliga o aparelho.
        for (const faixa of stream.getTracks()) faixa.stop();
        gravadorRef.current = null;

        const duracaoMs = Date.now() - inicioRef.current;
        const pedacos = pedacosRef.current;
        pedacosRef.current = [];

        if (cancelarRef.current || pedacos.length === 0) return;
        // Meio segundo é quase sempre o dedo escorregando no botão.
        if (duracaoMs < 500) return;

        const blob = new Blob(pedacos, { type: gravador.mimeType });
        if (blob.size > BYTES_MAX) {
          setProblema('Esse áudio ficou grande demais. Grave um mais curto.');
          return;
        }
        await onEnviarMidia('audio', blob, gravador.mimeType, duracaoMs);
      };

      gravador.start();
      setGravando(true);
      setSegundos(0);
      timerRef.current = setInterval(() => {
        setSegundos((s) => {
          const novo = s + 1;
          // Teto de duração: o envelope tem tamanho, e parar sozinho é melhor
          // que recusar depois de a pessoa ter falado dois minutos à toa.
          if (novo * 1000 >= AUDIO_MAX_MS) pararDeGravar(false);
          return novo;
        });
      }, 1000);
    } catch {
      setProblema('Microfone não liberado.');
    }
  }, [onEnviarMidia, pararDeGravar]);

  if (!aberta) return null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (onEnviarTexto(texto)) {
      setTexto('');
      // Sem isto o campo ficaria alto e vazio depois de uma mensagem longa.
      if (campoRef.current) crescerComOTexto(campoRef.current);
    };
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Conversa com ${nome}`}
      className="fixed inset-0 z-[200] flex items-center justify-center"
    >
      <div
        /*
          O DESFOQUE SO' ONDE HA' GPU SOBRANDO.

          `backdrop-blur` refaz o borrao do que esta' atras a cada quadro em que
          a tela muda — e a tela muda a cada pixel de rolagem. Num telefone,
          borrar a tela inteira sessenta vezes por segundo enquanto a lista
          rola e' exatamente o tipo de trabalho que faz o dedo "sentir peso".
          Em ponteiro grosso (toque) o fundo e' uma cor SOLIDA — opaca de
          verdade, nao 85%: com qualquer transparencia os botoes e o texto de
          tras vazavam pela conversa, e um leve gradiente estatico da' a
          profundidade que o desfoque dava, sem custar nada por quadro
          (gradiente e' pintado uma vez; desfoque e' refeito a cada rolagem).
          No computador (ponteiro fino) o desfoque continua.
        */
        className="absolute inset-0 bg-gradient-to-b from-[#0b1220] via-[#0d1526] to-[#0b1220] [@media(pointer:fine)]:bg-none [@media(pointer:fine)]:bg-slate-950/45 [@media(pointer:fine)]:backdrop-blur-2xl [@media(pointer:fine)]:backdrop-saturate-150"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden
                   bg-white/[0.07] ring-1 ring-white/15 shadow-2xl
                   sm:h-[min(88vh,46rem)] sm:w-[min(92vw,34rem)] sm:rounded-3xl"
      >
        {/* --- Cabeçalho --- */}
        <header className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/90 to-blue-600/90 text-base font-semibold text-white">
              {nome.charAt(0).toUpperCase()}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-slate-900 ${
                online ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            />
          </div>

          {/*
            O NOME ABRE O PERFIL. E' onde a pessoa procura quando quer saber com
            quem esta falando — e ate' agora era so' texto.
          */}
          <button
            type="button"
            onClick={() => onVerPerfil?.(nome)}
            disabled={!onVerPerfil}
            className="min-w-0 flex-1 text-left disabled:cursor-default"
          >
            <p className="truncate text-[15px] font-semibold text-white">@{nome}</p>
            {/*
              O "digitando…" TOMA O LUGAR do estado de presença em vez de
              aparecer ao lado dele. Quem está escrevendo está online — dizer
              as duas coisas gastaria uma linha para repetir uma delas.
            */}
            {/*
              TRES COISAS DISPUTAM ESTA LINHA, e a ordem nao e' arbitraria.

              "Digitando" ganha de tudo: e' o que esta acontecendo agora.
              Depois vem a origem, que e' o que situa a conversa. O estado de
              presenca fica por ultimo — e nao se perde: ele continua no ponto
              colorido ao lado da foto, que e' onde todo aplicativo de conversa
              o coloca.

              Uma linha so', de proposito: o cabecalho ja' e' alto no celular.
            */}
            {digitando ? (
              <p className="truncate text-xs text-cyan-300">
                digitando<span className="inline-block animate-pulse">…</span>
              </p>
            ) : origem ? (
              <p className="truncate text-xs text-white/45">
                Este contato é de {origem}
              </p>
            ) : (
              <p className="truncate text-xs text-white/45">
                {online ? 'online agora' : 'offline — vai receber quando voltar'}
              </p>
            )}
          </button>

          {onChamarVideo && (
            <button
              type="button"
              onClick={onChamarVideo}
              disabled={!online}
              title={online ? 'Chamar em vídeo' : 'Só dá para chamar quem está online'}
              aria-label="Chamar em vídeo"
              className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-white/20 disabled:hover:bg-transparent"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 3.5V7z" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={onFechar}
            title="Fechar (Esc)"
            aria-label="Fechar conversa"
            className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* --- Vídeo da chamada --- */}
        {(videoRemoto || videoLocal) && (
          <div className="relative bg-black/60">
            <video ref={videoRemotoRef} autoPlay playsInline className="max-h-52 w-full object-contain" />
            {videoLocal && (
              <video
                ref={videoLocalRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-2 right-2 w-24 rounded-xl ring-1 ring-white/25"
              />
            )}
          </div>
        )}

        {/* --- Mensagens --- */}
        <div className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 py-3">
          <p className="mx-auto max-w-sm rounded-2xl bg-black/25 px-3 py-2 text-center text-[11px] leading-relaxed text-white/45">
            A conversa fica guardada na sua conta, cifrada, e aparece em
            qualquer aparelho onde você entrar.
          </p>

          {mensagens.length === 0 && (
            <p className="py-8 text-center text-sm text-white/35">
              Nenhuma mensagem ainda. Escreva a primeira —{' '}
              {online ? 'ela chega agora.' : 'ela espera essa pessoa voltar.'}
            </p>
          )}

          {mensagens.map((m, i) => {
            const minha = m.de === 'eu';
            const anterior = mensagens[i - 1];
            const trocouODia =
              !anterior ||
              new Date(anterior.quando).toDateString() !==
                new Date(m.quando).toDateString();

            return (
              <React.Fragment key={m.id}>
                {trocouODia && (
                  <p className="py-1 text-center text-[10px] uppercase tracking-wide text-white/30">
                    {dia(m.quando)}
                  </p>
                )}
                <div className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`min-w-0 max-w-[82%] px-1.5 py-1.5 text-[15px] leading-snug shadow-sm ${
                      minha
                        ? 'rounded-2xl rounded-br-md bg-cyan-600/90 text-white'
                        : 'rounded-2xl rounded-bl-md bg-white/[0.13] text-white/95'
                    }`}
                  >
                    {m.tipo === 'texto' && (
                      <p className="whitespace-pre-wrap break-words px-1.5">{m.texto}</p>
                    )}

                    {m.tipo === 'imagem' && m.midiaUrl && (
                      <button
                        type="button"
                        onClick={() => setAmpliada(m.midiaUrl!)}
                        className="block max-w-full"
                        title="Ver maior"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {/*
                          `loading="lazy"`: a foto de uma mensagem antiga so' e'
                          baixada quando a rolagem chega perto dela — nao todas de
                          uma vez ao abrir a conversa. `decoding="async"`: a
                          decodificacao nao trava a rolagem; e' o que evita o
                          "aparece em branco e depois estoura" ao rolar para tras.
                        */}
                        <img
                          src={m.midiaUrl}
                          alt="foto da conversa"
                          loading="lazy"
                          decoding="async"
                          /*
                            `max-w-full h-auto`: a foto limitada so' na altura
                            (1600px virava 384px de largura) passava da bolha e
                            da TELA — no celular de 375px, o botao de fechar ia
                            parar fora da vista. A imagem agora cabe na bolha, e
                            a bolha cabe na tela.
                          */
                          className="max-h-72 max-w-full h-auto rounded-xl"
                        />
                      </button>
                    )}

                    {m.tipo === 'video' && m.midiaUrl && (
                      <video
                        src={m.midiaUrl}
                        controls
                        playsInline
                        // Sem `preload="none"`, cada video da conversa baixava o
                        // cabecalho ao aparecer na tela. A duracao ja' vem na mensagem.
                        preload="none"
                        className="max-h-72 max-w-full rounded-xl"
                      />
                    )}

                    {m.tipo === 'audio' && m.midiaUrl && (
                      <div className="flex items-center gap-2 px-1">
                        <audio
                          src={m.midiaUrl}
                          controls
                          preload="none"
                          className="h-10 max-w-[13rem]"
                        />
                        {m.duracaoMs ? (
                          <span className="text-[11px] text-white/60">
                            {duracaoLegivel(m.duracaoMs)}
                          </span>
                        ) : null}
                      </div>
                    )}

                    {m.tipo === 'documento' && (
                      /*
                        O DOCUMENTO E' UM CARTAO, e nao uma previa: nao da' para
                        mostrar por dentro um .docx ou um .zip, e tentar seria
                        pior que nao tentar. O que a pessoa precisa para decidir
                        se abre e' o nome e o tamanho.

                        `download` com o nome original: o objeto no armazenamento
                        se chama por 24 bytes sorteados, entao sem isto o arquivo
                        chegaria na pasta de downloads sem nome nenhum.
                      */
                      <a
                        href={m.midiaUrl ?? '#'}
                        download={m.nome ?? 'arquivo'}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${
                          m.midiaUrl ? 'hover:bg-white/10' : 'pointer-events-none opacity-50'
                        }`}
                      >
                        <span className="shrink-0 rounded-lg bg-white/15 p-2.5 text-sky-200">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                            <path d="M14 3v5h5" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[11rem] truncate text-sm text-white">
                            {m.nome ?? 'arquivo'}
                          </span>
                          <span className="block text-[11px] text-white/50">
                            {m.bytes ? tamanhoLegivel(m.bytes) : 'toque para abrir'}
                          </span>
                        </span>
                      </a>
                    )}

                    <div className="mt-0.5 flex items-center justify-end gap-1 px-1.5 text-[10px] text-white/50">
                      <span>{hora(m.quando)}</span>
                      {minha && <Recibo estado={m.entrega} />}
                    </div>

                    {m.entrega === 'falhou' && (
                      <p className="px-1.5 pb-1 text-[11px] text-red-200">
                        {ERRO_EM_PORTUGUES[m.erro ?? ''] ?? 'Não foi enviada.'}
                      </p>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/*
            A BOLHA DE "DIGITANDO", no fim da conversa.
            O aviso ja aparecia no cabecalho, mas o cabecalho fica longe de
            onde os olhos estao: quem espera resposta olha para a ultima
            mensagem. Aqui ele aparece no lugar onde a resposta vai nascer, com
            a forma da bolha de quem esta escrevendo — e por isso empurra a
            conversa para baixo, levando a rolagem junto.
          */}
          {digitando && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-3 ring-1 ring-white/10">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
              </div>
            </div>
          )}

          <div ref={fim} />
        </div>

        {/* --- Denúncia --- */}
        {pedindoMotivo ? (
          <div className="space-y-2 border-t border-white/10 px-4 py-3">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="O que aconteceu?"
              maxLength={300}
              autoFocus
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-cyan-400/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onDenunciar(motivo || 'sem descrição');
                  setPedindoMotivo(false);
                  setMotivo('');
                }}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Denunciar e sair
              </button>
              <button
                type="button"
                onClick={() => setPedindoMotivo(false)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={enviar}
            className="border-t border-white/10 bg-white/[0.04] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
          >
            {/* O convite de avisos vive aqui: colado na conversa, que e' onde
                a pergunta "quer saber quando responderem?" se explica. */}
            <ConviteDeAvisos visivel={aberta && !gravando} />

            {gravando ? (
              <div className="flex items-center gap-3 rounded-2xl bg-red-500/15 px-4 py-2.5 ring-1 ring-red-400/30">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
                <span className="flex-1 text-sm text-white">
                  Gravando… {duracaoLegivel(segundos * 1000)}
                </span>
                <button
                  type="button"
                  onClick={() => pararDeGravar(true)}
                  className="text-sm text-white/60 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => pararDeGravar(false)}
                  className="rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-cyan-500"
                >
                  Enviar
                </button>
              </div>
            ) : (
              <>
                {/*
                  A GAVETA DE ANEXOS.
                  Tres coisas atras de um clipe, em vez de tres icones sempre na
                  barra: o campo de texto e' o que a pessoa usa o tempo todo, e
                  cada icone ao lado dele roubava largura de escrever. Abre por
                  cima, some ao escolher ou ao tocar fora.
                */}
                {anexosAbertos && (
                  <div
                    className="absolute inset-0 z-10"
                    onClick={() => setAnexosAbertos(false)}
                    aria-hidden="true"
                  />
                )}

                <div className="relative">
                  {anexosAbertos && (
                    <div
                      className="absolute bottom-full left-0 z-20 mb-2 flex gap-2 rounded-2xl
                                 bg-slate-900/95 p-2 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
                    >
                      <Anexo titulo="Foto" cor="text-violet-300" accept="image/*" onChange={escolherFoto}>
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <circle cx="8.5" cy="10" r="1.5" />
                        <path d="M21 16l-5-5-4 4-2-2-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </Anexo>

                      <Anexo titulo="Vídeo" cor="text-rose-300" accept="video/*" onChange={escolherVideo}>
                        <path
                          d="M15 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3.5l6 3.5V7z"
                          strokeLinejoin="round"
                        />
                      </Anexo>

                      <Anexo
                        titulo="Documento"
                        cor="text-sky-300"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip,application/pdf,text/plain"
                        onChange={escolherDocumento}
                      >
                        <path
                          d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
                          strokeLinejoin="round"
                        />
                        <path d="M14 3v5h5" strokeLinejoin="round" />
                      </Anexo>
                    </div>
                  )}

                  <div className="flex items-end gap-1.5">
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => setAnexosAbertos((v) => !v)}
                      title="Anexar"
                      aria-label="Anexar arquivo"
                      className={`shrink-0 rounded-full p-2 transition-colors ${
                        anexosAbertos
                          ? 'bg-white/15 text-white'
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path
                          d="M21.4 11.05 12.25 20.2a5.5 5.5 0 1 1-7.78-7.78l9.2-9.2a3.67 3.67 0 0 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 0 1-2.6-2.6l8.5-8.48"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {/*
                      A CAMERA E' SEPARADA DA GAVETA de proposito: no celular,
                      `capture` abre a camera direto, sem passar pela galeria.
                      E' o gesto mais curto que existe para mandar o que se esta
                      vendo agora, e esconde-lo atras de um menu o encareceria.
                    */}
                    <label
                      className="shrink-0 cursor-pointer rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      title="Tirar foto"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path
                          d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-2h8.4l1.1 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"
                          strokeLinejoin="round"
                        />
                        <circle cx="12" cy="13" r="3.4" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={escolherFoto}
                        className="hidden"
                      />
                    </label>

                    <textarea
                      ref={campoRef}
                      value={texto}
                      onChange={(e) => {
                        setTexto(e.target.value);
                        if (e.target.value) onDigitando?.();
                        crescerComOTexto(e.target);
                      }}
                      onKeyDown={(e) => {
                        // Enter manda; Shift+Enter pula linha. Sem isto, um
                        // campo de varias linhas nao teria como enviar pelo
                        // teclado — e o teclado do celular mostra "enviar".
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          enviar(e);
                        }
                      }}
                      rows={1}
                      placeholder="Mensagem"
                      maxLength={4000}
                      enterKeyHint="send"
                      /*
                        SEM `scrollIntoView` AQUI.
                        Havia um `setTimeout` de 300 ms seguido de rolagem
                        animada a cada toque no campo — era esse o "peso ao
                        clicar para digitar". O navegador ja' traz o campo
                        focado para a vista sozinho; o que o codigo acrescentava
                        era so' a espera.
                      */
                      className="min-h-[2.6rem] min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl bg-white/10
                                 px-3.5 py-2 text-[16px] leading-snug text-white placeholder-white/40
                                 outline-none ring-1 ring-white/10 focus:ring-cyan-400/50"
                    />

                    {/*
                      MICROFONE OU ENVIAR, nunca os dois: com o campo vazio nao
                      ha' o que enviar, e escrevendo nao se esta gravando. E' a
                      troca que todo aplicativo de conversa faz, e ela devolve
                      largura ao campo.
                    */}
                    {texto.trim() ? (
                      <button
                        type="submit"
                        onPointerDown={(e) => e.preventDefault()}
                        title="Enviar"
                        aria-label="Enviar mensagem"
                        className="shrink-0 rounded-full bg-cyan-600 p-2.5 text-white transition-colors hover:bg-cyan-500"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 12l16-8-6 16-2.5-6.5z" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={comecarAGravar}
                        title="Gravar áudio"
                        aria-label="Gravar áudio"
                        className="shrink-0 rounded-full bg-white/10 p-2.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="9" y="3" width="6" height="11" rx="3" />
                          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {preparando && (
              <p className="mt-2 text-center text-xs text-cyan-200/80">{preparando}</p>
            )}
            {problema && (
              <p className="mt-2 text-center text-xs text-red-300">{problema}</p>
            )}

            <div className="mt-2 flex justify-center gap-4 text-[11px]">
              <button
                type="button"
                onClick={() => setPedindoMotivo(true)}
                className="text-red-300/70 hover:text-red-200"
              >
                Denunciar
              </button>
              <button
                type="button"
                onClick={onBloquear}
                className="text-white/40 hover:text-white/70"
              >
                Bloquear
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Foto ampliada. Fecha com Esc ou clique, como qualquer visualizador. */}
      {ampliada && (
        <div
          className="absolute inset-0 z-[220] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setAmpliada(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada} alt="foto ampliada" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
};

export default ChatOverlay;
