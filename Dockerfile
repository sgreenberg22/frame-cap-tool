# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json vite.config.js ./
COPY index.html ./
COPY public ./public
COPY src ./src
RUN npm ci || npm i
RUN npm run build


# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx","-g","daemon off;"]
