#!/usr/bin/env bash
#
# (Authored by Claude, reviewed/edited by Michael Arntzenius.)
#
# Downloads a set of SNAP (Stanford Large Network Dataset Collection) datasets,
# un-gzips them, and places the resulting .txt files into ./data/
#
# Usage: ./download_snap_datasets.sh

set -euo pipefail

# cd to the directory this script is in, so that `data/` is always created next
# to the script.
cd "$(dirname "${BASH_SOURCE[0]}")"

pwd

BASE_URL="https://snap.stanford.edu/data"
DATA_DIR="data"

DATASETS=(
    "ca-GrQc"
    "cit-HepTh"
    "wiki-Vote"
    "email-Enron"
    "soc-Epinions1"
)

mkdir -p "$DATA_DIR"

for name in "${DATASETS[@]}"; do
    gz_file="${DATA_DIR}/${name}.txt.gz"
    txt_file="${DATA_DIR}/${name}.txt"
    url="${BASE_URL}/${name}.txt.gz"

    if [[ -f "$txt_file" ]]; then
        echo "[skip] ${txt_file} already exists"
        continue
    fi

    if [[ -f "$gz_file" ]]; then
        echo "[download skipped] ${gz_file} already exists"
    else
        echo "[download] ${url}"
        # -f: fail on http errors
        # -S: show errors
        # -L: follow redirects
        curl -fSL --retry 3 -o "$gz_file" "$url"
    fi

    echo "[extract] ${gz_file} -> ${txt_file}"
    gunzip "$gz_file"

    echo "[done] ${txt_file}"
done

echo "All datasets downloaded to ${DATA_DIR}/"
