#\!/bin/bash
PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"
if [ \! -f "$PLIST" ]; then exit 0; fi
/usr/libexec/PlistBuddy -c "Set :CFBundleName Relay" "$PLIST" 2>/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Relay" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Relay" "$PLIST" 2>/dev/null
echo "Patched Electron menu bar name to Relay"
