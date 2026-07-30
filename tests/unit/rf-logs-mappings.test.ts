// ROIP APP 9BOX — teste unit mappings /super-admin/logs/responsavel-
// financeiro (ME-057b Bloco E). Cobre CC043 aprovada em ME-057b:
// labels canonicos do mockup em substantivo, badge colors bit-exact.

import { describe, expect, it } from 'vitest';

import { COLORS } from '../../src/lib/design-tokens/colors';
import {
  EVENT_TYPE_BADGE_STYLE,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_LABEL_TODOS,
  formatHolderCell,
  resolveEventTypeBadgeStyle,
  resolveEventTypeLabel,
} from '../../src/app/super-admin/logs/responsavel-financeiro/mappings';
import { RF_EVENT_TYPE_VALUES } from '../../src/db/schema/enums';

describe('rf-logs mappings — CC043 (mockup prevalece)', () => {
  describe('EVENT_TYPE_LABEL — labels canonicos §14.20', () => {
    it('atribuido → Atribuicao (substantivo do mockup, nao adjetivo)', () => {
      expect(EVENT_TYPE_LABEL.atribuido).toBe('Atribuição');
      expect(resolveEventTypeLabel('atribuido')).toBe('Atribuição');
    });

    it('transferido → Transferencia', () => {
      expect(EVENT_TYPE_LABEL.transferido).toBe('Transferência');
      expect(resolveEventTypeLabel('transferido')).toBe('Transferência');
    });

    it('removido → Remocao', () => {
      expect(EVENT_TYPE_LABEL.removido).toBe('Remoção');
      expect(resolveEventTypeLabel('removido')).toBe('Remoção');
    });

    it('cobre exaustivamente os 3 values do enum RF_EVENT_TYPE_VALUES', () => {
      for (const v of RF_EVENT_TYPE_VALUES) {
        expect(EVENT_TYPE_LABEL[v]).toBeDefined();
        expect(EVENT_TYPE_LABEL[v]!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('EVENT_TYPE_BADGE_STYLE — cores canonicas mockup', () => {
    it('atribuido → info (azul)', () => {
      const s = resolveEventTypeBadgeStyle('atribuido');
      expect(s.background).toBe(COLORS.badge.infoBg);
      expect(s.color).toBe(COLORS.badge.infoText);
      expect(EVENT_TYPE_BADGE_STYLE.atribuido).toEqual(s);
    });

    it('transferido → warning (amarelo/laranja)', () => {
      const s = resolveEventTypeBadgeStyle('transferido');
      expect(s.background).toBe(COLORS.badge.warningBg);
      expect(s.color).toBe(COLORS.badge.warningText);
    });

    it('removido → danger (vermelho)', () => {
      const s = resolveEventTypeBadgeStyle('removido');
      expect(s.background).toBe(COLORS.badge.dangerBg);
      expect(s.color).toBe(COLORS.badge.dangerText);
    });

    it('cobre exaustivamente os 3 values do enum', () => {
      for (const v of RF_EVENT_TYPE_VALUES) {
        const s = resolveEventTypeBadgeStyle(v);
        expect(s.background.startsWith('#')).toBe(true);
        expect(s.color.startsWith('#')).toBe(true);
      }
    });

    it('background e color distintos por tipo (bit-exact vs contraste)', () => {
      const seen = new Set<string>();
      for (const v of RF_EVENT_TYPE_VALUES) {
        const s = resolveEventTypeBadgeStyle(v);
        const key = `${s.background}|${s.color}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });
  });

  describe('EVENT_TYPE_LABEL_TODOS — label do default dropdown', () => {
    it('exato bit-exact ao mockup: "Tipo de evento: Todos"', () => {
      expect(EVENT_TYPE_LABEL_TODOS).toBe('Tipo de evento: Todos');
    });
  });

  describe('formatHolderCell — helper polimorfico De/Para', () => {
    it('null → em dash (mockup usa <span class="holder-none">—</span>)', () => {
      expect(formatHolderCell(null)).toBe('—');
    });

    it('string vazia ou apenas espacos → em dash', () => {
      expect(formatHolderCell('')).toBe('—');
      expect(formatHolderCell('   ')).toBe('—');
    });

    it('string valida com espacos em volta → trim aplicado', () => {
      expect(formatHolderCell('  Rogerio Andrade  ')).toBe('Rogerio Andrade');
    });

    it('string valida preservada sem trim se nao ha espacos extras', () => {
      expect(formatHolderCell('Marina Souza')).toBe('Marina Souza');
    });
  });
});
