// ROIP APP 9BOX — teste de integracao `departments` (ME-010).
//
// A tabela `departments` eh semeada pela migration com 19 linhas
// imutaveis (§15.1). Este teste apenas LE — nao insere, nao atualiza,
// nao remove — e confirma a ordem e a grafia canonicas.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { getDepartmentByName, listAllDepartments } from '../../src/server/services/departments';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

// Ordem e grafia canonicas do §15.1 do DOC 01. Um caractere fora do lugar
// aqui reprova o teste — invariante permanente do repo.
const EXPECTED_NAMES = [
  'Comercial',
  'Marketing',
  'Operações',
  'Produção',
  'Logística',
  'Compras',
  'Financeiro',
  'Contabilidade',
  'Recursos Humanos',
  'Tecnologia da Informação',
  'Jurídico',
  'Qualidade',
  'Manutenção',
  'Projetos',
  'Atendimento ao Cliente',
  'Pós-venda',
  'Administrativo',
  'Diretoria',
  'Outros',
] as const;

describe('service departments (ME-010)', () => {
  let client: RoipDbClient;

  beforeAll(() => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    await closeDbClient(client);
  });

  it('listAllDepartments retorna exatamente 19 linhas na ordem canonica', async () => {
    const rows = await listAllDepartments(client.db);
    expect(rows).toHaveLength(19);
    const names = rows.map((r) => r.nome);
    expect(names).toEqual([...EXPECTED_NAMES]);
    // Sequencia contigua de ids 1..19 (imposta pela ordem do seed em M003).
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it('getDepartmentByName resolve todos os 19 nomes canonicos', async () => {
    for (const nome of EXPECTED_NAMES) {
      const dept = await getDepartmentByName(client.db, nome);
      if (!dept) throw new Error(`getDepartmentByName retornou undefined para "${nome}"`);
      expect(dept.nome).toBe(nome);
    }
  });

  it('getDepartmentByName retorna undefined para nome inexistente', async () => {
    const dept = await getDepartmentByName(client.db, 'DepartamentoInventado');
    expect(dept).toBeUndefined();
  });
});
