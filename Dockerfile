# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM golang:1.26.5 AS go-builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN target_os="${TARGETOS:-$(go env GOOS)}" && \
    target_arch="${TARGETARCH:-$(go env GOARCH)}" && \
    CGO_ENABLED=0 GOOS="${target_os}" GOARCH="${target_arch}" \
    go build -trimpath -ldflags="-s -w" -o /out/social-threader-api ./cmd/social-threader-api && \
    CGO_ENABLED=0 GOOS="${target_os}" GOARCH="${target_arch}" \
    go build -trimpath -ldflags="-s -w" -o /out/fake-llm-proxy ./cmd/fake-llm-proxy

FROM alpine:3.22 AS api

ARG RELEASE_VERSION=development
ARG SOURCE_REVISION=unknown

LABEL org.opencontainers.image.title="Social Threader API" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.source="https://github.com/MarcoPoloResearchLab/social_threader"

RUN apk add --no-cache ca-certificates && mkdir -p /app/configs

COPY --from=go-builder /out/social-threader-api /usr/local/bin/social-threader-api

WORKDIR /app
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/social-threader-api"]
CMD ["--config=/app/configs/config.yml"]

FROM alpine:3.22 AS fake-llm-proxy

COPY --from=go-builder /out/fake-llm-proxy /usr/local/bin/fake-llm-proxy

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/fake-llm-proxy"]

FROM scratch AS static-site

COPY .nojekyll /
COPY index.html CNAME robots.txt sitemap.xml config-app.json config-ui.yaml /
COPY assets /assets
COPY data /data
COPY js /js
COPY resources /resources

FROM caddy:2.10.2-alpine AS local-web

COPY Caddyfile.local /etc/caddy/Caddyfile
COPY --from=static-site / /srv

EXPOSE 4173

FROM scratch AS pages

COPY --from=static-site / /
