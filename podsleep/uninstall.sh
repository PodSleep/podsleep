#!/bin/bash
# Removes PodSleep and puts Free Sleep's own screens back. Runs ON the Pod as root.
set -e
SERVER=/home/dac/free-sleep/server
BACKUP=/home/dac/podsleep-backup
ROUTES="$SERVER/dist/setup/routes.js"
[ -d "$BACKUP/public" ] || { echo "No backup found at $BACKUP, so there is nothing to restore."; exit 1; }
rm -rf "$SERVER/public"; cp -a "$BACKUP/public" "$SERVER/public"
# Take out only PodSleep's lines, so this works even after a Free Sleep update.
sed -i '/\/\/ PodSleep$/d' "$ROUTES"
rm -rf "$SERVER/dist/routes/boost" /home/dac/podsleep-version
chown -R dac:dac "$SERVER/public" "$ROUTES"
systemctl restart free-sleep
echo "PodSleep removed. Free Sleep's own screens are back."
