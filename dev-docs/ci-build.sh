#!/usr/bin/env bash

FORESTER_URL=https://git.sr.ht/~jonsterling/ocaml-forester/archive/10e7c43441eddee5525f7967fa90496a4f1b4691.tar.gz
FORESTER_TARBALL=$(basename "$FORESTER_URL")

curl -L -O $FORESTER_URL 
mkdir ocaml-forester
tar -xf $FORESTER_TARBALL -C ocaml-forester --strip-components 1

mv Dockerfile ocaml-forester
mv static.patch ocaml-forester
cd ocaml-forester
docker build --output=docker-build --target=forester-built .
mv docker-build/bin/forester ../
cd ../

./forester build
