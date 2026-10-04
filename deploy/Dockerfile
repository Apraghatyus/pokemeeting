# Las dos piezas de servidor (salas y aleatorizacion) en una imagen.
# Se construye desde la raiz del repo: docker build -f deploy/Dockerfile .
#
# Base Java 8 JDK porque el randomizer necesita jjs, que desaparecio en Java 15.
FROM eclipse-temurin:8-jdk-jammy AS base
# Node 22 copiado de su imagen oficial (misma glibc), sin repositorios extra.
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && node -v && npm -v && test -x "$JAVA_HOME/bin/jjs"

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/signaling/package.json apps/signaling/
COPY apps/randomizer/package.json apps/randomizer/
COPY packages/protocol/package.json packages/protocol/
COPY packages/pokemon/package.json packages/pokemon/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci
COPY . .
RUN npm run build

# El jar del randomizer es GPL-3 y no se versiona: se descarga el oficial.
FROM alpine:3.20 AS upr
ARG UPR_VERSION=latest
RUN apk add --no-cache curl unzip \
 && url="$(curl -fsSL https://api.github.com/repos/Ajarmar/universal-pokemon-randomizer-zx/releases/${UPR_VERSION} \
      | grep -o '"browser_download_url": *"[^"]*\.zip"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')" \
 && echo "UPR: $url" && curl -fsSL -o /tmp/upr.zip "$url" \
 && unzip -j /tmp/upr.zip '*PokeRandoZX.jar' -d /opt

FROM base AS servidor
WORKDIR /app
# tsx esta entre las dependencias de desarrollo: hacen falta en ejecucion.
COPY --from=build /app /app
COPY --from=upr /opt/PokeRandoZX.jar /app/tools/randomizer/PokeRandoZX.jar
RUN rm -rf /app/apps/web/node_modules /app/apps/web/src \
 && useradd --system --uid 10001 --home /app emupoke \
 && mkdir -p /tmp && chmod 1777 /tmp
USER emupoke
ENV NODE_ENV=production
CMD ["node", "deploy/arrancar.mjs"]

# La web: ficheros estaticos con las cabeceras COOP/COEP, y el reparto de
# /signaling y /randomizer hacia el contenedor de servidor.
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
