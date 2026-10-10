# Pausa — como este projeto para, e como ele volta

Escrito em **10 de outubro de 2026**, no dia em que o projeto foi arquivado.

Quando você disser **"sobe"**, este arquivo é a resposta. Ele existe porque
daqui a três meses nem você nem eu vamos lembrar qual chave desliga o quê — e
um projeto que não se sabe religar está morto, não pausado.

---

## 1. O que este projeto é

**Meu Globo Interativo** — uma rede social de **notícias** e de **viagem**,
construída sobre um globo 3D. A aposta: informação as pessoas querem a todo
momento, e isso é barato de servir.

O que ele faz hoje, funcionando e testado:

- publicar **notícia** com foto ou vídeo, com alcance de **cidade, estado,
  país ou o mundo todo** — e a do mundo atravessa a fronteira de verdade
- uma **linha do tempo vertical** em tela cheia, com som, que abre na aba
  **Notícias**
- mural de 24 horas, curtir, comentar, responder, seguir pessoas e lugares
- moderação com fila, denúncia e restauração
- perfil, privacidade, grade de fotos e vídeos
- **237 testes automatizados**, todos passando

---

## 2. O QUE NÃO PODE SER APAGADO — leia antes de mexer

Três serviços guardam coisa que não volta:

| Serviço | O que guarda | Custo parado | O que fazer |
|---|---|---|---|
| **Neon** (`mute-lake-12189112`, `globo-3d`) | **O banco inteiro** — contas, notícias, posts, comentários | ~zero: 35 MB e o compute dorme sozinho | **Deixe de pé.** Não apague. |
| **Cloudflare R2** | **Todas as fotos e vídeos** publicados | centavos por mês | **Deixe de pé.** Não apague o bucket. |
| **Fly.io** (`globo-realtime`) | nada — só o processo do socket | **é o único que custa ligado** | `fly scale count 0` |

Apagar o Neon ou o R2 economiza praticamente **nada** e perde **tudo**. O único
que vale desligar é o Fly, porque é o único que cobra por estar de pé.

---

## 3. O que foi desligado nesta pausa

### a) O tempo real (conversa, presença, sinais) — desligado por interruptor

Arquivo: **`lib/realtime/interruptor.ts`**

```ts
export const CHAT_LIGADO = false;
```

**Nada foi removido.** O servidor em `realtime/`, o protocolo, as telas de
conversa, a presença no globo, os sinais — tudo inteiro, compilando, e coberto
pelos 237 testes, que continuam passando porque falam com o servidor
diretamente. O que mudou: o aplicativo não ABRE a conexão e não OFERECE as
telas que dependem dela.

Com ele desligado, o menu do globo mostra: Linha do tempo, Meu perfil, Soltar
no globo, Notícias, Planejar viagem, Bagagem, Anunciar. Somem: Conversas, Quem
quer falar, Procurar (busca por nickname viaja no socket) e Acender sinal.

**Por que valeu a pena:** o tempo real era a única parte que custava dinheiro
**parada** — um processo ligado 24 horas, mesmo numa madrugada sem ninguém. E
havia um agravante medido: a conexão abria para **todo visitante** assim que o
globo carregava, antes de qualquer conversa. Numa rede de notícias quase todo
mundo só lê.

### b) O site, fora do ar

Vercel pausado (projeto `globo-3d`, time `brunu aurelius 's projects`).
Código, variáveis de ambiente e histórico de deploy **permanecem**.

---

## 4. COMO SUBIR DE VOLTA

Na ordem. Leva uns dez minutos.

### Só as notícias (sem conversa) — o estado mais barato

1. **Vercel** → projeto `globo-3d` → Settings → despausar o projeto
2. Confirmar que **Production Branch** é `globo/lod-luzes-fronteiras`
3. Deploy:
   ```
   npx vercel --prod --yes
   ```
4. Conferir que subiu: `POST /api/erro-do-cliente` tem de responder `{"ok":true}`
   (essa rota só existe a partir do commit `cdc1d4a`)

Neon e R2 não precisam de nada: o Neon acorda na primeira consulta.

### Com a conversa de volta

5. `lib/realtime/interruptor.ts` → `CHAT_LIGADO = true`
6. `fly scale count 1 -a globo-realtime` (confirmar o nome do app com `fly apps list`)
7. Conferir que `NEXT_PUBLIC_REALTIME_URL` aponta para o Fly e que o
   `CORS_ORIGIN` do Fly inclui o domínio do site
8. Rodar a suíte:
   ```
   npm run testes -- --base=https://globo-3d-ten.vercel.app
   ```

---

## 5. O que estava na fila quando parou

Em ordem de valor, e com a razão:

1. **Socket preguiçoso** — conectar só quando a conversa abre, não ao carregar
   o globo. (A pausa resolveu isto por tabela, mas quando o chat voltar o
   problema volta junto se for ligado do jeito antigo.)
2. **Cache na borda do feed mundial** — não há **nenhum** `Cache-Control` em
   `/api/posts` nem em `/api/noticias`, e a aba Notícias devolve os mesmos
   bytes para todo mundo. `s-maxage=30, stale-while-revalidate=300` transforma
   dez mil leitores em ~2 consultas por minuto. **Pegadinha:** o campo
   `euCurti` é por pessoa e impede o cache — tem de sair do corpo cacheado e
   virar um pedido separado.
3. **Domínio próprio no R2** — o `r2.dev` é documentado pela Cloudflare como
   **não sendo para produção**: tem limite de requisições, devolve 429 quando
   estoura e não dá para configurar cache. Domínio próprio = CDN inteiro com
   **egresso zero**, que é o que torna vídeo viável.
4. **Branch do Neon para desenvolvimento** — hoje o `.env.local` aponta para o
   banco de **produção**. Publicações de teste feitas no localhost caem no feed
   real (aconteceu, foram apagadas). Um branch do Neon resolve de graça.
5. **A falha da aba Mundo** — relatada, nunca reproduzida. Agora existe
   `app/error.tsx`: quando acontecer, a tela mostra a mensagem e o código, e o
   relato chega aos registros do Vercel por `/api/erro-do-cliente`. **É a
   primeira coisa a olhar quando voltar.**
6. **API de preços de voo** — recomendação: **Travelpayouts** (dados do
   Aviasales). Grátis, exige cadastro de afiliado, paga comissão em vez de
   cobrar por chamada, devolve preço em cache — perfeito para um selo "a partir
   de R$ X" no globo. A busca ao vivo do Aviasales só libera com 50 mil
   usuários/mês, então o desenho certo é tabela de preços no Postgres + rotina
   diária + globo lendo só do banco. **Falta você criar a conta de afiliado** —
   isso eu não posso fazer por você.
7. Da `PLANO.md`: perfil em tela inteira, configurações num lugar só, filtro de
   países ("moro no Brasil, quero ver só a Rússia"), repostar, compartilhar.

---

## 6. Dívidas que precisam sumir ANTES de gente de verdade entrar

- **Tokens colados no histórico de conversa precisam ser rotacionados**:
  Google (client secret), Vercel, três do Railway.
- **Contas de teste viveram no banco de produção.** A faxina limpa
  (`npm run testes -- --faxina`), mas as senhas de teste ficaram **dois dias
  públicas no histórico do git** — essas contas precisam de senha nova ou de
  serem apagadas.
- **311 MB de texturas não usadas** no repositório.
- O R2 é **publicamente legível** pelo `r2.dev` — foi escolha sua, consciente,
  depois de eu apresentar o custo e o benefício.

---

## 7. Onde está cada coisa

| | |
|---|---|
| Código | `github.com/johnQuest01/GLOBO-3D`, branch `globo/lod-luzes-fronteiras` |
| Site | `globo-3d-ten.vercel.app` (Vercel, projeto `globo-3d`) |
| Banco | Neon, projeto `globo-3d` (`mute-lake-12189112`), região `sa-east-1` |
| Mídia | Cloudflare R2, servido hoje por `pub-6c5cd0df…r2.dev` |
| Tempo real | Fly.io, `globo-realtime` |
| Plano antigo | `PLANO.md` |
| Testes | `npm run testes -- --base=<url>` · faxina: `--faxina` |
