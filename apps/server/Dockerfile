# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine3.24 AS build

WORKDIR /src
ENV GOMAXPROCS=1 GOMEMLIMIT=384MiB
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
ARG TARGETOS
ARG TARGETARCH
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p /out && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -p=1 -trimpath -ldflags="-s -w" -o /out/ \
    ./cmd/api ./cmd/worker ./cmd/migrate ./cmd/janitor \
    ./cmd/projectctl ./cmd/tenantctl ./cmd/secretctl ./cmd/billingctl

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/ /app/
WORKDIR /app
USER 65532:65532
EXPOSE 8080
CMD ["/app/api"]
