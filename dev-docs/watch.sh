#!/usr/bin/env bash

forester build

while true; do
  inotifywait -q -e modify,create,delete,move -r trees && \
    ./forester build
done
