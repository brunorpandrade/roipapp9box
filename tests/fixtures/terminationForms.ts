// ROIP APP 9BOX — formularios de desligamento validos para testes
// (ME-fila6 D2). Usados pelas suites que exercitam `employees.inactivate`
// e `leadershipTransfer.execute`, que passaram a exigir o formulario.

import type {
  FormularioInvoluntario,
  FormularioVoluntario,
} from '../../src/lib/shared/terminationForms';

export const FORMULARIO_VOLUNTARIO_TESTE: FormularioVoluntario = {
  tipo: 'voluntario',
  motivoPrincipal: 'proposta_externa',
  motivosSecundarios: ['falta_perspectiva_carreira'],
  notaConfiancaLideranca: 4,
  notaReconhecimento: 3,
  notaRemuneracaoJusta: 2,
  notaOportunidadeCrescimento: 2,
  notaClarezaExpectativas: 4,
  notaAmbienteEquipe: 5,
  voltariaTrabalhar: 'talvez',
  recomendariaEmpresa: 'sim',
  destino: 'mesmo_setor',
  oQuePoderiaReter:
    'Um plano de carreira com etapas claras e uma revisão salarial alinhada ao mercado ' +
    'teriam mantido o colaborador na empresa.',
  comentariosAdicionais: null,
};

export const FORMULARIO_INVOLUNTARIO_TESTE: FormularioInvoluntario = {
  tipo: 'involuntario',
  categoria: 'reducao_quadro',
  houveFeedbackFormal: 'nao_aplicavel',
  nivelDocumentacao: 4,
  justificativa:
    'Reestruturação da área comercial aprovada pela diretoria em reunião registrada em ata, ' +
    'com extinção de duas posições do mesmo nível.',
  necessidadeReposicao: false,
};
