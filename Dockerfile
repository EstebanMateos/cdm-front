FROM node:24-alpine AS build

WORKDIR /app

ARG VITE_API_URL=http://localhost:5050
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html .
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
