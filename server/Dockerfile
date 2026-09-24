# Build the application in a separate stage so the runtime image only contains
# the binary and the packages required while processing archives.
FROM golang:1.26-bookworm AS build

WORKDIR /go/src/app
COPY . .

RUN go mod download
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /go/bin/app ./cmd/server

# AppRun専有型の実行イメージ。ffmpegはHLSアーカイブの音声抽出に必要。
FROM debian:bookworm-slim

RUN apt-get update \
	&& apt-get install --no-install-recommends --yes ca-certificates ffmpeg \
	&& rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 appuser
COPY --from=build /go/bin/app /usr/local/bin/app
USER appuser

EXPOSE 8090
ENTRYPOINT ["/usr/local/bin/app"]