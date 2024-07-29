#!/usr/bin/env bash

FORESTER_TARBALL=forester-4.2.0-prerelease-x86_64-unknown-linux-musl.tar.gz
FORESTER_URL=http://bafybeigtximvb4skcxbcynkx3asjtvkflwwnrig6aknmr4icpj2j44op3a.ipfs.w3s.link/$FORESTER_TARBALL

curl -L -O $FORESTER_URL
tar -xf $FORESTER_TARBALL
./forester build
