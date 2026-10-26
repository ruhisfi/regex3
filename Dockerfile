# syntax=docker/dockerfile:1

# The build only produces static files, so it always runs on the machine doing the build, whatever platform the
# image is for. That keeps multi-platform builds fast: nothing here is emulated.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# The unprivileged image runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:alpine
# The base image sets its own version, revision, created and url labels, so these replace them. The release workflow
# overrides the version, revision and created labels with real values.
ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL maintainer="Ruhis" \
      org.opencontainers.image.authors="Ruhis" \
      org.opencontainers.image.title="regex3" \
      org.opencontainers.image.description="A regular expression tester and explainer" \
      org.opencontainers.image.url="https://github.com/ruhisfi/regex3" \
      org.opencontainers.image.source="https://github.com/ruhisfi/regex3" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION" \
      org.opencontainers.image.created="$CREATED"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
