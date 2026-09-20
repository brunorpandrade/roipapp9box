'use client';

// ROIP APP 9BOX — host client da rota Bruno-only do relatorio de Perfil
// Individual de um C-level (D-ENTRY-2, ME §8.05). Reusa o modal
// `PerfilIndividualRelatorioModal` com `userType='clevel'`; a autorizacao
// real (PC1e = Bruno) e reaplicada server-side pela action/`getReport`.
// O C-level NAO possui dashboard individual (dashboard de equipe e Fase
// 4) — esta rota entrega apenas o Perfil.
//
// Alcancada pelo botao [Ver Perfil Individual] do no C-level no
// organograma de Bruno. Ao fechar, retorna ao organograma da empresa.
//
// Nivel/departamento de exibicao seguem a identidade canonica do C-level
// no `getReport` (nivel 'Estrategico', departamento 'Alta lideranca').
//
// RV-14: um statement por linha, largura maxima 100.

import { useRouter } from 'next/navigation';
import { useCallback, type JSX } from 'react';

import { PerfilIndividualRelatorioModal } from '../../[id]/PerfilIndividualRelatorioModal';

interface Props {
  readonly companyId: number;
  readonly cLevelId: number;
  readonly nome: string;
  readonly cargo: string;
}

export function ClevelPerfilClient(props: Props): JSX.Element {
  const router = useRouter();
  const handleClose = useCallback((): void => {
    router.push(`/super-admin/empresa/${props.companyId}/organograma`);
  }, [router, props.companyId]);

  return (
    <PerfilIndividualRelatorioModal
      companyId={props.companyId}
      userType="clevel"
      userId={props.cLevelId}
      titularNome={props.nome}
      cargo={props.cargo}
      nivelHierarquico="Estratégico"
      departamento="Alta liderança"
      liderDireto={null}
      onClose={handleClose}
    />
  );
}
