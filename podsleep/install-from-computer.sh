#!/bin/bash
# Run on a Mac or Linux computer on the same network as your Pod.
#   bash install-from-computer.sh                 install or update PodSleep
#   bash install-from-computer.sh uninstall       put Free Sleep's own screens back
#   POD=192.168.1.50 bash install-from-computer.sh   skip the address question
# Needs SSH access to the Pod (Free Sleep's setup_ssh.sh, port 8822).
cd "$(dirname "$0")"
SAVED="$HOME/.podsleep-pod"
if [ -z "$POD" ]; then
  LAST="$(cat "$SAVED" 2>/dev/null)"
  read -r -p "Your Pod's IP address${LAST:+ [$LAST]}: " POD
  POD="${POD:-$LAST}"
fi
[ -n "$POD" ] || { echo "No address given."; exit 1; }
echo "$POD" > "$SAVED"
SSH="ssh -p 8822 -o ConnectTimeout=10 root@$POD"
echo "Connecting to the Pod at $POD..."
$SSH 'rm -rf /tmp/podsleep && mkdir -p /tmp/podsleep' || { echo "Couldn't connect. Check the address and that SSH is set up (Free Sleep's setup_ssh.sh)."; exit 1; }
if [ "$1" = "uninstall" ]; then
  scp -P 8822 uninstall.sh "root@$POD:/tmp/podsleep/" && $SSH 'bash /tmp/podsleep/uninstall.sh'
else
  echo "Copying PodSleep (about 1 MB)..."
  scp -q -P 8822 -r public server install.sh uninstall.sh VERSION "root@$POD:/tmp/podsleep/" && $SSH 'bash /tmp/podsleep/install.sh'
  echo "Open http://$POD:3000 (reload if it was already open)."
fi
