FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN npm install -g pnpm@10.32.0 && mkdir /app && chown node:node /app
USER node
WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
ARG ENVIO_CONFIG=config.yaml
ENV ENVIO_CONFIG=$ENVIO_CONFIG
COPY --chown=node:node config*.yaml schema*.graphql tsconfig*.json vitest.config.ts ./
COPY --chown=node:node src ./src
COPY --chown=node:node test ./test
RUN pnpm envio codegen
CMD ["pnpm", "envio", "start"]
