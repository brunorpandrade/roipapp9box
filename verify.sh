#!/bin/bash
set -euo pipefail

cd ~/dev/roipapp9box

echo "=== ME-087 VERIFY V2 ==="
echo ""

# V2 = V1 + smoke + eslint + prettier
# V1 = SHA-256 + tsc

# -----------------------------------------------------------------------
# Check 1: SHA-256 manifest
# -----------------------------------------------------------------------
echo "[1/11] SHA-256 manifest..."
if [ ! -f MANIFEST.sha256.me087 ]; then
  echo "FAIL: MANIFEST.sha256.me087 não encontrado"
  exit 1
fi
sha256sum -c MANIFEST.sha256.me087 || {
  echo "FAIL: Hash divergente"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 2: TypeScript (tsc --noEmit)
# -----------------------------------------------------------------------
echo "[2/11] TypeScript check..."
npx tsc --noEmit || {
  echo "FAIL: tsc --noEmit"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 3: ESLint
# -----------------------------------------------------------------------
echo "[3/11] ESLint..."
npx eslint src/app/nr1/ src/app/onboarding-lideres/ tests/integration/me087-*.test.ts || {
  echo "FAIL: ESLint"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 4: Prettier
# -----------------------------------------------------------------------
echo "[4/11] Prettier..."
npx prettier --check src/app/nr1/ src/app/onboarding-lideres/ tests/integration/me087-*.test.ts || {
  echo "FAIL: Prettier"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 5: Vitest integration (4 testes ME-087)
# -----------------------------------------------------------------------
echo "[5/11] Vitest (ME-087 integration)..."
npm run test -- --reporter=verbose tests/integration/me087-*.test.ts || {
  echo "FAIL: Vitest ME-087"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 6: PC1d audit — grep para hidCLevelsNominally
# -----------------------------------------------------------------------
echo "[6/11] PC1d audit — hidCLevelsNominally..."
grep -r "hidCLevelsNominally" src/server/routers/nr1.ts > /dev/null || {
  echo "FAIL: hidCLevelsNominally não encontrado em router"
  exit 1
}
grep -r "hidCLevelsNominally" src/app/nr1/ > /dev/null || {
  echo "FAIL: hidCLevelsNominally não encontrado em page.tsx"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 7: Bloqueio próprio audit — isSelfEmployee
# -----------------------------------------------------------------------
echo "[7/11] Bloqueio próprio audit — isSelfEmployee..."
grep -r "isSelfEmployee" src/server/routers/leaderOnboarding.ts > /dev/null || {
  echo "FAIL: isSelfEmployee não encontrado"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 8: Forbidden terms (RV-14)
# -----------------------------------------------------------------------
echo "[8/11] Forbidden terms check..."
grep -r "#" src/app/nr1/actions.ts | grep -v "^#!" && {
  echo "FAIL: Comentários # encontrados em actions.ts"
  exit 1
} || true
echo "PASS"

# -----------------------------------------------------------------------
# Check 9: Guard defense-in-depth (RV-14)
# -----------------------------------------------------------------------
echo "[9/11] Guard defense-in-depth audit..."
grep -r "session.role !== 'rh' && session.role !== 'rh_lider'" src/app/nr1/page.tsx > /dev/null || {
  echo "FAIL: Guard não encontrado"
  exit 1
}
echo "PASS"

# -----------------------------------------------------------------------
# Check 10: Canonical consistency (dual-route L123)
# -----------------------------------------------------------------------
echo "[10/11] Canonical consistency (L123 dual-route)..."
if [ ! -f src/app/super-admin/empresa/\[id\]/nr1/Nr1Client.tsx ]; then
  echo "FAIL: Super-admin Nr1Client não encontrado"
  exit 1
fi
if [ ! -f src/app/nr1/Nr1Client.tsx ]; then
  echo "FAIL: RH Nr1Client não encontrado"
  exit 1
fi
echo "PASS"

# -----------------------------------------------------------------------
# Check 11: Next.js build (smoke funcional)
# -----------------------------------------------------------------------
echo "[11/11] Next.js build (smoke)..."
npm run build || {
  echo "FAIL: Next.js build"
  exit 1
}
echo "PASS"

echo ""
echo "=== ALL 11 CHECKS PASSED ==="
