#!/usr/bin/env bash
echo "Open http://localhost:8080/index.xml ..."
echo ""
python3 -m http.server -d output 8080

