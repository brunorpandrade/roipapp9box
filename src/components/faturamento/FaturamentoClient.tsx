'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';

import { COLORS } from '../../lib/design-tokens/colors';

import { addMonthsToMes, currentMesUTC, formatBRL, formatMesLabel } from './internals';
import type { FaturamentoClientProps, FaturamentoStatus, MesFaturamentoRow } from './internals';
import { loadFaturamentoMesAction, loadHistoricoAction, saveFaturamentoAction } from './actions';

interface ToastState {
  readonly tipo: 'ok' | 'erro';
  readonly msg: string;
}

const STATUS_LABEL: Record<FaturamentoStatus, string> = {
  aberto: 'Aberto',
  fechado: 'Fechado',
  desbloqueado: 'Desbloqueado',
};

function statusBadgeStyle(status: FaturamentoStatus): CSSProperties {
  if (status === 'aberto') {
    return { background: COLORS.badge.successBg, color: COLORS.badge.successTextAlt };
  }
  if (status === 'desbloqueado') {
    return { background: COLORS.badge.warningBg, color: COLORS.badge.warningText };
  }
  return { background: COLORS.border.default, color: COLORS.text.tertiary };
}

export function FaturamentoClient(props: FaturamentoClientProps): JSX.Element {
  const { companyId, mesInicial, faturamentoInicial, statusInicial, mesesPendentes } = props;

  const [mes, setMes] = useState<string>(mesInicial);
  const [valor, setValor] = useState<string>(faturamentoInicial ?? '');
  const [status, setStatus] = useState<FaturamentoStatus>(statusInicial);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [carregandoMes, setCarregandoMes] = useState<boolean>(false);
  const [historico, setHistorico] = useState<readonly MesFaturamentoRow[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const mesCorrente = currentMesUTC();
  const noFuturo = addMonthsToMes(mes, 1) > mesCorrente;
  const editavel = status !== 'fechado';

  const carregarHistorico = useCallback(
    async (mesFinal: string): Promise<void> => {
      const res = await loadHistoricoAction({ companyId, mesFinal });
      if (res.ok) {
        setHistorico(res.rows);
      }
    },
    [companyId],
  );

  useEffect(() => {
    void carregarHistorico(mesInicial);
  }, [carregarHistorico, mesInicial]);

  const navegar = useCallback(
    async (delta: number): Promise<void> => {
      const novoMes = addMonthsToMes(mes, delta);
      if (delta > 0 && novoMes > mesCorrente) {
        return;
      }
      setCarregandoMes(true);
      setToast(null);
      const res = await loadFaturamentoMesAction({ companyId, mes: novoMes });
      setCarregandoMes(false);
      if (!res.ok) {
        setToast({ tipo: 'erro', msg: res.error ?? 'Erro ao carregar o mês.' });
        return;
      }
      setMes(novoMes);
      setValor(res.faturamentoBruto ?? '');
      setStatus(res.status);
    },
    [companyId, mes, mesCorrente],
  );

  const salvar = useCallback(async (): Promise<void> => {
    const num = Number(valor);
    if (!Number.isFinite(num) || num <= 0) {
      setToast({ tipo: 'erro', msg: 'Informe um valor de faturamento maior que zero.' });
      return;
    }
    setSalvando(true);
    setToast(null);
    const res = await saveFaturamentoAction({ companyId, mes, faturamentoBruto: valor });
    setSalvando(false);
    if (!res.ok) {
      setToast({ tipo: 'erro', msg: res.error ?? 'Erro ao salvar o faturamento.' });
      return;
    }
    setToast({ tipo: 'ok', msg: 'Faturamento salvo.' });
    const atual = await loadFaturamentoMesAction({ companyId, mes });
    if (atual.ok) {
      setValor(atual.faturamentoBruto ?? '');
      setStatus(atual.status);
    }
    await carregarHistorico(mes);
  }, [carregarHistorico, companyId, mes, valor]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text.primary, margin: 0 }}>
        Faturamento da empresa
      </h1>
      <p style={{ color: COLORS.text.tertiary, marginTop: 4 }}>
        Lançamento mensal do faturamento bruto realizado.
      </p>

      {mesesPendentes > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            background: COLORS.badge.warningBg,
            color: COLORS.badge.warningText,
            fontSize: 13,
          }}
        >
          {mesesPendentes} mês(es) sem faturamento lançado nos últimos 12 meses.
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <button
          type="button"
          onClick={() => void navegar(-1)}
          disabled={carregandoMes}
          style={{
            border: `1px solid ${COLORS.border.default}`,
            background: COLORS.background.card,
            borderRadius: 8,
            padding: '8px 12px',
            cursor: carregandoMes ? 'not-allowed' : 'pointer',
          }}
        >
          ◀
        </button>
        <div
          style={{
            minWidth: 180,
            textAlign: 'center',
            fontWeight: 600,
            color: COLORS.text.primary,
          }}
        >
          {formatMesLabel(mes)}
        </div>
        <button
          type="button"
          onClick={() => void navegar(1)}
          disabled={carregandoMes || noFuturo}
          style={{
            border: `1px solid ${COLORS.border.default}`,
            background: COLORS.background.card,
            borderRadius: 8,
            padding: '8px 12px',
            cursor: carregandoMes || noFuturo ? 'not-allowed' : 'pointer',
            opacity: noFuturo ? 0.4 : 1,
          }}
        >
          ▶
        </button>
        <span
          style={{
            marginLeft: 8,
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            ...statusBadgeStyle(status),
          }}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {status === 'fechado' ? (
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: COLORS.background.elevated,
            color: COLORS.text.secondary,
            borderLeft: `3px solid ${COLORS.text.tertiary}`,
            fontSize: 13,
          }}
        >
          Mês fechado — somente leitura. É preciso desbloquear o mês antes de editar; o desbloqueio
          será liberado na etapa de gestão de ciclos.
        </div>
      ) : null}

      {status === 'desbloqueado' ? (
        <div
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: COLORS.badge.warningBg,
            color: COLORS.badge.warningText,
            borderLeft: `3px solid ${COLORS.semantic.warning}`,
            fontSize: 13,
          }}
        >
          Mês desbloqueado — edição liberada temporariamente.
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          padding: 20,
          borderRadius: 12,
          background: COLORS.background.card,
          border: `1px solid ${COLORS.border.default}`,
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.text.secondary,
            marginBottom: 6,
          }}
        >
          Faturamento bruto
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: COLORS.text.tertiary,
                fontSize: 14,
              }}
            >
              R$
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              disabled={!editavel || salvando || carregandoMes}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                border: `1px solid ${COLORS.border.default}`,
                borderRadius: 8,
                fontSize: 14,
                color: COLORS.text.primary,
                background: editavel ? COLORS.background.card : COLORS.background.elevated,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!editavel || salvando || carregandoMes}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: editavel ? COLORS.accent.teal : COLORS.border.default,
              color: '#FFFFFF',
              fontWeight: 600,
              cursor: editavel && !salvando ? 'pointer' : 'not-allowed',
            }}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        <p style={{ marginTop: 8, fontSize: 12, color: COLORS.text.tertiary }}>
          Valor atual: {formatBRL(valor.length > 0 ? valor : null)}
        </p>
      </div>

      <h2
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: COLORS.text.primary,
          marginTop: 28,
          marginBottom: 8,
        }}
      >
        Últimos 12 meses
      </h2>
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${COLORS.border.default}`,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: COLORS.background.elevated }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: COLORS.text.tertiary }}>
                Mês
              </th>
              <th style={{ textAlign: 'right', padding: '10px 14px', color: COLORS.text.tertiary }}>
                Faturamento bruto
              </th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: COLORS.text.tertiary }}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {historico.map((row) => (
              <tr key={row.mes} style={{ borderTop: `1px solid ${COLORS.border.divider}` }}>
                <td style={{ padding: '10px 14px', color: COLORS.text.primary }}>
                  {formatMesLabel(row.mes)}
                </td>
                <td
                  style={{ padding: '10px 14px', textAlign: 'right', color: COLORS.text.primary }}
                >
                  {formatBRL(row.faturamentoBruto)}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      ...statusBadgeStyle(row.status),
                    }}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast !== null ? (
        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            background: toast.tipo === 'ok' ? COLORS.badge.successBg : COLORS.badge.dangerBg,
            color: toast.tipo === 'ok' ? COLORS.badge.successTextAlt : COLORS.badge.dangerText,
          }}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}
