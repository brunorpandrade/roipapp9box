#!/bin/bash
set -euo pipefail

cd ~/dev/roipapp9box

git checkout main
git pull
git reset --hard 4aeec84318ee92772716f98ac64a295ec12ffe18

mkdir -p src/app/nr1
mkdir -p src/app/onboarding-lideres
mkdir -p tests/integration

unzip -o ~/Downloads/roip_me087_dispatch.zip

npm ci
npm run validate

echo "✓ ME-087 applied successfully"
