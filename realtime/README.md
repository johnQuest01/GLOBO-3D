# globo-realtime

Servidor de presença, beacons e sinalização WebRTC do GLOBO-3D.

**Isto não é parte do app Next.** É um processo Node always-on, com
`package.json` próprio, feito para rodar no Railway. Função serverless não
segura conexão aberta — Socket.io precisa de um processo vivo, com o socket de
pé. Por isso nada disto pode morar em `app/api/*`.

## O que ele faz e o que ele não faz

Faz: presença por região, beacons, apresentação de dois peers e **repasse** de
sinalização (SDP/ICE).

Não faz: ver conteúdo de conversa. Texto, imagem e vídeo vão direto de
navegador para navegador por WebRTC. Aqui passa só o aperto de mão, e o campo
`data` do evento `signal` é repassado sem ser inspecionado.

O chat privado é **efêmero por design**: não existe gravação no Neon. O que é
persistido no projeto é outra coisa (comportamento/afinidade), e fica onde
está.

## Rodar local

```bash
cd realtime
npm install
cp .env.example .env      # opcional: sem REDIS_URL, a presenca fica em memoria
npm run dev
```

Em outros dois terminais, o cliente de teste:

```bash
npm run probe -- --name Ana
npm run probe -- --name Bruno
```

Os dois entram na mesma região (`são paulo` por padrão) e cada um deve ver o
outro no `snapshot`/`update`. Feche um com Ctrl+C e o outro recebe
`presence:update: leave`. Para testar regiões diferentes:

```bash
npm run probe -- --name Ana --region "minas gerais" --lat -19.9 --lon -43.9
```

Com Redis local (opcional, mas é o alvo de produção):

```bash
docker run -p 6379:6379 redis:7-alpine
# e no .env:  REDIS_URL=redis://localhost:6379
```

## Estado atual

Fase 1 implementa **presença**: `presence:join`, `presence:heartbeat`,
`presence:leave` → `presence:snapshot`, `presence:update`, `error`.

Beacons, matchmaking e sinalização já estão declarados em
[`shared/protocol.ts`](shared/protocol.ts) — a fonte da verdade do contrato,
importada pelos dois lados — mas ainda **sem implementação**. Entram nas fases
seguintes.

## Variáveis

Ver [`.env.example`](.env.example). Duas merecem atenção:

- **`CORS_ORIGIN`** — sem ela, qualquer site abre socket contra este servidor em
  nome do seu usuário. Em produção, aponte para a URL da Vercel.
- **`REDIS_URL`** — no Railway use a URL **privada** (`redis.railway.internal`).
  A pública sai para a internet e cobra egress a cada heartbeat. Em produção,
  ausente, o servidor **recusa subir**: cair para memória com duas instâncias
  faria metade das pessoas ficar invisível para a outra metade, sem erro nenhum
  aparecer.

O deploy no Railway e a configuração de STUN/TURN estão na Fase 7.

---

## Deploy no Railway (Fase 7)

Dois serviços no MESMO projeto do Railway, e isso não é detalhe: o servidor
conversa com o Redis o tempo todo — heartbeat de presença a cada 15s por
pessoa, mais o pub/sub do adapter a cada evento. No mesmo projeto eles falam
por rede privada; separados, cada operação atravessa a internet pública com
TLS e o Redis fica exposto.

### 1. Redis

*New → Database → Redis*. Copie a URL **privada**
(`redis://default:...@redis.railway.internal:6379`). A pública sai para a
internet e cobra egress a cada batida de heartbeat.

### 2. O servidor

*New → GitHub Repo* → este repositório, e então:

| campo | valor |
|---|---|
| Root Directory | `realtime` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Variáveis:

```
REDIS_URL   = ${{Redis.REDIS_PRIVATE_URL}}   # referência ao outro serviço
CORS_ORIGIN = https://globo-3d-ten.vercel.app,https://meu-globo.fly.dev
STUN_URL    = stun:stun.l.google.com:19302
TURN_URL    = turn:SEU-TURN:3478
TURN_USER   = ...
TURN_CRED   = ...
NODE_ENV    = production
```

`PORT` o Railway injeta sozinho. **Sem `REDIS_URL`, o servidor recusa subir** —
cair para memória com duas instâncias faria metade das pessoas ficar invisível
para a outra metade, sem erro nenhum aparecer.

### 3. O front

Na Vercel e no Fly, aponte para o servidor:

```
NEXT_PUBLIC_REALTIME_URL = https://SEU-SERVICO.up.railway.app
```

Sem essa variável, nada de realtime aparece na interface e o globo funciona
exatamente como antes. É proposital: o recurso é opcional, não um requisito
para o app subir.

## Por que Railway e não Fly (para ESTE serviço)

O app Next continua no Fly e na Vercel. O que não pode ir para o Fly com a
configuração atual é o servidor de socket: o `fly.toml` do projeto tem

```toml
auto_stop_machines = 'stop'
min_machines_running = 0
```

A máquina dorme quando fica ociosa. Para o Next isso é ótimo; para Socket.io é
fatal — dormir **derruba todas as conexões WebSocket** e apaga a presença.
Seria preciso `min_machines_running = 1`, ou seja, pagar always-on de qualquer
forma, e ainda por cima com o Redis do outro lado da internet.

## TURN: não é opcional em produção

STUN só descobre o endereço público de cada lado; ele **não** carrega mídia.
Quando os dois lados estão atrás de NAT que não permite conexão direta — o caso
comum em rede de celular com CGNAT — é o TURN que retransmite os pacotes.

Sem TURN, o sintoma é um chat que "às vezes não conecta", tipicamente entre dois
celulares em operadoras diferentes. O servidor avisa no console quando sobe sem
`TURN_URL`, e o front avisa na tela quando recebe uma lista de ICE vazia.

Opções: coturn próprio (mais barato em volume, exige um servidor com IP
público) ou serviço gerenciado (Metered, Twilio, Cloudflare Calls).

## O que roda hoje

| fase | estado |
|---|---|
| 1 — presença | pronta e verificada com dois clientes |
| 2 — beacons com TTL | pronta e verificada |
| 3 — aperto de mão + relay | pronta e verificada |
| 4 — texto P2P + arco | código pronto; o WebRTC em si só um navegador prova |
| 5 — imagem e vídeo | código pronto; idem |
| 6 — limite, bloqueio, denúncia | pronta e verificada |
| 7 — TURN e deploy | documentado aqui; falta você criar o serviço |

Verificação local: `npm run test:store` (14 checagens da lógica do store) e os
cenários com `npm run probe` descritos no topo deste arquivo.
