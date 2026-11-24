#!/bin/bash
# PodSleep installer. Runs ON the Pod as root (install-from-computer.sh copies it there and runs it).
# Safe to run again, including after a Free Sleep update (updates replace PodSleep's files).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SERVER=/home/dac/free-sleep/server
BACKUP=/home/dac/podsleep-backup
ROUTES="$SERVER/dist/setup/routes.js"
VERSION="$(cat "$HERE/VERSION" 2>/dev/null || echo unknown)"

[ -d "$SERVER/public" ] && [ -f "$ROUTES" ] || { echo "Free Sleep not found at $SERVER. Install Free Sleep first."; exit 1; }
echo "Installing PodSleep $VERSION"

# 1. Back up Free Sleep's own screens (skipped if PodSleep is already installed).
mkdir -p "$BACKUP"
if ! grep -q PodSleep "$SERVER/public/index.html"; then
  rm -rf "$BACKUP/public"; cp -a "$SERVER/public" "$BACKUP/public"
fi
cp -a "$ROUTES" "$BACKUP/routes.js.before-install"
echo "Backup of Free Sleep's screens: $BACKUP"

restore() {
  echo "Putting Free Sleep back..."
  rm -rf "$SERVER/public"; cp -a "$BACKUP/public" "$SERVER/public"
  cp -a "$BACKUP/routes.js.before-install" "$ROUTES"
  sed -i '/\/\/ PodSleep$/d' "$ROUTES"
  sed -i '/\/\/ PodSleep$/d' "$ROUTES"
  rm -rf "$SERVER/dist/routes/boost"
  chown -R dac:dac "$SERVER/public" "$ROUTES"
  systemctl restart free-sleep
}

# 2. New screens.
rm -rf "$SERVER/public"
cp -a "$HERE/public" "$SERVER/public"

# 3. Boost add-on: runs the Cold Shot / Heat Boost timer on the Pod.
mkdir -p "$SERVER/dist/routes/boost"
cp "$HERE/server/dist/routes/boost/boost.js" "$SERVER/dist/routes/boost/boost.js"
if ! grep -q PodSleep "$ROUTES"; then
  if grep -q "^import logger from '../logger.js';" "$ROUTES" && grep -q "app.use('/api/', alarm);" "$ROUTES"; then
    sed -i "s#^import logger from '../logger.js';#import logger from '../logger.js';\nimport boost, { resumeBoost } from '../routes/boost/boost.js'; // PodSleep#" "$ROUTES"
    sed -i "s#^\(\s*\)app.use('/api/', alarm);#\1app.use('/api/', boost); // PodSleep\n\1resumeBoost(); // PodSleep\n\1app.use('/api/', alarm);#" "$ROUTES"
  else
    echo "This Free Sleep version's routes file looks different. Screens installed; Cold Shot / Heat Boost skipped."
  fi
fi
echo "$VERSION" > /home/dac/podsleep-version
chown -R dac:dac "$SERVER/public" "$SERVER/dist/routes/boost" "$ROUTES" "$BACKUP" /home/dac/podsleep-version

# 4. Restart Free Sleep and check it comes back. If it doesn't, put Free Sleep back automatically.
systemctl restart free-sleep
for i in $(seq 1 45); do
  sleep 2
  if curl -fs http://localhost:3000/api/boost >/dev/null; then echo "PodSleep $VERSION installed. Cold Shot / Heat Boost: working."; exit 0; fi
  if curl -fs http://localhost:3000/ | grep -q PodSleep; then READY=1; fi
done
if [ -n "$READY" ]; then echo "PodSleep $VERSION installed, but Cold Shot / Heat Boost isn't answering."; exit 2; fi
echo "Free Sleep didn't come back after installing."
restore
echo "Free Sleep restored. Nothing else was changed."; exit 3
