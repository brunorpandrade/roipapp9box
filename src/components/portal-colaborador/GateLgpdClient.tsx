// ROIP APP 9BOX — Client canônico do gate LGPD do portal
// (ME-B10-01, DOC 05 §6.2).
//
// Renderizado após identificação por CPF+matrícula quando
// `versaoTermoAceita` diverge de `LGPD_TERM_VERSION`.
//
// Layout: card centralizado 480-520px sobre background #F9FAFB.
// Eyebrow contextual:
//   - "Primeiro acesso" se não há registro anterior (heurística: pela
//     ausência de LGPD anterior salva em sessionStorage).
//   - "Termo atualizado" se há registro superado.
//
// Nesta ME, a heurística exclusiva é "Primeiro acesso" — o gate real
// é emitido pelo backend sem distinguir os dois casos no payload.
// Sub-decisão silenciosa L130: usar "Termo atualizado" quando o
// sessionStorage indica que já houve login anterior nesta aba
// (`portalLgpdSeen === '1'`); "Primeiro acesso" caso contrário.
//
// Botão único primário [Concordar e continuar]. Consome
// POST /api/portal/consent-lgpd com `{ portalToken }` do
// sessionStorage. Sucesso → redirect para /colaborador/pendencias.

'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';

const NAVY = '#1F3A5F';
const TEAL = '#14B8A6';
const BORDER = '#E5E7EB';
const TEXT_1 = '#111827';
const TEXT_2 = '#374151';
const TEXT_3 = '#6B7280';
const TEXT_4 = '#9CA3AF';
const DANGER_BG = '#FEE2E2';
const DANGER_TX = '#991B1B';

const TITULO_CANONICO = 'Termo de tratamento de dados';
const TERMO_LITERAL_V10 =
  'Ao prosseguir, você declara estar ciente de que seus dados pessoais ' +
  'serão tratados para as finalidades relacionadas ao uso desta ' +
  'plataforma, conforme a legislação aplicável. O tratamento ocorrerá ' +
  'com base nas hipóteses legais pertinentes previstas na LGPD. Você ' +
  'poderá exercer os direitos previstos na lei, incluindo acesso, ' +
  'correção e demais direitos aplicáveis, por meio dos canais ' +
  'disponibilizados pela empresa.';

interface ConsentSuccess {
  gateStep: 'pendencias';
}

interface ConsentError {
  msg: string;
}

export function GateLgpdClient(): JSX.Element {
  const router = useRouter();
  const [eyebrow, setEyebrow] = useState<'primeiro' | 'atualizado'>('primeiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenPresente, setTokenPresente] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      setTokenPresente(false);
      router.replace('/colaborador');
      return;
    }
    const jaViu = window.sessionStorage.getItem('portalLgpdSeen');
    setEyebrow(jaViu === '1' ? 'atualizado' : 'primeiro');
  }, [router]);

  async function handleConcordar(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }
    const token = window.sessionStorage.getItem('portalToken');
    if (token === null || token.length === 0) {
      router.replace('/colaborador');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/portal/consent-lgpd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ portalToken: token }),
      });
      const data = (await res.json()) as ConsentSuccess | ConsentError;
      if (res.status === 200) {
        window.sessionStorage.setItem('portalLgpdSeen', '1');
        router.replace('/colaborador/pendencias');
        return;
      }
      const errBody = data as ConsentError;
      if (res.status === 401) {
        window.sessionStorage.removeItem('portalToken');
        router.replace('/colaborador');
        return;
      }
      setError(errBody.msg);
    } catch {
      setError('Falha de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (!tokenPresente) {
    return <div />;
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: '36px 40px',
          boxShadow: '0 10px 40px rgba(17,24,39,.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: NAVY,
            }}
          >
            ROIP<span style={{ color: TEAL }}> APP</span>
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: TEAL,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          {eyebrow === 'primeiro' ? 'Primeiro acesso' : 'Termo atualizado'}
        </div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            textAlign: 'center',
            color: TEXT_1,
            margin: '0 0 20px 0',
          }}
        >
          {TITULO_CANONICO}
        </h1>

        <div
          style={{
            background: '#F9FAFB',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '22px 24px',
            fontSize: 13.5,
            lineHeight: 1.65,
            color: TEXT_2,
          }}
        >
          {TERMO_LITERAL_V10}
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11.5,
            color: TEXT_4,
          }}
        >
          <span>Termo v1.0</span>
          <span>Consulta sempre disponível no rodapé do portal</span>
        </div>

        {error !== null ? (
          <div
            style={{
              marginTop: 18,
              padding: '11px 14px',
              background: DANGER_BG,
              color: DANGER_TX,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={handleConcordar}
            disabled={loading}
            style={{
              padding: '13px 32px',
              background: NAVY,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              fontSize: 14.5,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Registrando…' : 'Concordar e continuar'}
          </button>
        </div>

        {/* TEXT_3 reservado para variantes futuras — mantém RV-13 */}
        <span style={{ display: 'none', color: TEXT_3 }} aria-hidden />
      </div>
    </div>
  );
}
