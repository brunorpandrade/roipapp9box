// ROIP APP 9BOX — teste de integracao `superAdmins` (ME-012).
//
// Roda contra a base efemera `roip_test` semeada pelo globalSetup
// (ME-010). A fixture `superAdmins.id=1` sempre esta presente. Este
// arquivo NAO cria company local (o service superAdmins nao depende de
// companies): apenas insere Super Admins adicionais (id > 1) via API
// tipada do Drizzle e restaura o estado inicial no `afterAll` / limpa em
// `beforeEach` (L32 — apagar tudo com `id != 1` para preservar a
// fixture).

import { ne } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { superAdmins } from '../../src/db/schema';
import {
  getSuperAdminByEmail,
  getSuperAdminById,
  listSuperAdmins,
} from '../../src/server/services/superAdmins';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const FIXTURE_ID = 1;
const FIXTURE_EMAIL = 'fixture-test@roip.local';

describe('service superAdmins (ME-012)', () => {
  let client: RoipDbClient;

  beforeAll(() => {
    client = createDbClient(TEST_URL);
  });

  afterAll(async () => {
    // Restaura estado inicial: apenas a fixture id=1 permanece. Impede
    // que este arquivo arraste Super Admins remanescentes para arquivos
    // posteriores (L32).
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_ID));
    await closeDbClient(client);
  });

  beforeEach(async () => {
    // Isolamento entre casos: mantem apenas a fixture.
    await client.db.delete(superAdmins).where(ne(superAdmins.id, FIXTURE_ID));
  });

  it('getSuperAdminById retorna a fixture id=1', async () => {
    const row = await getSuperAdminById(client.db, FIXTURE_ID);
    expect(row).toBeDefined();
    expect(row?.id).toBe(FIXTURE_ID);
    expect(row?.email).toBe(FIXTURE_EMAIL);
  });

  it('getSuperAdminById retorna undefined para id inexistente', async () => {
    const row = await getSuperAdminById(client.db, 99_999);
    expect(row).toBeUndefined();
  });

  it('getSuperAdminByEmail retorna a fixture pelo email canonico', async () => {
    const row = await getSuperAdminByEmail(client.db, FIXTURE_EMAIL);
    expect(row).toBeDefined();
    expect(row?.id).toBe(FIXTURE_ID);
    expect(row?.name).toBe('Fixture Super Admin (test)');
  });

  it('getSuperAdminByEmail retorna undefined para email inexistente', async () => {
    const row = await getSuperAdminByEmail(client.db, 'nao-existe@roip.local');
    expect(row).toBeUndefined();
  });

  it('listSuperAdmins retorna a fixture quando esta e a unica linha', async () => {
    const rows = await listSuperAdmins(client.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(FIXTURE_ID);
  });

  it('listSuperAdmins retorna em ordem crescente de id apos multiplos inserts', async () => {
    // Insere dois novos Super Admins com ids > 1.
    await client.db.insert(superAdmins).values([
      { name: 'Segundo Super Admin', email: 'segundo@roip.local', passwordHash: 'x' },
      { name: 'Terceiro Super Admin', email: 'terceiro@roip.local', passwordHash: 'x' },
    ]);
    const rows = await listSuperAdmins(client.db);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.id).toBe(FIXTURE_ID);
    // ids adicionais em ordem crescente.
    expect(rows[1]?.id).toBeLessThan(rows[2]?.id ?? 0);
  });

  it('email duplicado viola UNIQUE (§4.1)', async () => {
    await expect(
      client.db.insert(superAdmins).values({
        name: 'Duplicata',
        email: FIXTURE_EMAIL,
        passwordHash: 'x',
      }),
    ).rejects.toThrow();
  });
});
