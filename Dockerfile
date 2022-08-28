FROM node:17.8.0-alpine3.15 as builder

WORKDIR /usr/src/app
ADD package.json package-lock.json ./
RUN npm install
ADD tsconfig.json jest.config.js ./
COPY ./src ./src
RUN npm run test && npm run build

FROM node:16.16.0-alpine3.16

ENV TELEGRAM_TOKEN DUMMY
ENV TELEGRAM_CHATID DUMMY

USER node
WORKDIR /usr/src/app
ADD package.json ./

COPY --from=builder --chown=node  /usr/src/app/dist ./dist
CMD  ["node", "dist/index.js"]