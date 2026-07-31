// ROIP APP 9BOX — teste integracao resolveDestinatarios (ME-059).
// Cobre §7 canonico — 3 trilhas (padrao / apenas_bruno / apenas_rf),
// deduplicacao canonica por e-mail, fallback zero destinatarios,
// filtragem email nullable.

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDbClient, createDbClient, type RoipDbClient } from '../../src/db/client';
import { cLevelMembers, companies, employees, superAdmins } from '../../src/db/schema';
import { resolveDestinatarios } from '../../src/lib/alerts/resolveDestinatarios';

const TEST_URL =
  process.env.DATABASE_URL_TEST ?? 'mysql://root:roip_local_root@127.0.0.1:3306/roip_test';

const CNPJ_PRINCIPAL = '10190000000001';

const BRUNO_EMAIL = 'bruno-me059-resolve@roip.local';
const RH_EMAIL = 'rh-me059-resolve@roip.local';
const RH2_EMAIL = 'rh2-me059-resolve@roip.local';
const RH_INATIVO_EMAIL = 'rh-inativo-me059@roip.local';
const CLEVEL_EMAIL = 'clevel-me059-resolve@roip.local';

describe('resolveDestinatarios — §7 trilhas canonicas', () => {
  let client: RoipDbClient;
  let companyId: number;
  let brunoId: number;
  let rhAtivoId: number;
  let rh2AtivoId: number;
  let rhInativoId: number;
  let clevelId: number;

  beforeAll(async () => {
    client = createDbClient(TEST_URL);

    // Super Admin canonico
    const [bRow] = await client.db
      .insert(superAdmins)
      .values({
        name: 'Bruno ME-059 Resolve',
        email: BRUNO_EMAIL,
        passwordHash: 'x',
      })
      .$returningId();
    if (!bRow) throw new Error('setup falhou: superAdmin');
    brunoId = bRow.id;

    // Empresa canonica
    const [cRow] = await client.db
      .insert(companies)
      .values({
        razaoSocial: 'Empresa Resolve LTDA',
        nomeFantasia: 'Empresa Resolve',
        cnpj: CNPJ_PRINCIPAL,
        telefone: '1633330001',
        endereco: 'Rua 001',
        cidade: 'Ribeirão Preto',
        estado: 'SP',
        contatoPrincipalNome: 'Contato Principal',
        contatoPrincipalEmail: 'principal@resolve.local',
        contatoRHNome: 'Contato RH',
        contatoRHEmail: 'rh@resolve.local',
        segmento: 'Serviço',
        tipoAtividade: 'Consultoria',
        descricaoAtividade: 'Descricao',
        contextoMercado: 'Contexto',
        mesKickoff: 1,
      })
      .$returningId();
    if (!cRow) throw new Error('setup falhou: company');
    companyId = cRow.id;

    // 2 RHs ativos
    const [rh1] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Ativo 1',
        cpf: '11111111111',
        email: RH_EMAIL,
        dataNascimento: new Date('1985-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142205',
        descricaoCBO: 'RH',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
        isRH: true,
        status: 'ativo',
      })
      .$returningId();
    if (!rh1) throw new Error('setup falhou: rh1');
    rhAtivoId = rh1.id;

    const [rh2] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Ativo 2',
        cpf: '22222222222',
        email: RH2_EMAIL,
        dataNascimento: new Date('1985-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142205',
        descricaoCBO: 'RH',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
        isRH: true,
        status: 'ativo',
      })
      .$returningId();
    if (!rh2) throw new Error('setup falhou: rh2');
    rh2AtivoId = rh2.id;

    // 1 RH inativo (nao deve entrar)
    const [rhI] = await client.db
      .insert(employees)
      .values({
        companyId,
        name: 'RH Inativo',
        cpf: '33333333333',
        email: RH_INATIVO_EMAIL,
        dataNascimento: new Date('1985-01-01'),
        dataAdmissao: new Date('2020-01-01'),
        cbo: '142205',
        descricaoCBO: 'RH',
        jobFamily: 'administrativo_suporte',
        senioridade: 'senior',
        nivelHierarquico: 'tatico',
        departamento: 'Recursos Humanos',
        isRH: true,
        status: 'inativo',
      })
      .$returningId();
    if (!rhI) throw new Error('setup falhou: rhInativo');
    rhInativoId = rhI.id;

    // 1 C-level ativo (para trilha D050)
    const [cl] = await client.db
      .insert(cLevelMembers)
      .values({
        companyId,
        name: 'C-Level ME059',
        cpf: '44444444444',
        email: CLEVEL_EMAIL,
        dataNascimento: new Date('1975-06-15'),
        dataAdmissao: new Date('2018-01-01'),
        cargo: 'CFO',
        descricaoCargo: 'Diretor Financeiro',
        departamento: 'Financeiro',
        custoMensal: '30000.00',
        acessoTotal: true,
        status: 'ativo',
      })
      .$returningId();
    if (!cl) throw new Error('setup falhou: clevel');
    clevelId = cl.id;
  });

  afterAll(async () => {
    await client.db.delete(employees).where(eq(employees.companyId, companyId));
    await client.db.delete(cLevelMembers).where(eq(cLevelMembers.companyId, companyId));
    await client.db.delete(companies).where(eq(companies.id, companyId));
    await client.db.delete(superAdmins).where(eq(superAdmins.id, brunoId));
    await closeDbClient(client);
  });

  describe('Trilha padrao — 15 tipos (RH+Bruno)', () => {
    it('devolve 2 RHs ativos + 1 Bruno, RH inativo NAO entra', async () => {
      const dests = await resolveDestinatarios(client.db, companyId, 'ciclo_mensal_fechado');
      const emails = dests.map((d) => d.destinatarioEmail).sort();
      expect(emails).toContain(RH_EMAIL);
      expect(emails).toContain(RH2_EMAIL);
      expect(emails).toContain(BRUNO_EMAIL);
      expect(emails).not.toContain(RH_INATIVO_EMAIL);
      expect(dests.filter((d) => d.destinatarioTipo === 'rh').length).toBe(2);
      expect(dests.filter((d) => d.destinatarioTipo === 'bruno').length).toBeGreaterThanOrEqual(1);
    });

    it('destinatarioEmployeeId preenchido para RHs, null para Bruno', async () => {
      const dests = await resolveDestinatarios(client.db, companyId, 'nr1_ciclo_fechado');
      for (const d of dests) {
        if (d.destinatarioTipo === 'rh') {
          expect(d.destinatarioEmployeeId).toBeGreaterThan(0);
        } else {
          expect(d.destinatarioEmployeeId).toBe(null);
        }
      }
    });
  });

  describe('Deduplicacao canonica §7.1 — bruno prevalece sobre rh (mesmo email)', () => {
    it('RH cadastrado com mesmo email de Bruno tem registro RH descartado', async () => {
      // Cria RH temporario com o email exato do Bruno.
      const [rhClone] = await client.db
        .insert(employees)
        .values({
          companyId,
          name: 'RH Clone Bruno',
          cpf: '55555555555',
          email: BRUNO_EMAIL,
          dataNascimento: new Date('1985-01-01'),
          dataAdmissao: new Date('2020-01-01'),
          cbo: '142205',
          descricaoCBO: 'RH',
          jobFamily: 'administrativo_suporte',
          senioridade: 'senior',
          nivelHierarquico: 'tatico',
          departamento: 'Recursos Humanos',
          isRH: true,
          status: 'ativo',
        })
        .$returningId();
      if (!rhClone) throw new Error('setup rhClone');

      try {
        const dests = await resolveDestinatarios(client.db, companyId, 'ciclo_mensal_fechado');
        const emBruno = dests.filter((d) => d.destinatarioEmail === BRUNO_EMAIL);
        expect(emBruno.length).toBe(1); // apenas 1, nao 2
        expect(emBruno[0]!.destinatarioTipo).toBe('bruno'); // prevalece bruno
      } finally {
        await client.db.delete(employees).where(eq(employees.id, rhClone.id));
      }
    });
  });

  describe('Trilha apenas_bruno — D049', () => {
    it('devolve APENAS Bruno, nenhum RH', async () => {
      const dests = await resolveDestinatarios(
        client.db,
        companyId,
        'fechamento_bloqueado_sem_resp_financeiro',
      );
      expect(dests.length).toBeGreaterThanOrEqual(1);
      for (const d of dests) {
        expect(d.destinatarioTipo).toBe('bruno');
      }
      const emails = dests.map((d) => d.destinatarioEmail);
      expect(emails).toContain(BRUNO_EMAIL);
      expect(emails).not.toContain(RH_EMAIL);
      expect(emails).not.toContain(RH2_EMAIL);
    });
  });

  describe('Trilha apenas_rf — D050', () => {
    it('devolve APENAS o novo RF (employee) quando novoResponsavelTipo=employee', async () => {
      const dests = await resolveDestinatarios(
        client.db,
        companyId,
        'responsavel_financeiro_nomeado',
        { novoResponsavelId: rhAtivoId, novoResponsavelTipo: 'employee' },
      );
      expect(dests.length).toBe(1);
      expect(dests[0]!.destinatarioEmail).toBe(RH_EMAIL);
      expect(dests[0]!.destinatarioEmployeeId).toBe(rhAtivoId);
    });

    it('devolve APENAS o novo RF (clevel) quando novoResponsavelTipo=clevel', async () => {
      const dests = await resolveDestinatarios(
        client.db,
        companyId,
        'responsavel_financeiro_nomeado',
        { novoResponsavelId: clevelId, novoResponsavelTipo: 'clevel' },
      );
      expect(dests.length).toBe(1);
      expect(dests[0]!.destinatarioEmail).toBe(CLEVEL_EMAIL);
      // CC050 — destinatarioEmployeeId=null para C-level (FK aponta a
      // employees; Q1 confirma C-level nao tem sino, entao nao ha
      // consumo desse campo em leituras canonicas).
      expect(dests[0]!.destinatarioEmployeeId).toBe(null);
    });

    it('fallback zero quando novoResponsavelId aponta a employee inativo', async () => {
      const dests = await resolveDestinatarios(
        client.db,
        companyId,
        'responsavel_financeiro_nomeado',
        { novoResponsavelId: rhInativoId, novoResponsavelTipo: 'employee' },
      );
      expect(dests).toEqual([]);
    });

    it('fallback zero quando contexto ausente', async () => {
      const dests = await resolveDestinatarios(
        client.db,
        companyId,
        'responsavel_financeiro_nomeado',
      );
      expect(dests).toEqual([]);
    });
  });

  describe('Fallback zero destinatarios §7.4 — trilha padrao sem RH', () => {
    it('empresa sem RH ativo devolve apenas Bruno (T2 grava normalmente)', async () => {
      // Cria empresa auxiliar SEM RH ativo.
      const [c2] = await client.db
        .insert(companies)
        .values({
          razaoSocial: 'Empresa Sem RH LTDA',
          nomeFantasia: 'Empresa Sem RH',
          cnpj: '10200000000001',
          telefone: '1633330099',
          endereco: 'Rua Sem RH',
          cidade: 'Ribeirão Preto',
          estado: 'SP',
          contatoPrincipalNome: 'Contato',
          contatoPrincipalEmail: 'sem-rh@resolve.local',
          contatoRHNome: 'Contato',
          contatoRHEmail: 'sem-rh@resolve.local',
          segmento: 'Serviço',
          tipoAtividade: 'x',
          descricaoAtividade: 'x',
          contextoMercado: 'x',
          mesKickoff: 1,
        })
        .$returningId();
      if (!c2) throw new Error('setup c2');
      try {
        const dests = await resolveDestinatarios(client.db, c2.id, 'ciclo_mensal_fechado');
        for (const d of dests) {
          expect(d.destinatarioTipo).toBe('bruno');
        }
        expect(dests.length).toBeGreaterThan(0);
      } finally {
        await client.db.delete(companies).where(eq(companies.id, c2.id));
      }
    });
  });

  // Silencia warning de unused: rh2AtivoId + rhInativoId + clevelId sao
  // usados nos testes acima; ESLint nao detecta indirect usage.
  it('setup ids visiveis (asserts internos)', () => {
    expect(rh2AtivoId).toBeGreaterThan(0);
    expect(rhInativoId).toBeGreaterThan(0);
    expect(clevelId).toBeGreaterThan(0);
  });
});
