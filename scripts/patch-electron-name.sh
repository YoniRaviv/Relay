#!/bin/bash
DIST_DIR="node_modules/electron/dist"
ELECTRON_APP="$DIST_DIR/Electron.app"
RELAY_APP="$DIST_DIR/Relay.app"

# Resolve which .app exists (handle re-runs)
if [ -L "$ELECTRON_APP" ]; then
  # Previous run left a symlink — remove it, use the real Relay.app
  rm -f "$ELECTRON_APP"
  APP_DIR="$RELAY_APP"
elif [ -d "$RELAY_APP" ] && [ ! -d "$ELECTRON_APP" ]; then
  APP_DIR="$RELAY_APP"
elif [ -d "$ELECTRON_APP" ]; then
  APP_DIR="$ELECTRON_APP"
else
  echo "No Electron.app found, skipping patch"
  exit 0
fi

PLIST="$APP_DIR/Contents/Info.plist"
if [ ! -f "$PLIST" ]; then exit 0; fi

# Patch plist keys
/usr/libexec/PlistBuddy -c "Set :CFBundleName Relay" "$PLIST" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Relay" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Relay" "$PLIST" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.relay.app" "$PLIST" 2>/dev/null

# Rename the binary so the process name becomes "Relay".
# Leave a symlink at the old name so internal references still resolve.
MACOS_DIR="$APP_DIR/Contents/MacOS"
if [ -f "$MACOS_DIR/Electron" ] && [ ! -L "$MACOS_DIR/Electron" ]; then
  mv "$MACOS_DIR/Electron" "$MACOS_DIR/Relay"
  ln -s Relay "$MACOS_DIR/Electron"
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Relay" "$PLIST" 2>/dev/null

# Overwrite ALL icon files used by Electron with ours
RESOURCES_DIR="$APP_DIR/Contents/Resources"
if [ -f "public/icon.icns" ]; then
  cp -f public/icon.icns "$RESOURCES_DIR/electron.icns"
  cp -f public/icon.icns "$RESOURCES_DIR/app.icns"
fi

# Rename the .app bundle so macOS dock shows "Relay" on hover
if [ "$APP_DIR" = "$ELECTRON_APP" ]; then
  mv "$ELECTRON_APP" "$RELAY_APP"
  APP_DIR="$RELAY_APP"
fi

# Update electron's path.txt so it resolves directly (no symlinks, no trailing newline)
printf "Relay.app/Contents/MacOS/Relay" > "node_modules/electron/path.txt"

# Touch the .app to invalidate macOS icon cache
touch "$APP_DIR"
# Re-register with Launch Services
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_DIR" 2>/dev/null

echo "Patched Electron bundle for Relay (name, icon, executable, bundle name)"
