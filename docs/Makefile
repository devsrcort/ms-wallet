default: docs

.PHONY: docs
docs:
	- docker run --name ms-wallet-docs-builder -v ${PWD}:/apidocs irakli/redoc-cli:latest && docker rm -f ms-wallet-docs-builder

.PHONY: start
start:
	- docker run -d --rm --name ms-wallet-docs -p 34549:80 -v ${PWD}/api.yml:/usr/share/nginx/html/swagger.yaml -e SPEC_URL=swagger.yaml redocly/redoc:v2.0.0-rc.8-1
	- @echo "server started at: http://0.0.0.0:34549"

.PHONY: stop
stop:
	- docker stop ms-wallet-docs
