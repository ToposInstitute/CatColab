#!/usr/bin/env bash

./build.sh

while true; do
  inotifywait -q -e modify,create,delete,move -r trees && \
    ./build.sh
done
