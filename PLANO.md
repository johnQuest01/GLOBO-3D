# Plano de trabalho

O que falta construir, em ordem de dependência — não de vontade. Cada item tem
um **critério de pronto** que é verificável, porque "está feito" sem um teste é
uma opinião.

Marco um item como feito quando: o código está no ar **e** há teste automatizado
cobrindo a regra que ele promete.

---

## 1. Perfil em tela inteira

**Estado:** por fazer.

Hoje existem duas telas separadas e ambas são cartões pequenos:
`PerfilPanel` (editar o meu) e `PerfilDeOutroPanel` (ver o de alguém). A grade
de fotos e vídeos já existe e está ligada nas duas.

O que precisa virar:

- tela inteira, não cartão
- foto grande, nome, @nickname, descrição
- **seguidores** e **seguindo**, lado a lado, com número
- a grade embaixo, como já está
- botão de **configurações** que abre o que hoje está espalhado

**Pronto quando:** o perfil abre em tela cheia no celular e no desktop, mostra
os dois números, e a suíte de perfil cobre "seguindo" (hoje só cobre
seguidores).

**O que falta decidir:** clicar no número de seguidores abre a lista? Hoje não
existe rota que diga QUEM segue alguém, e isso foi deliberado — saber que
alguém tem 40 seguidores não diz nada sobre ninguém; saber quem são os 40 diz
sobre os 40. Vou manter o número sem a lista até você pedir o contrário.

---

## 2. Configurações, num lugar só

**Estado:** por fazer.

Hoje a privacidade do perfil (`publico` / `reservado` / `privado`) mora dentro
da tela de editar perfil, misturada com nome e foto. Precisa sair de lá e virar
uma tela de configurações com:

- privacidade do perfil
- assuntos da conta (o que eu quero ver — ver item 3)
- o que já existir de conta (sair, apagar conta)

**Pronto quando:** existe uma tela de configurações alcançável do perfil, e
mudar a privacidade por ela tem o mesmo efeito que tinha antes (a suíte de
perfil já cobre isso — os testes não podem quebrar).

---

## 3. Filtro de países — "moro no Brasil, quero ver só a Rússia"

**Estado:** por fazer. **É o item mais importante da lista**, e explico por quê.

Hoje o mural mistura: o que você segue + o mundo preenchendo o resto
(`muralDeQuemSegue`, em `lib/db/seguir.ts`). Seguir um lugar ADICIONA; não
existe forma de EXCLUIR. Então "quero ver a Rússia e não o Brasil" é impossível
hoje, mesmo seguindo a Rússia — o Brasil entra pelo preenchimento do mundo.

O que precisa existir:

- uma escolha por pessoa: **só os lugares que eu escolhi**, sem preenchimento
- e, separado, a possibilidade de **excluir** um lugar

**Por que isso não é só uma consulta a mais.** A mistura com o mundo existe para
o feed nunca abrir vazio: seguir três cidades e abrir numa hora morta daria tela
branca, e tela branca faz a pessoa fechar o app. Desligar o preenchimento é
aceitar a tela vazia — então a tela precisa DIZER que está vazia por escolha,
e não parecer defeito.

**Pronto quando:** com o modo restrito ligado e só a Rússia escolhida, o mural
não devolve nenhum post do Brasil — provado por teste, com posts plantados nos
dois países.

---

## 4. Repostar

**Estado:** por fazer.

Não existe. Precisa de coluna nova em `posts` (`repost_de`) e de uma regra: o
repost aponta para o original, e o original continua sendo a fonte do texto e
da mídia. Copiar o conteúdo criaria duas verdades — apagar o original deixaria
a cópia viva dizendo algo que o autor retirou.

**Pronto quando:** repostar aparece no feed de quem me segue, apagar o original
some com o repost, e o contador de reposts do original não mente (mesma
disciplina de gatilho das curtidas).

---

## 5. Compartilhar

**Estado:** por fazer.

Compartilhar para fora do app (`navigator.share`, com cópia de link como
reserva). Precisa de uma página pública por post — hoje não existe URL que abra
um post específico.

**Pronto quando:** o link abre o post para quem não tem conta, mostrando o que é
público e convidando a entrar.

---

## 6. Recomendação — o feed que aprende

**Estado:** FEITO na versão que otimiza tempo de tela, por decisão sua, e com a
objeção registrada. Está na aba **"Para você"** do feed.

O que existe: `post_view` (tempo por publicação, medido no feed), `post_like`,
`post_comment`, `post_globe` alimentam `affinity` (país e autor, meia-vida 45
dias) e os contadores `posts.vistas` / `posts.tempo_visto_seg`. O ranking está
em `lib/db/paraVoce.ts` com os pesos nomeados em `PESOS`.

**A avaliação, com número** (suíte `paravoce`): a publicação que recebe cinco
comentários "discordo!" sobe para 2º lugar **sem uma curtida sequer**; a
publicação quieta do mesmo autor, mesmo lugar, mesmo minuto, fica em 5º. É o
algoritmo funcionando como desenhado — e é exatamente o efeito da objeção.

**O freio** (`PausaPanel`): existe, mas está **desligado** (`FREIO_LIGADO =
false` em `LinhaDoTempo.tsx`), a pedido — um app com zero usuários precisa
primeiro de gente ficando. Liga com um booleano quando houver uso para medir.

**O que foi adicionado depois da primeira versão, porque com zero usuários é o
que mais importa:**

- **Exploração** — toda publicação com menos de 8 vistas ganha um bônus que
  encolhe a cada vista. Sem isso o feed tinha um defeito de nascença: zero
  vistas → zero "prende" → nunca sobe → zero vistas. O rico fica rico. É a cota
  garantida de exibições que o TikTok dá a todo vídeo novo — e é isso, mais que
  a fórmula, o segredo dele.
- **Diversidade** — nunca o mesmo autor em dois seguidos, nunca o mesmo país em
  três. Não muda a nota; muda a ordem depois da nota.

**O que decidir depois, olhando uso real:** se o peso de comentário fica em 3
(hoje puxa briga), e se a pausa em 20 min derruba a retenção de um app novo.
Nenhum dos dois é código; são dois números.

---

### O plano original deste item, para referência

**Estado anterior:** por fazer. É o maior item, e o último de propósito.

**Não dá para recomendar sem sinal.** Até agora o app não guardava nada sobre o
que a pessoa gosta. Curtida e comentário acabaram de nascer (commit `639c04d`) e
são os primeiros sinais reais que existem. Reposta e compartilhamento são os
itens 4 e 5. Construir o algoritmo antes deles seria construir sobre nada.

Quando houver sinal, a ordem honesta é:

1. **Sinais registrados**, com peso: ver até o fim > curtir > comentar >
   repostar > compartilhar. Tempo de visualização é o sinal mais forte e o mais
   barato de coletar — e é o único que não exige gesto.
2. **Pontuação simples primeiro**: afinidade com o lugar, afinidade com a
   pessoa, frescor. Postgres dá conta, e dá para explicar por que um post
   apareceu.
3. **Só então** algo mais pesado, se a simples não servir.

**O risco que vou trazer à tona agora, e não depois:** um feed que otimiza
engajamento aprende que briga engaja. O app é aberto a partir dos 13 anos e o
conteúdo é sobre LUGARES, o que dá uma vantagem rara — dá para recomendar por
onde a pessoa quer estar em vez de por quem ela quer ver brigando. Vou propor os
pesos por escrito antes de ligar qualquer coisa.

**Pronto quando:** existe uma tabela de sinais alimentada de verdade, e o feed
ordenado por pontuação passa num teste que prova que ele prefere o que é
relevante — e não só o que é recente.

---

## 7. Pular a recodificação quando o arquivo já está bom

**Estado:** feito — `jaEstaBom()` em `lib/midia/comprimir.ts` lê o cabeçalho do MP4 e sobe direto quando é H.264 e cabe. Limite de vídeo subiu para **5 minutos** e o teto de arquivo para **100 MB**. Falta o teste com arquivos reais (H.264 sobe direto, HEVC recodifica).

O vídeo tem 3 min 51 s, já é H.264 + AAC e tem 57,9 MB. Do celular ele seria
**recusado** — o preparo tem teto de 3 minutos, porque recodificar acontece em
tempo real e prender alguém quatro minutos numa barra é abandono. Mas esse
arquivo **não precisava** de preparo nenhum: cabe no teto de 60 MB e toca em
todo navegador do jeito que está.

O que precisa existir: antes de recodificar, ler o cabeçalho do arquivo (o
`moov`, que nos vídeos de câmera vem no começo) e, se for H.264 num MP4 e couber
no teto, **subir direto**. A recodificação continua existindo para o que
precisa dela — HEVC de iPhone e arquivo grande demais.

**Pronto quando:** este exato arquivo sobe do navegador sem passar pela barra
de preparo, e um `.mov` HEVC continua sendo recodificado — os dois cobertos por
teste, com arquivos reais.

---

## Dívidas conhecidas (minhas e do projeto)

- [x] ~~vídeo de celular não subia (teto de 25 MB, HEVC)~~ — resolvido em `377443c`
- [x] ~~fila de moderação sem tela~~ — resolvido
- [x] ~~post de texto não aparecia sobre o globo~~ — aparecia só foto e vídeo, e
      um post de texto deixava o espaço vazio: o globo girava e nada acontecia,
      indistinguível de estar quebrado. Agora o texto vira um cartão na cor do
      país
- [x] ~~os nomes do mapa eram desenhados POR CIMA da publicação~~ — "Tocantins"
      atravessado no meio do vídeo de alguém. Os rótulos são transparentes
      (`renderOrder` 10) e o cartão era opaco; `renderOrder` só ordena dentro de
      um passe, e o passe transparente sempre vem depois do opaco
- [x] ~~o preparo de vídeo produzia arquivo VAZIO se a página ficasse oculta~~ —
      o laço de desenho usava `requestAnimationFrame`, que não dispara com a
      página escondida. Quem trocasse de aplicativo durante o minuto de espera
      subia um mp4 de 14 KB com cabeçalho e sem imagem — e a publicação dava
      certo, aparecia no mural, e só quem abrisse descobria. Falha silenciosa é
      pior que falha barulhenta. Agora: `requestVideoFrameCallback` com
      `setInterval` de rede, pausa quando a página some, e **conferência do que
      saiu antes de subir** (se não decodifica, o original segue)

- [x] ~~o vídeo sobre o globo tocava MUDO no celular~~ — o `play()` acontecia
      num efeito do React, depois de o globo voar, longe do toque; o navegador
      do celular só libera som DENTRO do toque. Agora há um único `<video>`
      destravado no próprio clique (`lib/globo/videoDoGlobo.ts`), e um botão
      "Ligar o som" quando a política ainda assim barra
- [x] ~~a mídia caía EM CIMA do nome do lugar~~ — o deslocamento era no eixo Y
      do mundo (o dos polos), que na latitude de Los Angeles aponta para a
      câmera; agora ela mora no mesmo painel do nome, onde Y é "para cima na
      tela"
- [x] ~~vídeo em `loop`~~ — quatro minutos com som repetindo sobre o globo é um
      alarme, não uma publicação. Toca uma vez, do começo ao fim
- [x] borda azul arredondada, e um pouco menor — pedido seu

- [x] ~~o vídeo no feed não tinha som~~ — era mudo de propósito (som que começa
      sozinho enquanto se rola é o que faz fechar o app), mas som que a pessoa
      PEDIU tem de continuar valendo. Agora: começa mudo, um toque no vídeo
      liga, e a escolha vale para os vídeos seguintes do feed — como TikTok e
      Instagram. De quebra, o painel de baixo (autor + legenda) engolia o toque
      sobre o vídeo; ficou transparente ao toque, com os botões clicáveis

- [x] ~~o vídeo sobre o globo ficava PARADO~~ — o elemento dava "Format error"
      num arquivo íntegro. Causa: cache do navegador envenenado. O feed pedia o
      vídeo SEM `crossOrigin`; o globo pedia a mesma URL COM `crossOrigin` (o
      WebGL exige) e recebia do cache a resposta sem os cabeçalhos CORS. Agora
      todo `<video>`/`<img>` de mídia do R2 pede com `crossOrigin`, e o
      elemento do globo tenta de novo com a URL marcada se o primeiro
      carregamento falhar — rede para quem já tem o cache sujo no telefone
- [x] ~~"Para você" quebrava em duas linhas no celular~~ — `whitespace-nowrap`

- [x] ~~com a linha do tempo minimizada, a faixa cobria metade dos botões da
      coluna direita~~ — "partes do botão à mostra, como se a tela de botões
      estivesse escondida por baixo". A faixa ocupa x 349–375 e o hambúrguer,
      o cadeado, o menu e os botões de admin terminam em x 359. Agora a borda
      direita é da linha do tempo enquanto ela está aberta: header, rodapé,
      cadeado e admin somem com `muralAberto`
- [x] ~~faixa da direita "mais interessante"~~ — virou uma coluna de
      miniaturas (foto, cartaz do vídeo, ou a cor do lugar com a primeira
      letra), com a borda azul do cartão sobre o globo no item ativo e um fio
      na cor do instante. Com muitas publicações os quadrados encolhem até 22
      px; abaixo disso voltam a ser barras, porque 12 px com foto é ruído

- [x] ~~"online" do chat não atualizava sem recarregar~~ — a consulta ao
      diretório era feita uma vez ao abrir a conversa (uma foto, não um
      estado), e `presence:update` só cobre a mesma célula de 2 km. Agora:
      consulta a cada 10 s com conversa/lista na tela, mensagem ou digitação
      recebida dispara na hora, e a volta do segundo plano reconecta sem
      esperar o backoff. Medido em produção: entrega ao vivo em 203 ms;
      bolinha verde 2 s depois de abrir, cinza sozinha quando o outro sai

- [ ] **Vercel: branch de produção** — falta você clicar em
      Settings → Git → Production Branch → `globo/lod-luzes-fronteiras`.
      A API do Vercel recusa esse campo; é clique manual.
- [x] ~~senhas de teste no `CHAT-GLOBAL-PLAN.md`~~ — saíram do arquivo. Mas
      ficaram no histórico do git por dois dias num repositório público, então
      a senha antiga é pública: **trocar a senha das duas contas ou apagá-las**
      (`apagarConta()` em `scripts/testes/contas.ts`) antes de entrar gente de
      verdade
- [ ] **tokens colados no histórico precisam ser rotacionados** (Google, Vercel,
      Railway)
- [ ] **311 MB de texturas não usadas** no repositório
- [ ] **contas de teste vivem no banco de PRODUÇÃO** — a faxina limpa, mas a
      suíte roda contra produção por padrão. Vale um banco separado.

---

## Como eu trabalho nesta lista

Um item por vez, na ordem acima. Para cada um: construo, testo com a suíte,
verifico no navegador em celular e desktop, publico, e só então marco aqui.
Se eu encontrar um defeito no caminho, ele vira uma linha nas dívidas em vez de
ser consertado de passagem — consertar de passagem é como um item vira três.
