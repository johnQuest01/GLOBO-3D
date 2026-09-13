/**
 * Um aparelho de mentira, ligado no servidor de tempo real de verdade.
 *
 * DOIS APARELHOS DA MESMA CONTA É O CASO QUE MAIS IMPORTA AQUI. Metade dos
 * defeitos que este projeto já teve em conversa não aparecia com duas pessoas:
 * aparecia quando a MESMA pessoa abria o celular e o computador. A mensagem
 * mandada de um não existia no outro; a lida num voltava a ser não lida no
 * outro. Por isso a classe se chama Aparelho e não Usuario — o token é da
 * conta, a conexão é do aparelho, e a distinção é o objeto do teste.
 *
 * TUDO O QUE CHEGA É GUARDADO, e nada é descartado depois de conferido. Um
 * teste de conversa precisa poder perguntar "isto chegou DUAS vezes?" e "isto
 * NÃO chegou?", e as duas perguntas exigem o registro inteiro.
 */

import { io, type Socket } from "socket.io-client";

import type { Conta } from "./cliente";

export interface Recebido {
  evento: string;
  dados: unknown;
  quando: number;
}

export class Aparelho {
  private socket: Socket | null = null;
  readonly recebido: Recebido[] = [];

  constructor(
    readonly urlRealtime: string,
    readonly conta: Conta,
    readonly apelido: string,
  ) {}

  /** Pega o crachá no app Next e abre a conexão. Falha alto, e não em silêncio. */
  async ligar(): Promise<void> {
    const r = await this.conta.get<{
      ok: boolean;
      token?: string;
      reason?: string;
    }>("/api/realtime/token");
    if (r.status !== 200 || !r.corpo.token) {
      throw new Error(
        `${this.apelido}: sem cracha de realtime (${r.status} ${r.corpo.reason ?? ""})`,
      );
    }

    /*
     * TRINTA SEGUNDOS, e o número tem história.
     *
     * Eram quinze, e a suíte de estresse passou muitas vezes assim — mas só
     * quando rodava sozinha. Rodando DEPOIS das outras oito, uma conexão entre
     * as 64 estourava o prazo, sempre uma diferente. Medido: as mesmas 64
     * sobem em 1,1 segundo com o processo limpo (pior caso 1063 ms), e uma
     * conexão isolada leva 735 ms.
     *
     * Ou seja: o servidor dá conta, e o que estourava era o PROCESSO DE TESTE
     * depois de umas quinhentas requisições — o agente HTTPS do Node e o limite
     * de rajada do lado da Vercel. O prazo aqui existe para pegar travamento,
     * não para afirmar latência; encurtá-lo só transformava a suíte numa moeda
     * jogada para o alto, e uma suíte que falha ao acaso ensina a ignorá-la.
     */
    const socket = io(this.urlRealtime, {
      auth: { token: r.corpo.token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 30000,
    });
    this.socket = socket;

    // `onAny` só pega eventos nomeados; connect_error não é um deles.
    socket.onAny((evento: string, dados: unknown) => {
      this.recebido.push({ evento, dados, quando: Date.now() });
    });

    await new Promise<void>((resolve, reject) => {
      const prazo = setTimeout(
        () => reject(new Error(`${this.apelido}: nao conectou em 15s`)),
        15000,
      );
      socket.on("connect", () => {
        clearTimeout(prazo);
        resolve();
      });
      socket.on("connect_error", (e: Error) => {
        clearTimeout(prazo);
        reject(new Error(`${this.apelido}: ${e.message}`));
      });
    });
  }

  get id(): string {
    if (!this.socket?.id) throw new Error(`${this.apelido}: sem conexao`);
    return this.socket.id;
  }

  get ligado(): boolean {
    return this.socket?.connected ?? false;
  }

  emitir(evento: string, dados?: unknown): void {
    if (!this.socket) throw new Error(`${this.apelido}: sem conexao`);
    this.socket.emit(evento, dados);
  }

  /** Tudo que chegou com esse nome, na ordem. */
  todos<T = Record<string, unknown>>(evento: string): T[] {
    return this.recebido
      .filter((r) => r.evento === evento)
      .map((r) => r.dados as T);
  }

  ultimo<T = Record<string, unknown>>(evento: string): T | null {
    const lista = this.todos<T>(evento);
    return lista.length ? lista[lista.length - 1]! : null;
  }

  quantos(evento: string): number {
    return this.todos(evento).length;
  }

  /** Apaga o registro. Serve para "a partir daqui, o que chega?". */
  esquecer(): void {
    this.recebido.length = 0;
  }

  desligar(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}
