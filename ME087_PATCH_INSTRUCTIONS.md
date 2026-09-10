# ME-087 — Instruções de Patch Manual para Routers

## Resumo

Esta ME cria rotas RH `/nr1` e adapta `/onboarding-lideres` com bloqueio próprio. Os routers tRPC já possuem `roleProcedure(['super_admin', 'rh', 'rh_lider'])`, logo estão estruturalmente prontos. Contudo, **2 modificações são necessárias** para implementar PC1d:

### Modificação 1: `src/server/routers/nr1.ts` — adicionar `hidCLevelsNominally` ao schema

**Localização:** linhas ~173–178 (schema `GET_CYCLE_DETAILS_INPUT_SCHEMA_NR1`)

**Ação:**

```diff
export const GET_CYCLE_DETAILS_INPUT_SCHEMA_NR1 = z.object({
  companyId: z.number().int().positive(),
  cicloDbId: z.number().int().positive().optional(),
  fatorId: z.number().int().min(1).max(FATORES_NR1.length).optional(),
+ hidCLevelsNominally: z.boolean().default(false),
});

export const GET_COLLECTION_STATUS_INPUT_SCHEMA_NR1 = z.object({
  cicloDbId: z.number().int().positive(),
+ hidCLevelsNominally: z.boolean().default(false),
});
```

**Justificativa:** PC1d — permitir passagem do flag de omissão nominal de C-levels via input tRPC.

---

### Modificação 2: `src/server/routers/nr1.ts` — propagar `hidCLevelsNominally` no procedimento `getCycleDetails`

**Localização:** linhas ~420–500 (dentro do mutation `getCycleDetails`)

**Ação:** Após receber `input.hidCLevelsNominally`, passá-lo ao serviço ou lógica que constrói a lista nominal de respondentes.

```typescript
const cycleDetails = await getCycleDetailsService(ctx.db, {
  companyId: input.companyId,
  cicloDbId: selectedCiclo.id,
  fatorId: input.fatorId,
  hidCLevelsNominally: input.hidCLevelsNominally, // <-- adicionar
});
```

**Justificativa:** Aplicar PC1d no backend — serviço filtra C-levels nominalmente quando flag é true.

---

### Modificação 3 (opcional): `src/server/routers/nr1.ts` — propagar em `getCollectionStatus`

**Ação similar:** Passar `hidCLevelsNominally` para a lógica de listagem de respondentes.

---

### Modificação 4: `src/app/super-admin/empresa/[id]/nr1/Nr1Client.tsx` — adicionar prop `variant`

**Localização:** assinatura do componente

**Ação:**

```diff
- export function Nr1Client(props: {
+ export function Nr1Client(props: {
+   variant?: 'rh' | 'super_admin';
    cycleDetails: CycleDetailsPayload;
    // ... outros props
  }): JSX.Element {
+   const v = props.variant ?? 'super_admin';
+   // Usar `v` para adaptar renderização (ex: ocultar nomes em listas nominais se v='rh')
    return (/* ... */);
  }
```

**Justificativa:** L125 — componente parametrizado por variant, sem código duplicado.

---

## Verificação automática

O `verify.sh` V2 dessa ME inclui:

1. Audit dirigido: grep para confirmar `hidCLevelsNominally` em schema.
2. Typecheck: `tsc --noEmit` para validar tipos (erro se modificação incompleta).
3. Teste vitest: `npm run test -- me087-*.test.ts`.

Se todos os 3 passarem, as modificações foram aplicadas corretamente.

---

## Nota final

**Criticidade:** Estas 4 modificações são **obrigatórias** para ME-087. Sem elas, a rota `/nr1` RH não filtrará C-levels nominalmente (PC1d não será aplicada).

Aplicar no arquivo-fonte antes de `npm run validate` e commit.
