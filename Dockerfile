# Alpine Linux-based, tiny Node container:
FROM node:12-alpine3.9 as base

ADD ./ /opt/app
WORKDIR /opt/app

USER root

RUN rm -rf node_modules \
 && chown -R node /opt/app

#USER node

FROM base as release

USER root
RUN npm install --only=production \
 #&& apk add --no-cache tini \
 && chown -R node /opt/app
RUN chmod 755 ./shell/run-db-migration.sh

USER node
ENV HOME_DIR=/opt/app \
    NODE_ENV=production \
    PORT=5502 \
    SOCKET_PORT=5702

ENTRYPOINT ./shell/run-db-migration.sh && node server.js

FROM base as build

USER root
RUN npm install -g nodemon \
 && npm install \
 && chown -R node /opt/app
RUN chmod 755 ./shell/run-db-migration.sh

USER node
ENV PORT=5502
ENV SOCKET_PORT=5702

ENTRYPOINT ./shell/run-db-migration.sh && node server.js
