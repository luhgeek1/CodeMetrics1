FROM node:24-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci --silent --no-audit --no-fund

COPY frontend/ ./

# Optional: allow overriding API base at build time
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

RUN mkdir -p /etc/nginx/certs \
    && openssl req -x509 -nodes -days 3650 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -newkey rsa:2048 \
    -keyout /etc/nginx/certs/localhost.key \
    -out /etc/nginx/certs/localhost.crt

COPY nginx/nginx.conf /etc/nginx/templates/default.conf.template
COPY nginx/backend-proxy.conf /etc/nginx/backend-proxy.conf
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
