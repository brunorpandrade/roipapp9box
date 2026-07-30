// ROIP APP 9BOX — mapeamento canonico Lucide S466 (ME-055 Bloco A + CC039).
//
// Fonte da verdade do mapeamento nome-do-item-de-menu → componente
// Lucide canonico. Consumido por `Sidebar.tsx` (Bloco B) e por testes
// unit que verificam presenca canonica bit-exact.
//
// Origem canonica: DOC 05 §2.7 (25 itens canonicos, S466 Opcao A, CC039).
//
// Nota canonica S466 (§2.7): canonizacao estrita adotada para eliminar
// ambiguidade e reduzir margem de decisao do Manus (Rota B — se nao
// estiver escrito, o Manus nao vai construir).
//
// Nota canonica CC039 (ME-055 Bloco B): 2 labels acrescentados a §2.7 e
// a esta constante — "Log de acesso individual" (item de topo em §3.3,
// §3.4 e §3.5, subitem de "Logs administrativos" em §3.1) e "Historico
// da empresa" (item de topo em §3.2 item 11). Ambos mapeiam para
// `FileText`. Total de 23 → 25 sem alterar mapeamentos preexistentes.

import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BellRing,
  Building,
  Building2,
  CalendarClock,
  ClipboardList,
  DollarSign,
  FileBarChart,
  FileText,
  GitFork,
  GraduationCap,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Network,
  RefreshCw,
  Shield,
  Unlock,
  UserCircle,
  UserCog,
  Users,
  Users2,
} from 'lucide-react';

// §2.7 — 25 itens canonicos preservados palavra por palavra, na ordem
// exata em que aparecem no DOC 05 §2.7 pos-CC039. Itens 18 ("Log de
// acesso individual") e 19 ("Historico da empresa") introduzidos por
// CC039 apos "Logs administrativos" (afinidade semantica: auditoria e
// historico), antes de "Relatorios e exportacoes".
export const MENU_ITEM_LABELS = [
  'Painel',
  'Início',
  'Empresas',
  'Todos os colaboradores',
  'Minha equipe',
  'Cadeia indireta',
  'Faturamento da empresa',
  'Dados mensais',
  'Organograma',
  'Radar NR-1',
  'Pendências no portal',
  'C-level e RH',
  'Cadastro da empresa',
  'Gestão de ciclos',
  'Notificações',
  'Desbloqueios',
  'Logs administrativos',
  'Log de acesso individual',
  'Histórico da empresa',
  'Relatórios e exportações',
  'Onboarding de líderes',
  'Instrumentos (placeholder Fase 1)',
  'Suporte e logs (placeholder Fase 1)',
  'Meus dados',
  'Sair',
] as const;

export type MenuItemLabel = (typeof MENU_ITEM_LABELS)[number];

// §2.7 — mapeamento bit-exact, S466 Opcao A + CC039. Chaves na mesma
// ordem de MENU_ITEM_LABELS para auditoria linha a linha.
export const LUCIDE_ICON_BY_MENU_ITEM: Record<MenuItemLabel, LucideIcon> = {
  Painel: LayoutDashboard,
  Início: Home,
  Empresas: Building2,
  'Todos os colaboradores': Users,
  'Minha equipe': Users2,
  'Cadeia indireta': Network,
  'Faturamento da empresa': DollarSign,
  'Dados mensais': CalendarClock,
  Organograma: GitFork,
  'Radar NR-1': Shield,
  'Pendências no portal': Bell,
  'C-level e RH': UserCog,
  'Cadastro da empresa': Building,
  'Gestão de ciclos': RefreshCw,
  Notificações: BellRing,
  Desbloqueios: Unlock,
  'Logs administrativos': FileText,
  'Log de acesso individual': FileText,
  'Histórico da empresa': FileText,
  'Relatórios e exportações': FileBarChart,
  'Onboarding de líderes': GraduationCap,
  'Instrumentos (placeholder Fase 1)': ClipboardList,
  'Suporte e logs (placeholder Fase 1)': LifeBuoy,
  'Meus dados': UserCircle,
  Sair: LogOut,
};
