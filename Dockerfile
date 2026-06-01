FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY local-accounts.json ./
COPY classone.jinmu10a.com ./classone.jinmu10a.com
COPY cdn.dcloud.net.cn ./cdn.dcloud.net.cn

ENV NODE_ENV=production
ENV PORT=4173

EXPOSE 4173
CMD ["node", "server.js"]
