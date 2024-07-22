#!/usr/bin/env bash

FORESTER_VERSION=4.1.0
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null

cd SCRIPT_DIR
tar -xf forester-$FORESTER_VERSION.tar.gz
cd ..
cd devdocs
../scripts/forester build
