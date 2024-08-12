#!/usr/bin/env bash

FORESTER_URL=https://git.sr.ht/~jonsterling/ocaml-forester/archive/10e7c43441eddee5525f7967fa90496a4f1b4691.tar.gz

curl -L -O $FORESTER_URL
tar -xf $FORESTER_TARBALL
./forester build
