# Imagem do servidor de realtime — presença, busca e caixa postal.
#
# NÃO é o app Next. São dois processos com necessidades opostas: o Next pode
# dormir quando ninguém acessa; este aqui não pode, porque dormir derruba todas
# as conexões abertas e apaga a presença de todo mundo. Por isso ele tem
# imagem, app e fly.toml próprios (ver o fly.toml ao lado).
#
# O CONTEXTO DE BUILD É ESTA PASTA, e isso importa: o servidor importa de
# `../shared/protocol.js`, que é a fonte da verdade do contrato de eventos
# compartilhada com o front. Já houve um deploy quebrado exatamente por essa
# pasta ficar de fora da imagem — daí ela ser copiada explicitamente abaixo.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# `scripts/` entra no build porque o tsconfig o inclui (é onde vivem o probe e
# o teste do store). Sem ele aqui, o `tsc` falha procurando arquivo que não
# existe. Ele não vai para a imagem final.
COPY tsconfig.json ./
COPY shared ./shared
COPY src ./src
COPY scripts ./scripts

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
# Sem as dependências de desenvolvimento: o tsx e o socket.io-client só servem
# para compilar e testar, e carregar isso em produção é superfície à toa.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Roda como usuário comum. O processo não precisa de root para abrir a 8080.
RUN addgroup -g 1001 -S nodejs && adduser -S globo -u 1001 && chown -R globo:nodejs /app
USER globo

EXPOSE 8080
CMD ["node", "dist/src/index.js"]
