#!/bin/sh
set -e

# This script replaces electron-builder's default after-install, which is what
# sets up Chromium's sandbox helper. Without it, on distros that restrict
# unprivileged user namespaces (Ubuntu 24.04+), the app aborts at launch:
# "The SUID sandbox helper binary was found, but is not configured correctly".
# Always SUID, as Chrome's own .deb does: electron-builder's "can I unshare?"
# probe passes on Ubuntu (unshare has its own AppArmor allowance) while
# Electron itself is still refused.
# npm run build:linux installs to /opt/StickyNotes: Electron's SUID sandbox
# launcher cannot exec a helper whose path contains a space.
SANDBOX='/opt/StickyNotes/chrome-sandbox'
if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX" || true
  chmod 4755 "$SANDBOX" || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  if [ -d /usr/share/icons/hicolor ]; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
  fi
fi

exit 0
