#!/usr/bin/env bash
echo "Open http://localhost:8080/index.xml ..."
echo ""
npx browser-sync start --server output --files "output/**/*.xml" --port 8080 --no-open
