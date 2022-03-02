#!/bin/sh
export NODE_ENV=dev
export PORT=5502
export SOCKET_PORT=5702
node_modules/db-migrate/bin/db-migrate up -e $NODE_ENV && nodemon -e js,handlebars server.js