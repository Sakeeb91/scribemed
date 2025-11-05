FROM node:20-alpine

# Container image for the coding lookup service.
WORKDIR /app

COPY services/coding/package.json package.json
COPY services/coding/src src

RUN npm install --omit=dev

EXPOSE 8082
CMD ["node", "src/server.js"]
