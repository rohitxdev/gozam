FROM golang:1.24-alpine3.22 AS base

RUN apk add --no-cache curl python3 ffmpeg

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download


FROM base AS dev

RUN go install github.com/air-verse/air@latest

COPY . .

CMD ["air"]


FROM base AS release-builder

RUN apk add --no-cache nodejs npm

COPY . .

WORKDIR /app/client
RUN npm install && npm run build

WORKDIR /app
RUN CGO_ENABLED=0 go build -o build/main .


FROM base AS release

COPY --from=release-builder /app/build /app/build

CMD ["/app/build/main"]
