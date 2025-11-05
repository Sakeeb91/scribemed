FROM node:20-alpine

# Container image for the documentation service.
WORKDIR /app

COPY services/documentation/package.json package.json
COPY services/documentation/src src

RUN npm install --omit=dev

EXPOSE 8081
CMD ["node", "src/server.js"]
