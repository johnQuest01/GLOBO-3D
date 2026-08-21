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
