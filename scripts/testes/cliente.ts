/**
 * Um navegador de mentira: guarda cookie e fala JSON.
 *
 * POR QUE NÃO CHAMAR AS FUNÇÕES DIRETO. `lib/db/perfil.ts` sabe podar um perfil
 * pela visibilidade, mas quem decide se você pode pedir aquele perfil é a rota,
 * e quem diz quem é você é o cookie de sessão. Testar a função sozinha prova
 * que a poda funciona e não prova nada sobre quem consegue chegar até ela — que
 * é a metade que importa quando o assunto é o que os outros veem de você.
 *
 * O COOKIE É GUARDADO POR CONTA, e não globalmente: quase todo teste
 * interessante aqui precisa de duas pessoas ao mesmo tempo (quem manda e quem
 * recebe, quem olha o perfil e o dono dele). Com um jarro só, a segunda
 * autenticação derrubaria a primeira e os testes passariam a conversar consigo
 * mesmos.
 */

export interface Resposta<T = Record<string, unknown>> {
  status: number;
  corpo: T;
  /** Para medir o que o aplicativo demora de verdade, não o que ele promete. */
  ms: number;
}

export class Conta {
  private cookies = new Map<string, string>();

  constructor(
    readonly base: string,
    readonly apelido: string,
  ) {}

  get logada(): boolean {
    return this.cookies.size > 0;
  }

  private guardarCookies(r: Response): void {
    // `getSetCookie` existe no Node 20+; é o único jeito de ler VÁRIOS
    // Set-Cookie, e o login manda mais de um (sessão e cache assinado).
    const crus =
      (
        r.headers as unknown as { getSetCookie?: () => string[] }
      ).getSetCookie?.() ?? [];
    for (const cru of crus) {
      const [par] = cru.split(";");
      const i = par!.indexOf("=");
      if (i <= 0) continue;
      const nome = par!.slice(0, i).trim();
      const valor = par!.slice(i + 1).trim();
      // Cookie apagado pelo servidor (logout) some do jarro também.
      if (valor === "" || /expires=Thu, 01 Jan 1970/i.test(cru))
        this.cookies.delete(nome);
      else this.cookies.set(nome, valor);
    }
  }

  async pedir<T = Record<string, unknown>>(
    metodo: "GET" | "POST" | "DELETE",
    caminho: string,
    corpo?: unknown,
  ): Promise<Resposta<T>> {
    const cabecalhos: Record<string, string> = {};
    if (this.cookies.size > 0) {
      cabecalhos.cookie = [...this.cookies]
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }
    if (corpo !== undefined) cabecalhos["content-type"] = "application/json";

    const comecou = Date.now();
    const r = await fetch(`${this.base}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      redirect: "manual",
    });
    const ms = Date.now() - comecou;

    this.guardarCookies(r);

    const texto = await r.text();
    let json: unknown = {};
    try {
      json = texto ? JSON.parse(texto) : {};
    } catch {
      // Uma resposta que não é JSON é informação: quase sempre é a página de
      // erro do Next, e o texto dela diz o que aconteceu melhor que "falhou".
      json = { naoEraJson: texto.slice(0, 400) };
    }
    return { status: r.status, corpo: json as T, ms };
  }

  get = <T = Record<string, unknown>>(c: string) => this.pedir<T>("GET", c);
  post = <T = Record<string, unknown>>(c: string, b?: unknown) =>
    this.pedir<T>("POST", c, b);
  apagar = <T = Record<string, unknown>>(c: string) =>
    this.pedir<T>("DELETE", c);
}
