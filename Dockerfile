# Build stage
FROM node:20-alpine AS build
# Alpine needs this for some prebuilt binaries (esbuild/rollup)
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json vite.config.js ./
COPY index.html ./
COPY public ./public
COPY src ./src
# Try npm ci if you have a lockfile; otherwise fall back to npm i
RUN npm ci || npm i
RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx","-g","daemon off;"]
