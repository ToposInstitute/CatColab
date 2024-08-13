#!/usr/bin/env bash

FORESTER_TARBALL=forester-4.2.0.tar.gz
FORESTER_URL=https://github.com/TheCedarPrince/ForesterBuilds/raw/main/$FORESTER_TARBALL

curl -L -O $FORESTER_URL
tar -xf $FORESTER_TARBALL
rm $FORESTER_TARBALL

./forester build
