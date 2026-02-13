.PHONY: build test install clean

BINARY=feelr
VERSION?=dev

build:
	go build -ldflags "-X main.version=$(VERSION)" -o $(BINARY) .

test:
	go test ./...

install:
	go install .

clean:
	rm -f $(BINARY)
