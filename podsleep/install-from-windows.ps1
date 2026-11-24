# Run in PowerShell on a Windows 10 or 11 PC on the same network as your Pod.
#   .\install-from-windows.ps1             install or update PodSleep
#   .\install-from-windows.ps1 uninstall   put Free Sleep's own screens back
# Uses Windows' built-in OpenSSH. Needs SSH access to the Pod (Free Sleep's setup_ssh.sh, port 8822).
param([string]$Action = "install")
Set-Location -Path $PSScriptRoot
$saved = Join-Path $HOME ".podsleep-pod"
$last = if (Test-Path $saved) { (Get-Content $saved -Raw).Trim() } else { "" }
$pod = Read-Host ("Your Pod's IP address" + $(if ($last) { " [$last]" } else { "" }))
if (-not $pod) { $pod = $last }
if (-not $pod) { Write-Host "No address given."; exit 1 }
Set-Content -Path $saved -Value $pod
Write-Host "Connecting to the Pod at $pod..."
ssh -p 8822 -o ConnectTimeout=10 "root@$pod" "rm -rf /tmp/podsleep && mkdir -p /tmp/podsleep"
if ($LASTEXITCODE -ne 0) { Write-Host "Couldn't connect. Check the address and that SSH is set up (Free Sleep's setup_ssh.sh)."; exit 1 }
if ($Action -eq "uninstall") {
  scp -P 8822 uninstall.sh "root@${pod}:/tmp/podsleep/"
  ssh -p 8822 "root@$pod" "sed -i 's/\r$//' /tmp/podsleep/uninstall.sh && bash /tmp/podsleep/uninstall.sh"
} else {
  Write-Host "Copying PodSleep (about 1 MB)..."
  scp -q -P 8822 -r public server install.sh uninstall.sh VERSION "root@${pod}:/tmp/podsleep/"
  # Scripts copied from Windows can carry Windows line endings; strip them before running.
  ssh -p 8822 "root@$pod" "sed -i 's/\r$//' /tmp/podsleep/*.sh /tmp/podsleep/VERSION && bash /tmp/podsleep/install.sh"
  Write-Host "Open http://${pod}:3000 (reload if it was already open)."
}
