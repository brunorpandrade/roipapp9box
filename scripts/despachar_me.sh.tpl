# ROIP APP 9BOX — scripts/despachar_me.sh.tpl (ME-050/51, N2/S221;
# CC057 aplicada em ME-065).
#
# Template CONGELADO do comando de despacho ao Manus. Uso canonico:
# copiar este arquivo, substituir os slots `{{...}}` pelos valores da
# ME em questao, e colar o resultado no bloco de despacho.
#
# ESTE ARQUIVO NAO E EXECUTAVEL — e o esqueleto textual do comando.
# Ele nao entra no `npm run validate`, nao e chamado por outro script,
# nao aparece no manifesto. Existe apenas como fonte unica canonica
# para a preparacao do dispatch (RV-06 — bloco integral, nao delta).
#
# Slots canonicos:
#   {{ME_ID}}              — identificador canonico da ME (ex.: "ME-050/51").
#   {{HEAD_BASELINE}}      — SHA-1 do HEAD do repo no momento da composicao.
#   {{ZIP_FILENAME}}       — nome do arquivo ZIP anexado ao dispatch.
#   {{ZIP_SHA256}}         — SHA-256 do ZIP.
#   {{ZIP_BYTES}}          — tamanho do ZIP em bytes.
#   {{MANIFESTO_LINHAS}}   — numero de linhas do `manifest.sha256`.
#   {{ALVO_COUNT}}         — quantidade de arquivos [NOVO]/[EDIT].
#   {{ARTEFATOS_LIST}}     — lista textual dos artefatos (uma linha por
#                            arquivo, prefixada por [NOVO] ou [EDIT]).
#   {{VITEST_TEST_FILES}}  — contagem de arquivos de teste do vitest.
#   {{VITEST_TESTS}}       — contagem de tests do vitest.
#
# =====================================================================

DESPACHO CANONICO — {{ME_ID}}

Manus, aplicar a {{ME_ID}} contra o repositorio
`https://github.com/brunorpandrade/roipapp9box.git`, a partir do
HEAD baseline `{{HEAD_BASELINE}}`.

NOTA CANONICA S006 (L104 canonizada em ME-064).

Arquivos operacionais S006 canonicamente NAO entram no repositorio
em nenhum dispatch (nem aplicacao, nem commit). Higienizacao S006
pre-commit lista bit-exact:

  - `{{ZIP_FILENAME}}` (ZIP anexado ao dispatch);
  - `manifest.sha256`;
  - `retorno_{{ME_ID}}*.md` (retornos gerados por este dispatch);
  - qualquer `*.md` em raiz do repositorio nao presente no manifesto
    canonico da ME.

Regra canonica: qualquer artefato de retorno gerado pelo Manus e
operacional S006 e nunca entra em `git add`. Detectada via bug
canonico do dispatch de commit ME-064 (RV-05 canonica ao detectar
`retorno_meXXX.md` staged).

PASSO 1 — Preparar o clone (L105 canonizada em ME-064).

  git clone https://github.com/brunorpandrade/roipapp9box.git
  cd roipapp9box
  git checkout main
  git fetch origin
  git reset --hard origin/main
  [ "$(git rev-parse HEAD)" = "{{HEAD_BASELINE}}" ] || { echo "STOP — HEAD mismatch: esperado {{HEAD_BASELINE}}, obtido $(git rev-parse HEAD)"; exit 1; }

Confirmar que `git rev-parse HEAD` retorna EXATAMENTE
`{{HEAD_BASELINE}}` antes de prosseguir. Divergencia = STOP e reportar
sem aplicar. NUNCA usar `git checkout <SHA>` (produz detached HEAD =
commit orfao + push "Everything up-to-date" falso).

PASSO 2 — Descompactar o ZIP.

Anexo ao dispatch: `{{ZIP_FILENAME}}` ({{ZIP_BYTES}} bytes,
sha256 `{{ZIP_SHA256}}`).

Confirmar o hash do proprio ZIP antes de descompactar:

  sha256sum {{ZIP_FILENAME}}
  # esperado: {{ZIP_SHA256}}

Descompactar sobrescrevendo no clone:

  unzip -o {{ZIP_FILENAME}}

O ZIP contem {{ALVO_COUNT}} arquivo(s) alvo + `manifest.sha256`
({{MANIFESTO_LINHAS}} linhas).

PASSO 3 — Verificar aplicacao contra o manifesto.

Executar o script canonico versionado no repositorio:

  bash scripts/verificar_me.sh manifest.sha256

Sucesso canonico:
  - RC=0.
  - Bloco de retorno com HEAD_preservado=SIM.
  - {{VITEST_TEST_FILES}}.
  - {{VITEST_TESTS}}.
  - validate 10/10 PASS.

PASSO 4 — Retorno canonico ao Bruno.

Gerar `retorno_{{ME_ID}}.md` contendo:
  - O output LITERAL de `bash scripts/verificar_me.sh manifest.sha256`
    (nao parafrasear, nao resumir).
  - O output LITERAL de `git rev-parse HEAD` (deve bater com
    {{HEAD_BASELINE}} — nao commitar).
  - Confirmacao de que os {{ALVO_COUNT}} arquivos foram aplicados sem
    edicao (hashes conferem com o manifesto — RV-02).

Enviar `retorno_{{ME_ID}}.md` como upload ao Bruno.

NAO COMMITAR. O commit vira em bloco separado apos a auditoria RV-01
do Bruno. Neste dispatch de aplicacao, `retorno_{{ME_ID}}.md` e
operacional S006 e nao entra no repositorio (conforme NOTA CANONICA
S006 acima).

ARTEFATOS CANONICOS DESTA ME:

{{ARTEFATOS_LIST}}

=====================================================================
