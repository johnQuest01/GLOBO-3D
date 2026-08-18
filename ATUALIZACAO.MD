# Pedidos do projeto — memória de trabalho

Organizado para não misturar os problemas. Tratar **um tema por vez**.

## Feito

- Login / cadastro: o campo de e-mail aceita `@` e um e-mail completo (ex: `nome@gmail.com`).

## Feito — nomes no globo (LOD, estilo Google Earth)

País, estado e cidade entram na **mesma fila**: o que encostar no outro some. Longe = países (Ucrânia, Rússia, África). Zoom = estados. Mais zoom = cidades, e os nomes que não cabem saem.

O que estava errado:

- Nomes de continente, país, estado/província (e no futuro cidade) apareciam juntos e **se sobrepunham**.
- Ficava impossível clicar no nome certo para abrir notícias daquele local.
- Uma allowlist antiga só mostrava estados do Brasil e dos EUA, e no máximo 5 nomes.
- O app buscava tiles de estado de **todos** os países na face do globo, mesmo com zoom longe — isso causava gargalo.

Regra correta (não esquecer):

1. **Só renderiza o que está na visão** (frente da câmera / frustum). Não desenha o outro lado do planeta.
2. **Uma fila só, disputando espaço na tela** (não é "uma camada por zoom"). O zoom muda quem tem prioridade:
   - Longe → países
   - Aproximando → estados / províncias entram e os países cedem espaço
   - Perto → cidades entram (maiores primeiro)
   - Mais perto → mais cidades locais entram e os nomes que não cabem somem
3. **Anti-colisão**: a colisão é o retângulo do texto na tela, não o ponto central. Se dois nomes se tocam, fica só o de maior prioridade.
4. **Não carregar o mundo inteiro**: tiles de estado/cidade só quando o zoom pede essa camada, e só dos países visíveis.

### Como ficou (implementação)

O motor de rótulos é `app/lib/globeLabels.ts`; quem orquestra é `components/globe/canvas/GlobeLabels.tsx`.

**Zoom cartográfico.** A câmera 3D vira um número `z` (quantos graus de globo cabem na altura da tela). Cada lugar carrega a faixa `minLabel..maxLabel` em que o nome deve existir — a mesma metainformação que o Google Earth e os atlas usam. Ela vem pronta do Natural Earth, que os arquivos do projeto já traziam sem usar:

| Campo do geojson | Para que serve |
| --- | --- |
| `LABELRANK` / `labelrank` | importância do lugar (1 = mais importante) |
| `MIN_LABEL` / `MAX_LABEL` | em que zoom o nome entra e sai de cena |
| `LABEL_X` / `LABEL_Y` (país) e `latitude`/`longitude` (estado) | onde encostar o texto |
| `NAME_PT` / `name_pt` | nome em português |

É por isso que "Brasil" some quando você entra no estado (`maxLabel` 5.7) e "Belize" não polui a visão do planeta inteiro (`minLabel` 5). As coordenadas escritas à mão no `content.json` continuam tendo prioridade sobre a ancoragem do Natural Earth.

**Colisão em pixel de tela.** A largura do texto é medida na fonte (canvas 2D) e depois corrigida pela largura real que o troika devolve ao desenhar — não é mais estimativa por número de letras. O rótulo tem tamanho fixo em pixels, então a caixa de colisão é exata em qualquer zoom, e menor no celular.

**Nada cortado, nada atrás de botão.** Um nome só entra se couber inteiro na tela e não encostar no cabeçalho, na coluna de botões, no rodapé nem na faixa de anúncio (`uiBlockedRects`).

**Sem piscar.** Quem já está na tela ganha bônus de prioridade e um pouco de folga; quem sai faz fade out em vez de desaparecer de um quadro para o outro. A colocação é refeita a cada quadro em que a câmera se mexe — com o globo parado, custo zero.

**Carregamento sob demanda.** Tiles de estado só a partir de `z ≥ 3.2` e só dos países de frente para a câmera (no máximo 14, com cache por sessão). Cidades só a partir de `z ≥ 4.4`.

Ajustes finos ficam todos em `app/lib/globeLabels.ts`: `layerRamp` (quem manda em cada zoom), `LAYER_BASE_PX` (tamanho), `HORIZONTAL_GAP_PX`/`VERTICAL_GAP_PX` (respiro entre nomes), `uiBlockedRects` (área da interface) e `cityZoomRange` (zoom de cada rank de cidade).

## Feito — fronteiras em vetor, dia/noite e preparo de deploy

**Fronteiras viraram linhas de verdade** (`components/globe/canvas/GlobeBorders.tsx`).
Antes eram pintadas dentro da textura, o que gerava um PNG de 89 MB e linhas que
sumiam no zoom longe. Agora saem do `countries.geojson`/`states.geojson` como
geometria.

A pergunta era se ficaria pesado. Não fica, e o motivo importa: **o custo de
linha não são os vértices, é o número de draw calls**. Os 289 anéis de país
viram UM `LineSegments` mesclado. Medido em produção: **4–5 draw calls na cena
inteira, 60 FPS parado e girando** (Intel UHD 620).

| | vértices | GPU | pela rede (gzip) |
| --- | --- | --- | --- |
| Fronteiras de país | 20.730 | 0,24 MB | 66 KB |
| Fronteiras de estado | 212.708 | 2,43 MB | 621 KB |
| (referência: a esfera do globo) | 16.641 | — | — |

O `ne_110m_admin_0_countries/` que você baixou **não é necessário**: o
`public/data/countries.geojson` que já estava no projeto tem exatamente a mesma
geometria (177 features, 289 anéis, 10.654 vértices) — é o mesmo Natural Earth
110m já convertido.

**Dia e noite** (`Earth.tsx`). O shader mistura pelo ângulo entre a superfície e
o Sol, com o Sol na posição real do horário UTC — o terminador no globo é o
terminador de verdade. Do `img/`, o `2k_earth_nightmap.jpg` é usado só no build,
para extrair as luzes; o `2k_earth_daymap.jpg` ficou de fora de propósito — trava
em 2048px e tem outra gradação de cor, então misturá-lo com o `earth-1.png` daria
um salto de tom no crossfade de LOD.

**Texturas refeitas** a partir do `earth-1.png` limpo (sem fronteira assada):

| Arquivo | Tamanho | Quando entra |
| --- | --- | --- |
| `earth-day-2k.webp` | 145 KB | d ≥ 6 |
| `earth-day-4k.webp` | 501 KB | 2,95 ≤ d < 6 — **inclui a visão inicial** |
| `earth-day-8k.webp` | 1756 KB | d < 2,95 — só baixa se o usuário aproximar |

Os limiares foram calibrados pela resolução que a tela realmente pede: a 740px
de altura e d = 3, vê-se ~65° de arco, o que 4096px cobre pixel a pixel. Antes o
app pedia o nível máximo já na abertura.

Resultado: **2,05 MB numa sessão sem zoom** (era 3,88 MB, e antes disso 2,15 MB
de textura que não servia para o zoom).

### Deploy

- `npm run build` **não roda mais o preprocess**. Gerar assets virou `npm run
  assets` (ou `assets:data` / `assets:borders` / `assets:textures`), rodado na
  sua máquina, com a saída versionada. Sem isso a Vercel quebraria: as fontes
  pesadas ficam de fora do deploy.
- `.vercelignore` e `.dockerignore` excluem as entradas de build (PNGs de 77/89
  MB, `.ktx2`, `states.geojson`, `img/`, `ne_110m_.../`).
- `next.config.ts`: `output: standalone` (imagem Docker enxuta no Fly) e
  `Cache-Control` de 1 ano em `/textures`.
- `Dockerfile` e `fly.toml` criados (região `gru`, 512 MB, autostop).
- `canvas` saiu das dependências (não era mais usado). `sharp` ficou, porque
  `next/image` precisa dele em produção.

### Bloqueio para o deploy — precisa da sua decisão

O `.git` tem **359 MB** porque as texturas gigantes estão versionadas:

    89 MB  public/textures/earth-1-with-borders.png
    76 MB  public/textures/earth-1.png
    62 MB  public/textures/earth-1-with-borders.ktx2
    43 MB  public/textures/earth-2.ktx2

O GitHub aceita (o limite duro é 100 MB por arquivo) mas avisa acima de 50 MB, e
todo clone baixa 359 MB. O `.vercelignore` tira do *deploy*, não do *histórico*.
Limpar de verdade exige reescrever o histórico (`git filter-repo` ou BFG) — é
destrutivo e força push, então não fiz.

## Feito — dois modos de globo (Padrão / Relógio)

Botão no canto superior esquerdo, com a escolha guardada no `localStorage`.

| | O que manda | Como fica |
| --- | --- | --- |
| **Padrão** | o zoom | de longe (d ≥ 6,5) o planeta inteiro de noite com as luzes acesas; de perto (d ≤ 3,5) tudo dia. A câmera abre em d = 3, então a primeira vista é dia. |
| **Relógio** | a posição real do Sol | metade escura e metade clara conforme o horário UTC de agora, andando sozinha. O zoom não interfere: se é noite ali, continua noite por mais que você aproxime. |

A troca entre os dois faz fade (não corta seco), e o terminador do modo Relógio
se atualiza a cada minuto.

### Uma textura só, e mesmo assim com luzes reais

O globo carrega **apenas a textura do dia**. A noite é essa mesma imagem
escurecida no shader (`day.rgb * vec3(0.11, 0.15, 0.30)`), puxada para o azul do
luar. Não existe segunda textura para baixar nem para guardar na GPU.

As luzes das cidades são **geometria, não imagem**. A foto noturna de satélite
(`img/noite.jpg`) é lida uma única vez no build (`npm run assets:lights`), que
extrai dela as coordenadas dos pontos luminosos e grava
`public/data/city-lights.json`. A imagem nunca vai para o navegador.

Cobertura conferida bloco a bloco contra a fonte — é global e proporcional:

| Região | Luzes | | Região | Luzes |
| --- | --- | --- | --- | --- |
| EUA | 2767 | | Índia | 591 |
| Europa | 2711 | | Brasil | 525 |
| África | 1295 | | Coreia/Japão | 396 |
| Rússia | 1284 | | Amazônia | 7 |
| China | 1262 | | Saara | 21 |

Amazônia com 7 e Saara com 21 são a prova de que o limiar está certo: onde não
há cidade, não há luz. Qualquer lado do planeta que entrar na noite acende.

| | Textura noturna | Pontos (o que ficou) |
| --- | --- | --- |
| Download | 64 KB | 113 KB (gzip) |
| Memória de GPU | ~8 MB (2048×1024 RGBA) | ~235 KB de buffer |
| Por quadro | 1 amostragem de textura **por pixel** | 1 draw call, 14.660 vértices |

O peso na GPU cai ~34x, e o custo por pixel some. Foi o caminho escolhido
justamente por causa de celular fraco.

### O que faz as luzes parecerem reais

Três coisas, e as três importam — a primeira versão errou nas três e o resultado
parecia um pontilhado carimbado:

1. **Faixa dinâmica larga.** Luz de cidade real tem poucos núcleos fortíssimos e
   uma multidão de pontinhos fracos. A intensidade vai de 0,10 a 1,00, com
   mediana em 0,34 — cauda longa, não valores parecidos.
2. **Adensamento.** Um bloco muito brilhante emite até 3 luzes em vez de uma, com
   as cópias mais fracas. É isso que dá o miolo aceso com halo das grandes
   manchas urbanas, em vez de densidade uniforme.
3. **Tamanho e cor variando juntos.** O tamanho vai com o **quadrado** da
   intensidade (faixa de ~9x entre a cidadezinha e a metrópole) e a cor
   interpola de laranja de sódio (`#ff9e42`) para quase branco (`#fff4dc`).
4. **Não deixar saturar.** Com blending aditivo e ganho alto, uma luz média
   estourava igual a uma metrópole e o mapa voltava a parecer uniforme. O
   `pow(aIntensity, 1.35)` antes do ganho é o que segura o contraste.
5. **Compensação por distância** (`uFarBoost`). De longe cada luz encolhe até o
   pixel mínimo e perde área; sem compensar, o planeta apagaria justamente na
   vista mais bonita. O ganho vai de 1,0 (perto) a 2,6 (longe).

Mais um detalhe: as posições levam um deslocamento aleatório dentro do próprio
bloco. Sem isso os pontos herdam a grade de pixels da imagem e o quadriculado
aparece no zoom fundo.

### O acender é consequência, não animação

Não há timer animando luz nenhuma. O brilho de cada ponto é `1 - luz do dia`
naquele ponto, calculado no vertex shader a partir do ângulo com o Sol. Conforme
o terminador real caminha, cada cidade acende sozinha, no ritmo do planeta.

`app/lib/globeDayNight.ts` é a fonte única dessa conta — o globo e as luzes
importam de lá, para nunca discordarem sobre onde é noite (o que apareceria como
luz acesa no lado do dia).

### Custo dos dois modos: nenhum

Os dois modos são **o mesmo material** — só muda de onde vem o fator dia/noite:

    daylight = mix(uZoomDaylight, clockDaylight, uClockMode);

`uZoomDaylight` é calculado na CPU (uma conta por quadro), `clockDaylight` é um
produto escalar. As luzes usam a mesma expressão invertida.

Medido em produção: **5 draw calls na cena inteira** (globo, atmosfera, luzes,
fronteiras de país, fronteiras de estado) e **42 MB de memória**. A camada de
luzes inteira custa 1 draw call e nenhuma textura.

Onde ajustar: `ZOOM_NIGHT_DISTANCE` / `ZOOM_DAY_DISTANCE` (faixa do modo padrão)
e `MODE_FADE_SPEED`, todos no topo de `components/globe/canvas/Earth.tsx`. A
intensidade das luzes é o `2.2` em `nightLights * 2.2`, no shader.

## Feito — travamento do avião, rota real e calibração das luzes

### O gargalo do avião

Eram três causas somadas, todas no mesmo lugar:

1. **`setState` a cada quadro.** `Airplane`, `Missile` e `FlyingMessages`
   animavam com estado do React, provocando um re-render a 60 fps. Pior: os
   mísseis animam desde que o app abre, então o custo existia mesmo com o
   usuário parado olhando o globo.
2. **Geometria da linha refeita a cada quadro.** O rastro era
   `<Line points={pontos.slice(0, n)} />` — um array novo e uma reconstrução de
   geometria Line2 por quadro.
3. **`<Html occlude>` na etiqueta "GOL".** O `occlude` faz raycast contra a cena
   a cada quadro, e o `Html` ainda sincroniza um elemento do DOM junto.

O que ficou no lugar: progresso em `useRef`; o rastro é UMA geometria criada uma
vez, e crescer o traço é só mover o `setDrawRange`; e o card "GOL" virou
`RoundedBox` + `Text` na GPU — mesmo visual de antes, acompanhando o avião sobre
a linha, sem DOM e sem raycast. Hoje o `Airplane` não declara nenhum `useState`,
e no `Missile` só sobrou o `setShowExplosion`, que dispara uma vez por voo.

**Medido em produção, com o voo Tóquio–Argentina no ar:**

| Situação | FPS | Draw calls |
| --- | --- | --- |
| Globo parado | 60 | 5 |
| Avião voando | 60 | 7 |
| Avião voando + girando o globo | 60 | 7 |

(Intel UHD 620, memória JS 24 MB.)

### Rota de círculo máximo

A rota era uma Catmull-Rom passando por pontos de controle — passava pelos
lugares certos mas saía do círculo máximo no meio do caminho. Agora a
interpolação é por quaternion, o que dá o arco exato: **é a rota que a aviação
comercial de fato voa**, e por isso um São Paulo–Tóquio agora sobe em direção ao
Ártico em vez de cortar reto. A altitude segue um seno (sobe, cruza, desce) e o
teto de cruzeiro cresce com a distância angular.

### Fronteiras mais discretas

Tom dessaturado e opacidade menor: país de 0,55 para **0,30**, estado de 0,30
para **0,16**. A fronteira é referência, não o assunto — não deve competir com
os nomes nem com as luzes.

### Luzes: 1 pixel aceso = 1 luz

A extração agrupava a imagem em blocos 2x2 e depois **multiplicava** os blocos
fortes para simular adensamento. Isso perdia **37% do detalhe** da foto (27.247
pixels acesos viravam 17.149 blocos) e ainda inventava pontos que não existiam
nela — daí a sensação de pontilhado carimbado.

Agora é pixel a pixel, sem cópias sintéticas: a densidade vem da própria
imagem. Onde a mancha urbana é contínua saem muitos pontos pequenos colados;
onde há cidade isolada, sai um ponto só.

| Região | Blocos 2x2 | 1 pixel = 1 luz |
| --- | --- | --- |
| América do Sul | 1634 | **1992** |
| Brasil | 978 | **1185** |
| África | 2370 | **3245** |
| EUA/Canadá | 5257 | 7146 |
| Europa | 4361 | 6238 |
| — Amazônia (controle) | 12 | 14 |
| — Saara (controle) | 68 | 78 |

O formato virou **binário** (`city-lights.bin`): 5 bytes por luz — int16 de
longitude e latitude x100, uint8 de intensidade. São 27.247 luzes em **133 KB**,
contra 398 KB do JSON anterior *com menos detalhe*. E o celular não paga o parse
de um JSON de dezenas de milhares de números na abertura.

O tamanho do ponto também mudou: crescimento ao quadrado da intensidade, para a
maioria ficar em pontinho miúdo e só os núcleos virarem borrão maior, como na
foto. Mas a base não pode ser pequena demais — com 0,18 quase todos os pontos
grudavam no mínimo de 1 pixel e sumiam da tela, que foi o motivo de América do
Sul e África continuarem parecendo vazias mesmo com os dados corretos. Base
atual: 0,45, com o expoente de brilho em 1,05 (era 1,35, que apagava a cauda
inteira).

### Atenção: servidores antigos mascarando o resultado

Durante a sessão ficaram **12 servidores de teste no ar ao mesmo tempo**,
incluindo um na porta 3000 do começo de tudo, servindo build antigo. Quem
abrisse `localhost:3000` via código velho, por mais que o projeto já estivesse
atualizado. Todos foram encerrados.

Se as luzes parecerem erradas de novo, o primeiro passo é conferir se não há
processo velho segurando a porta:

    Get-NetTCPConnection -State Listen -LocalPort 3000

### Nitidez das luzes

Cada luz era desenhada com `smoothstep(0.5, 0.0, d)` — uma queda longa do centro
até a borda, ou seja, um borrão. Agora é disco sólido: cheio até 0,34 do raio e
apagando em 0,50, o que dá borda antisserrilhada de ~1 pixel e ponto nítido. Só
as luzes acima de 0,62 de intensidade ganham halo, para o núcleo de metrópole
continuar se destacando sem embaçar as milhares de pequenas.

O teto de tamanho caiu de 9 para 5,5 pixels pelo mesmo motivo: ponto grande com
borda suave lê como mancha, não como luz.

E o jitter subiu para ±0,9 pixel da fonte. No zoom máximo dois pixels vizinhos
da imagem ficam a ~18 px de distância na tela — sem espalhar, a grade da foto
aparece como quadriculado.

### (removido) Sobreposição de conferência

A sobreposição `?nightref=` cumpriu o papel na calibração e foi **removida** —
o globo carrega uma textura só, a do dia. Para comparar com a foto, use o script
offline, que não toca no globo:

    node scripts/preview-lights.mjs

`img/noite.jpg` já pode sair do projeto: o `city-lights.bin` é autossuficiente.

### Calibração por medição, não por tentativa

`node scripts/preview-lights.mjs` gera uma imagem empilhada — a foto de origem
em cima, os pontos do projeto embaixo, desenhados com a **mesma curva de brilho
do shader** — e imprime a contagem por região. É a ferramenta para ajustar sem o
vai e vem de publicar e olhar.

Com ela ficou claro por que América do Sul e África estavam ralas: o limiar era
**global**, e a luz dessas regiões é mais fraca que a dos EUA e da Europa. Na
faixa 35–44 de brilho o Brasil tem 548 pixels contra 310 na faixa 45–59; a
África, 1520 contra 729. Cortar em 45 penalizava justamente elas.

Limiar novo: **36**.

| Região | Antes (T=45) | Agora (T=36) |
| --- | --- | --- |
| América do Sul | 913 | **1634** |
| Brasil | 525 | **978** |
| África | 1295 | **2370** |
| EUA/Canadá | 2767 | 5257 |
| Europa | 2711 | 4361 |
| — Amazônia (controle) | 7 | 12 |
| — Saara (controle) | 21 | 68 |

Os controles seguem praticamente vazios, que é a prova de não ser ruído de
terreno. Abaixo de 32 o fundo de continente vaza (a Rússia triplica).

Também subi o teto de pontos para 30.000 e adicionei um aviso quando ele é
atingido: o corte é por brilho, então um teto apertado descartaria exatamente as
luzes fracas que este ajuste quer preservar.

Quando você estiver satisfeito com a calibração, `img/noite.jpg` pode sair do
projeto — o `city-lights.json` já é autossuficiente.

## Próximos erros (fila)




Anotar aqui os próximos bugs conforme forem aparecendo. Não misturar com o LOD dos nomes.

- **`<Html occlude>` ainda em `LocationPin`, `AdMarker`, `ClusterMarker` e
  `CustomMarker`.** Mesmo problema que o avião tinha: raycast por quadro mais
  sincronização de DOM. Só pesa quando o usuário fixa marcadores, mas cada pino
  aceso custa. Trocar por `<Text>`/Billboard resolve, igual foi feito no avião.
- **Apagar os arquivos de textura órfãos.** Depois da mudança, nada mais lê `earth-1-with-borders.*`, `earth-2.*`, `earth-3.*`, `earth-4.png`, `earth-placeholder.*` nem os `.ktx2`. Só `earth-1.png` precisa ficar (é a fonte do `npm run assets:textures`). São ~320 MB de peso morto.
- **Fronteiras de estado (621 KB) baixam já na visão inicial**, porque a d = 3 o zoom já pede a camada. Se quiser adiar, é subir o limiar em `GlobeBorders.tsx` (hoje usa `STATE_LAYER_ZOOM`, 3.2).
- **`dampingFactor: 0.02`** no OrbitControls (`GlobeScene.tsx`): o globo continua deslizando por vários segundos depois de soltar o mouse. Valor usual é 0.05–0.1.
- **`THREE.RGBFormat` não existe mais** no three 0.180 (`useGlobeTextures.ts`, placeholder procedural) — daí os avisos `GL_INVALID_ENUM: glTexStorage2D` no console. Usar `THREE.RGBAFormat` com 4 canais.

## Corrigido de passagem

- `components/globe/canvas/FlyingMessages.tsx` **travava o `next build`**: chamava `onMessageComplete` (nome da prop do componente de fora) dentro de `MessageItem`, onde a prop se chama `onComplete`; mais `depthTest` passado direto no `<Text>` do drei e um `let` que devia ser `const`. Sem isso o projeto não compilava para produção.
