FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p /data
VOLUME /data
ENV DB_PATH=/data/biz.db
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
