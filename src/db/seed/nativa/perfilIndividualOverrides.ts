// ROIP APP 9BOX — perfis variados do Perfil Individual da Nativa demo
// (ME escores-demo, ciclo 2). Fonte UNICA dos 24 subvetores de 7
// colaboradores (6 employees + 1 C-level), consumida por:
//   - scripts/vary-perfil-individual-nativa.ts (UPDATE no banco atual);
//   - src/db/seed/nativa/loadFixtures.ts (override no reseed — metodo C).
// RV-14: sem duplicacao — os dois pontos importam daqui.
//
// Faixas §5.4: 0-20 muito baixo, 21-40 baixo, 41-60 medio, 61-80 alto,
// 81-100 muito alto. Perfis desenhados por arquetipo para dar contraste
// na demo. NAO inclui colaboradores com relatorio de IA ja gerado.

export interface PerfilEscoresNativa {
  readonly userType: 'employee' | 'clevel';
  readonly userId: number;
  readonly nome: string;
  readonly post_assert: number;
  readonly post_tarefas: number;
  readonly post_pessoas: number;
  readonly post_pressao: number;
  readonly est_abert: number;
  readonly est_disc: number;
  readonly est_ext: number;
  readonly est_amab: number;
  readonly est_estab: number;
  readonly mot_maestria: number;
  readonly mot_lideranca: number;
  readonly mot_autonomia: number;
  readonly mot_seguranca: number;
  readonly mot_proposito: number;
  readonly equ_autocons: number;
  readonly equ_autogest: number;
  readonly equ_leitura: number;
  readonly equ_influencia: number;
  readonly ass_sabed: number;
  readonly ass_coragem: number;
  readonly ass_humanid: number;
  readonly ass_justica: number;
  readonly ass_temper: number;
  readonly ass_transc: number;
  readonly vetorDominante: string;
  readonly vetorSustentacao: string;
  readonly vetorNegligenciado: string;
  readonly top3: readonly string[];
}

export const PERFIS_VARIADOS_NATIVA: readonly PerfilEscoresNativa[] = [
  // 1. Ademir Prado (52) — executor operacional.
  {
    userType: 'employee',
    userId: 52,
    nome: 'Ademir Prado',
    post_assert: 48,
    post_tarefas: 82,
    post_pessoas: 44,
    post_pressao: 66,
    est_abert: 38,
    est_disc: 84,
    est_ext: 40,
    est_amab: 58,
    est_estab: 70,
    mot_maestria: 62,
    mot_lideranca: 22,
    mot_autonomia: 40,
    mot_seguranca: 78,
    mot_proposito: 52,
    equ_autocons: 54,
    equ_autogest: 66,
    equ_leitura: 46,
    equ_influencia: 30,
    ass_sabed: 50,
    ass_coragem: 44,
    ass_humanid: 56,
    ass_justica: 62,
    ass_temper: 72,
    ass_transc: 40,
    vetorDominante: 'est_disc',
    vetorSustentacao: 'post_tarefas',
    vetorNegligenciado: 'mot_lideranca',
    top3: ['est_disc', 'post_tarefas', 'mot_seguranca'],
  },
  // 2. Camila Batista (6, tatico) — lideranca emergente.
  {
    userType: 'employee',
    userId: 6,
    nome: 'Camila Batista',
    post_assert: 74,
    post_tarefas: 64,
    post_pessoas: 78,
    post_pressao: 70,
    est_abert: 66,
    est_disc: 68,
    est_ext: 72,
    est_amab: 74,
    est_estab: 76,
    mot_maestria: 60,
    mot_lideranca: 86,
    mot_autonomia: 70,
    mot_seguranca: 48,
    mot_proposito: 82,
    equ_autocons: 78,
    equ_autogest: 80,
    equ_leitura: 82,
    equ_influencia: 84,
    ass_sabed: 70,
    ass_coragem: 74,
    ass_humanid: 80,
    ass_justica: 76,
    ass_temper: 64,
    ass_transc: 58,
    vetorDominante: 'mot_lideranca',
    vetorSustentacao: 'equ_influencia',
    vetorNegligenciado: 'mot_seguranca',
    top3: ['mot_lideranca', 'equ_influencia', 'ass_humanid'],
  },
  // 3. Marcio Fernandes (9, tatico) — tecnico especialista.
  {
    userType: 'employee',
    userId: 9,
    nome: 'Marcio Fernandes',
    post_assert: 52,
    post_tarefas: 80,
    post_pessoas: 40,
    post_pressao: 62,
    est_abert: 74,
    est_disc: 82,
    est_ext: 30,
    est_amab: 50,
    est_estab: 64,
    mot_maestria: 92,
    mot_lideranca: 34,
    mot_autonomia: 76,
    mot_seguranca: 58,
    mot_proposito: 66,
    equ_autocons: 68,
    equ_autogest: 62,
    equ_leitura: 44,
    equ_influencia: 38,
    ass_sabed: 84,
    ass_coragem: 54,
    ass_humanid: 46,
    ass_justica: 60,
    ass_temper: 70,
    ass_transc: 56,
    vetorDominante: 'mot_maestria',
    vetorSustentacao: 'ass_sabed',
    vetorNegligenciado: 'est_ext',
    top3: ['mot_maestria', 'ass_sabed', 'est_disc'],
  },
  // 4. Gabriel Oliveira (26) — risco/atencao.
  {
    userType: 'employee',
    userId: 26,
    nome: 'Gabriel Oliveira',
    post_assert: 34,
    post_tarefas: 38,
    post_pessoas: 42,
    post_pressao: 24,
    est_abert: 40,
    est_disc: 30,
    est_ext: 44,
    est_amab: 52,
    est_estab: 26,
    mot_maestria: 36,
    mot_lideranca: 28,
    mot_autonomia: 46,
    mot_seguranca: 40,
    mot_proposito: 32,
    equ_autocons: 30,
    equ_autogest: 22,
    equ_leitura: 38,
    equ_influencia: 34,
    ass_sabed: 36,
    ass_coragem: 30,
    ass_humanid: 48,
    ass_justica: 44,
    ass_temper: 28,
    ass_transc: 34,
    vetorDominante: 'est_amab',
    vetorSustentacao: 'mot_autonomia',
    vetorNegligenciado: 'equ_autogest',
    top3: ['est_amab', 'post_pessoas', 'mot_autonomia'],
  },
  // 5. Marina Lopes (46) — alto impacto.
  {
    userType: 'employee',
    userId: 46,
    nome: 'Marina Lopes',
    post_assert: 80,
    post_tarefas: 84,
    post_pessoas: 76,
    post_pressao: 82,
    est_abert: 78,
    est_disc: 82,
    est_ext: 70,
    est_amab: 74,
    est_estab: 84,
    mot_maestria: 82,
    mot_lideranca: 72,
    mot_autonomia: 80,
    mot_seguranca: 60,
    mot_proposito: 78,
    equ_autocons: 82,
    equ_autogest: 84,
    equ_leitura: 78,
    equ_influencia: 76,
    ass_sabed: 80,
    ass_coragem: 78,
    ass_humanid: 74,
    ass_justica: 82,
    ass_temper: 76,
    ass_transc: 70,
    vetorDominante: 'post_tarefas',
    vetorSustentacao: 'equ_autogest',
    vetorNegligenciado: 'mot_seguranca',
    top3: ['post_tarefas', 'mot_maestria', 'equ_autogest'],
  },
  // 6. Jessica Moura (36) — potencial subutilizado.
  {
    userType: 'employee',
    userId: 36,
    nome: 'Jessica Moura',
    post_assert: 34,
    post_tarefas: 44,
    post_pessoas: 40,
    post_pressao: 38,
    est_abert: 78,
    est_disc: 72,
    est_ext: 48,
    est_amab: 64,
    est_estab: 70,
    mot_maestria: 80,
    mot_lideranca: 42,
    mot_autonomia: 74,
    mot_seguranca: 50,
    mot_proposito: 76,
    equ_autocons: 66,
    equ_autogest: 62,
    equ_leitura: 58,
    equ_influencia: 40,
    ass_sabed: 68,
    ass_coragem: 38,
    ass_humanid: 54,
    ass_justica: 58,
    ass_temper: 60,
    ass_transc: 62,
    vetorDominante: 'mot_maestria',
    vetorSustentacao: 'est_abert',
    vetorNegligenciado: 'post_assert',
    top3: ['mot_maestria', 'est_abert', 'mot_proposito'],
  },
  // 7. Eduardo Almeida da Silva (CEO, clevel id 1) — executivo estrategico.
  {
    userType: 'clevel',
    userId: 1,
    nome: 'Eduardo Almeida da Silva',
    post_assert: 88,
    post_tarefas: 46,
    post_pessoas: 80,
    post_pressao: 84,
    est_abert: 86,
    est_disc: 64,
    est_ext: 78,
    est_amab: 68,
    est_estab: 82,
    mot_maestria: 66,
    mot_lideranca: 94,
    mot_autonomia: 90,
    mot_seguranca: 34,
    mot_proposito: 92,
    equ_autocons: 84,
    equ_autogest: 82,
    equ_leitura: 86,
    equ_influencia: 90,
    ass_sabed: 88,
    ass_coragem: 86,
    ass_humanid: 76,
    ass_justica: 80,
    ass_temper: 62,
    ass_transc: 74,
    vetorDominante: 'mot_lideranca',
    vetorSustentacao: 'mot_proposito',
    vetorNegligenciado: 'mot_seguranca',
    top3: ['mot_lideranca', 'mot_proposito', 'equ_influencia'],
  },
];

/** Media dos 4 subvetores de equilibrio (equ_indice canonico §5.4.5). */
export function mediaEquNativa(p: PerfilEscoresNativa): number {
  return (p.equ_autocons + p.equ_autogest + p.equ_leitura + p.equ_influencia) / 4;
}

/** Override por (userType, userId). null quando nao ha perfil variado. */
export function getPerfilVariadoNativa(
  userType: 'employee' | 'clevel',
  userId: number,
): PerfilEscoresNativa | null {
  return PERFIS_VARIADOS_NATIVA.find((p) => p.userType === userType && p.userId === userId) ?? null;
}
