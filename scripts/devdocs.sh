#!/usr/bin/env bash

FORESTER_VERSION=4.1.0

cd devdocs
tar -xf ../scripts/forester-$FORESTER_VERSION.tar.gz
./forester build
