FROM node:20-alpine

# Container image for the transcription facade. The image stays slim by
# depending solely on Node''s standard library.
WORKDIR /app

# Copy only the files this service needs.
COPY services/transcription/package.json package.json
COPY services/transcription/src src

RUN npm install --omit=dev

EXPOSE 8080
CMD ["node", "src/server.js"]
