#!/usr/bin/env bash

FORESTER_VERSION=4.1.0

cd dev-docs
tar -xf ../scripts/forester-$FORESTER_VERSION-x86_64-unknown-linux-musl.tar.gz
./forester build
