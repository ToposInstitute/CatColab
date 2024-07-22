#!/usr/bin/env bash

FORESTER_TARBALL=forester-4.1.0-x86_64-unknown-linux-musl.tar.gz
FORESTER_URL=http://bafybeieju6aexd2iwqzgwpc2rfi4fkbogztphpfulr3k2wzyrhfvqxxa3m.ipfs.w3s.link/$FORESTER_TARBALL

cd dev-docs
curl -L -O $FORESTER_URL
tar -xf $FORESTER_TARBALL
./forester build
