#!/usr/bin/env bash
set -e

DUMPFILE="db_$(date +%F_%H-%M-%S).sql"

cd ~
pg_dump catcolab > $DUMPFILE

rclone --config="/run/agenix/rclone.conf" copy "$DUMPFILE" backup:catcolab

echo "Uploaded database dump $DUMPFILE"
rm $DUMPFILE
