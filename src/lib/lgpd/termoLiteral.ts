/* eslint-disable @stylistic/max-len -- texto literal canonico do termo juridico LGPD (DOC 02 §7.3). Quebrar paragrafos em linhas de 100 colunas via concatenacao espalharia a substancia e dificultaria auditoria do texto; o template HTML normaliza whitespace na renderizacao. Precedente canonico: tests/integration/lgpd-portability-route.test.ts topo. */
// ROIP APP 9BOX — modulo canonico do texto literal do termo LGPD por versao
// (ME-1.12.c Despacho A, item [1.12.c] do roadmap V4; estendido ME-1.12.d
// — substituicao do texto literal da V1.0 pelo termo juridico estruturado
// definitivo, DOC 02 §7.3 revisado em 18/10/2026 tarde pela decisao
// executiva de Bruno).
//
// Fonte unica da verdade do texto literal do termo de consentimento LGPD,
// indexado por versao canonica (`LGPD_TERM_VERSION` de `src/lib/env.ts`).
// Consumido L125 por:
//   - `src/components/portal-colaborador/GateLgpdClient.tsx` (caixa
//     inicial + modal rolavel do primeiro login — ME-1.12.c).
//   - `src/server/pdf-templates/lgpdPortabilityTemplate.ts` (secao
//     "Termo de aceite" no PDF — ME-1.12.c).
//   - `tests/unit/termoLiteral.test.ts` (teste canonico do getter).
//
// Novas versoes do termo (futuras) devem adicionar uma entrada ao
// mapa `TERMO_LITERAL_POR_VERSAO` sem remover versoes antigas — a
// base LGPD retem registros historicos com `versaoTermoAceita`
// antigas, e o PDF do SA precisa renderizar o texto exatamente como
// o titular aceitou (rastreabilidade canonica §19.6).
//
// Formato canonico da V1.0 (ME-1.12.d): o termo juridico definitivo
// e estruturado em 13 secoes com cabecalhos e corpo. Para preservar
// legibilidade no modal e no PDF, mantemos tres representacoes
// canonicas sincronizadas:
//   - `TERMO_LITERAL_V10_HTML`: HTML estruturado (fonte de verdade
//     para renderizacao). Secoes `<h4>` + `<p>` + listas `<ul>`.
//   - `TERMO_LITERAL_V10`: texto plano concatenado por `\n\n` entre
//     paragrafos. Fallback canonico quando o consumidor nao suporta
//     HTML (ex: logs, email transacional, exportacao plain-text).
//   - `TERMO_RESUMO_V10`: 3 frases canonicas para a caixa inicial
//     do primeiro login (ME-1.12.c — abre o modal rolavel integral).
//
// **RV-12.** Zero SQL. **RV-13.** Consumidores reais nomeados acima.
// **RV-14.** Um statement por linha, largura maxima 100 colunas.

/**
 * Texto literal canonico do termo LGPD v1.0 em HTML estruturado
 * (ME-1.12.d — DOC 02 §7.3 revisado em 18/10/2026). Consumido pelo
 * modal rolavel do `GateLgpdClient` e pela secao "Termo de aceite"
 * do PDF `lgpdPortabilityTemplate`. Markup intencionalmente simples
 * (`<h4>`, `<p>`, `<ul>`, `<li>`, `<strong>`) para preservar
 * compatibilidade com Puppeteer (PDF) e com inline rendering do
 * modal via `dangerouslySetInnerHTML`.
 *
 * SEGURANCA: constante no codigo, nao vem de user input — risco XSS
 * zero por construcao. `dangerouslySetInnerHTML` e consumo canonico
 * nesta superficie.
 */
export const TERMO_LITERAL_V10_HTML: string = `
<h4>Termo de ciência e política de privacidade</h4>
<p><strong>ROIPeople — Plataforma de gestão de pessoas e desempenho</strong><br>
Versão 1.0 — vigente a partir de 18 de outubro de 2026</p>

<h4>Sobre este documento</h4>
<p>Este documento informa como seus dados pessoais são tratados na plataforma ROIPeople, utilizada pela sua empresa empregadora (doravante "Empresa") para gestão de pessoas, avaliação de desempenho, mapeamento de potencial e desenvolvimento profissional. A plataforma é fornecida pela ROIPeople, na qualidade de operadora de dados nos termos da Lei nº 13.709/2018 (LGPD).</p>
<p>Ao marcar a caixa de aceite e prosseguir para a plataforma, você declara ter lido, compreendido e tomado ciência das informações a seguir.</p>

<h4>1. Quem é controlador e quem é operador</h4>
<p>A Empresa é a controladora dos seus dados pessoais no âmbito desta plataforma, ou seja, decide sobre as finalidades e os meios do tratamento. A ROIPeople é a operadora, atuando exclusivamente conforme as instruções da Empresa e dos termos contratuais firmados entre as partes.</p>
<p>Dúvidas, solicitações e exercício de direitos devem ser dirigidos ao canal da Empresa indicado no item 13. A ROIPeople atua como canal secundário.</p>

<h4>2. Dados tratados</h4>
<p>A plataforma trata as seguintes categorias de dados pessoais:</p>
<ul>
  <li><strong>Dados cadastrais e funcionais:</strong> nome, matrícula, CPF, cargo, área, data de admissão, hierarquia, salário e histórico de movimentações, fornecidos pela Empresa.</li>
  <li><strong>Dados avaliativos:</strong> notas de desempenho e potencial, feedbacks, classificação no modelo 9-Box, planos de desenvolvimento individual, metas e resultados.</li>
  <li><strong>Indicadores derivados:</strong> cálculos de retorno sobre investimento individual (ROI) e demais indicadores de produtividade, construídos a partir dos dados acima.</li>
  <li><strong>Dados de uso:</strong> logs de acesso, endereço IP, data e hora de login, ações realizadas na plataforma.</li>
  <li><strong>Dados comportamentais:</strong> resultados de assessments de perfil, quando aplicáveis e quando aplicados pela Empresa.</li>
</ul>
<p>A plataforma não trata dados pessoais sensíveis (origem racial ou étnica, convicção religiosa, opinião política, filiação sindical, saúde, vida sexual, dado genético ou biométrico), salvo mediante consentimento específico e destacado, solicitado em momento próprio e separado deste termo.</p>

<h4>3. Finalidades do tratamento</h4>
<p>Os dados são tratados exclusivamente para as finalidades abaixo:</p>
<ul>
  <li>Avaliação de desempenho e potencial dos colaboradores.</li>
  <li>Classificação no modelo 9-Box.</li>
  <li>Cálculo de indicadores de produtividade e retorno sobre investimento individual.</li>
  <li>Elaboração e acompanhamento de planos de desenvolvimento individual.</li>
  <li>Planejamento de sucessão, movimentações internas e desenvolvimento de carreira.</li>
  <li>Geração de insights analíticos e recomendações por meio de inteligência artificial, para apoio à decisão dos gestores.</li>
  <li>Cumprimento de obrigações legais, regulatórias e contratuais da Empresa.</li>
  <li>Operação, segurança e melhoria contínua da plataforma.</li>
</ul>

<h4>4. Bases legais</h4>
<p>O tratamento dos seus dados pessoais na plataforma fundamenta-se nas seguintes bases legais previstas no art. 7º da LGPD:</p>
<ul>
  <li>Execução de contrato de trabalho e procedimentos preliminares a ele (inciso V).</li>
  <li>Cumprimento de obrigação legal ou regulatória pela controladora (inciso II).</li>
  <li>Legítimo interesse da controladora na gestão da relação de trabalho e no desenvolvimento do capital humano (inciso IX), observados os seus direitos e liberdades fundamentais.</li>
</ul>
<p>Em razão das bases legais aplicáveis, o tratamento descrito neste termo independe de consentimento. Caso qualquer finalidade futura exija consentimento, este será solicitado de forma destacada e específica.</p>

<h4>5. Decisões apoiadas por tratamento automatizado</h4>
<p>A plataforma utiliza processamento automatizado, inclusive por sistemas de inteligência artificial, para gerar classificações, indicadores e sugestões analíticas sobre o seu desempenho e potencial, com base nos dados descritos no item 2.</p>
<p>As decisões sobre carreira, remuneração, movimentação e desligamento são de responsabilidade da Empresa e tomadas por pessoas naturais, com base no conjunto de informações disponíveis. A plataforma funciona como ferramenta de apoio, não como instância decisória autônoma.</p>
<p>Você tem o direito de solicitar à Empresa a revisão de decisões que afetem seus interesses e tenham sido tomadas unicamente com base em tratamento automatizado, nos termos do art. 20 da LGPD, mediante requerimento ao canal indicado no item 13.</p>

<h4>6. Visibilidade das informações</h4>
<p>A plataforma controla o acesso às informações por nível hierárquico e por papel. Em regra, cada colaborador acessa seus próprios dados e indicadores; gestores acessam dados de sua equipe direta; áreas de Recursos Humanos e lideranças executivas acessam visões agregadas e individuais conforme suas atribuições. A matriz de visibilidade é definida pela Empresa e pode ser consultada junto ao canal indicado no item 13.</p>

<h4>7. Compartilhamento de dados</h4>
<p>Seus dados pessoais podem ser compartilhados com:</p>
<ul>
  <li>Provedores de infraestrutura em nuvem contratados pela ROIPeople para hospedagem, armazenamento e processamento.</li>
  <li>Provedores de serviços de inteligência artificial utilizados para geração dos insights descritos no item 5.</li>
  <li>Autoridades públicas, quando exigido por lei, regulamento ou ordem judicial.</li>
  <li>Terceiros expressamente autorizados pela Empresa no contexto de projetos de consultoria, auditoria ou integração de sistemas.</li>
</ul>
<p>Todos os terceiros estão sujeitos a obrigações contratuais de confidencialidade e proteção de dados.</p>

<h4>8. Transferência internacional</h4>
<p>Parte da infraestrutura utilizada pela plataforma pode estar localizada fora do território nacional. Nesses casos, a transferência internacional observa as hipóteses previstas no art. 33 da LGPD e são adotadas garantias contratuais e técnicas adequadas para a proteção dos seus dados.</p>

<h4>9. Retenção e eliminação</h4>
<p>Seus dados pessoais são mantidos durante a vigência do seu contrato de trabalho com a Empresa e, após o encerramento do vínculo, pelos seguintes prazos:</p>
<ul>
  <li>Dados com impacto trabalhista: 5 anos, observado o prazo prescricional previsto no art. 7º, XXIX, da Constituição Federal.</li>
  <li>Dados com impacto fiscal e previdenciário: 10 anos, observadas as obrigações acessórias aplicáveis.</li>
  <li>Demais dados: pelo prazo necessário ao cumprimento de obrigações legais, regulatórias e contratuais, bem como para o exercício regular de direitos em processos judiciais, administrativos ou arbitrais, nos termos do art. 16 da LGPD.</li>
</ul>
<p>Após esses prazos, os dados são eliminados ou anonimizados.</p>

<h4>10. Seus direitos</h4>
<p>Nos termos do art. 18 da LGPD, você tem o direito de, mediante requisição à Empresa:</p>
<ul>
  <li>Confirmar a existência de tratamento dos seus dados.</li>
  <li>Acessar seus dados.</li>
  <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
  <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD.</li>
  <li>Solicitar a portabilidade dos dados a outro fornecedor.</li>
  <li>Obter informação sobre as entidades públicas e privadas com as quais a Empresa compartilha seus dados.</li>
  <li>Peticionar perante a Autoridade Nacional de Proteção de Dados (ANPD).</li>
  <li>Opor-se a tratamento realizado com fundamento em legítimo interesse, quando houver descumprimento da LGPD.</li>
  <li>Solicitar revisão de decisões tomadas unicamente com base em tratamento automatizado, nos termos do art. 20.</li>
</ul>

<h4>11. Segurança</h4>
<p>A ROIPeople adota medidas técnicas e organizacionais aptas a proteger seus dados pessoais contra acessos não autorizados e situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou qualquer forma de tratamento inadequado, incluindo, entre outras, controle de acesso, criptografia em trânsito, segregação de ambientes, registro de eventos (logs) e monitoramento contínuo.</p>
<p>Nenhuma medida de segurança é absoluta. Em caso de incidente que possa acarretar risco ou dano relevante aos titulares, a Empresa será comunicada pela ROIPeople e providenciará as comunicações exigidas pela LGPD.</p>

<h4>12. Canais de contato</h4>
<p><strong>Encarregado pelo tratamento de dados pessoais da Empresa ou canal equivalente de Recursos Humanos:</strong> a identificação e o contato estão disponíveis na área interna da Empresa e também no seu perfil de usuário na plataforma.</p>
<p><strong>Canal secundário — ROIPeople:</strong> contato@roipeople.com.br</p>

<h4>13. Alterações deste termo</h4>
<p>Este termo poderá ser atualizado para refletir mudanças legais, regulatórias, técnicas ou operacionais. Alterações materiais serão comunicadas na plataforma e exigirão novo aceite. A versão vigente, bem como o histórico das versões anteriormente aceitas por você, estará sempre disponível no seu perfil de usuário.</p>

<h4>14. Registro de aceite</h4>
<p>Ao clicar em concordar e continuar, fica registrado o seu aceite deste termo, com data, hora e versão do documento, para fins de prova de ciência e cumprimento do dever de transparência previsto na LGPD.</p>
`.trim();

/**
 * Texto literal canonico do termo LGPD v1.0 em texto plano
 * (fallback canonico — ME-1.12.d). Mantem a mesma substancia do
 * HTML estruturado, com paragrafos separados por `\n\n` e listas
 * renderizadas como itens prefixados por `- `. Consumido quando o
 * destino nao suporta HTML.
 */
export const TERMO_LITERAL_V10: string =
  'Termo de ciência e política de privacidade\n' +
  'ROIPeople — Plataforma de gestão de pessoas e desempenho\n' +
  'Versão 1.0 — vigente a partir de 18 de outubro de 2026\n\n' +
  'Sobre este documento\n' +
  'Este documento informa como seus dados pessoais são tratados na plataforma ROIPeople, utilizada pela sua empresa empregadora (doravante "Empresa") para gestão de pessoas, avaliação de desempenho, mapeamento de potencial e desenvolvimento profissional. A plataforma é fornecida pela ROIPeople, na qualidade de operadora de dados nos termos da Lei nº 13.709/2018 (LGPD).\n' +
  'Ao marcar a caixa de aceite e prosseguir para a plataforma, você declara ter lido, compreendido e tomado ciência das informações a seguir.\n\n' +
  '1. Quem é controlador e quem é operador\n' +
  'A Empresa é a controladora dos seus dados pessoais no âmbito desta plataforma, ou seja, decide sobre as finalidades e os meios do tratamento. A ROIPeople é a operadora, atuando exclusivamente conforme as instruções da Empresa e dos termos contratuais firmados entre as partes.\n' +
  'Dúvidas, solicitações e exercício de direitos devem ser dirigidos ao canal da Empresa indicado no item 13. A ROIPeople atua como canal secundário.\n\n' +
  '2. Dados tratados\n' +
  'A plataforma trata dados cadastrais e funcionais, dados avaliativos, indicadores derivados, dados de uso e dados comportamentais, conforme detalhado na versão integral deste termo. A plataforma não trata dados pessoais sensíveis, salvo mediante consentimento específico e destacado.\n\n' +
  '3. Finalidades do tratamento\n' +
  'Os dados são tratados exclusivamente para avaliação de desempenho e potencial, classificação no modelo 9-Box, cálculo de indicadores de produtividade e ROI individual, planos de desenvolvimento individual, planejamento de sucessão, geração de insights por inteligência artificial, cumprimento de obrigações legais e operação da plataforma.\n\n' +
  '4. Bases legais\n' +
  'Execução de contrato de trabalho (art. 7º, V, LGPD), cumprimento de obrigação legal ou regulatória (inciso II) e legítimo interesse da controladora (inciso IX). O tratamento independe de consentimento; finalidades futuras que o exijam serão solicitadas de forma destacada.\n\n' +
  '5. Decisões apoiadas por tratamento automatizado\n' +
  'A plataforma utiliza processamento automatizado para gerar classificações, indicadores e sugestões analíticas. Decisões sobre carreira, remuneração, movimentação e desligamento são de responsabilidade da Empresa, tomadas por pessoas naturais. Você tem o direito de solicitar revisão nos termos do art. 20 da LGPD.\n\n' +
  '6. Visibilidade das informações\n' +
  'A plataforma controla o acesso por nível hierárquico e por papel. Cada colaborador acessa seus próprios dados; gestores acessam dados de sua equipe direta; RH e lideranças executivas acessam visões agregadas e individuais conforme atribuições. Matriz de visibilidade definida pela Empresa.\n\n' +
  '7. Compartilhamento de dados\n' +
  'Seus dados podem ser compartilhados com provedores de infraestrutura em nuvem, provedores de serviços de inteligência artificial, autoridades públicas quando exigido por lei e terceiros autorizados pela Empresa. Todos sujeitos a obrigações contratuais de confidencialidade.\n\n' +
  '8. Transferência internacional\n' +
  'Parte da infraestrutura pode estar localizada fora do território nacional. Transferências observam o art. 33 da LGPD com garantias contratuais e técnicas adequadas.\n\n' +
  '9. Retenção e eliminação\n' +
  'Dados mantidos durante a vigência do contrato. Após o vínculo: 5 anos para dados com impacto trabalhista; 10 anos para dados com impacto fiscal e previdenciário; demais dados pelo prazo necessário ao cumprimento de obrigações legais. Após esses prazos, dados são eliminados ou anonimizados.\n\n' +
  '10. Seus direitos\n' +
  'Nos termos do art. 18 da LGPD: confirmar a existência de tratamento, acessar dados, corrigir, anonimizar/bloquear/eliminar, portabilidade, informação sobre compartilhamento, peticionar à ANPD, opor-se a tratamento por legítimo interesse em caso de descumprimento, solicitar revisão de decisões automatizadas (art. 20).\n\n' +
  '11. Segurança\n' +
  'A ROIPeople adota controle de acesso, criptografia em trânsito, segregação de ambientes, registro de eventos e monitoramento contínuo. Nenhuma medida é absoluta; em caso de incidente relevante, a Empresa é comunicada e providencia as comunicações exigidas pela LGPD.\n\n' +
  '12. Canais de contato\n' +
  'Encarregado da Empresa ou canal equivalente de RH: identificação e contato na área interna da Empresa e no seu perfil de usuário. Canal secundário ROIPeople: contato@roipeople.com.br.\n\n' +
  '13. Alterações deste termo\n' +
  'Este termo poderá ser atualizado. Alterações materiais serão comunicadas na plataforma e exigirão novo aceite. A versão vigente e o histórico de versões aceitas estarão sempre disponíveis no seu perfil de usuário.\n\n' +
  '14. Registro de aceite\n' +
  'Ao clicar em concordar e continuar, fica registrado o seu aceite deste termo, com data, hora e versão do documento, para fins de prova de ciência e cumprimento do dever de transparência previsto na LGPD.';

/**
 * Resumo canonico curto do termo LGPD v1.0 (ME-1.12.c — caixa inicial
 * do primeiro login; redigido em ME-1.12.d para coerencia semantica
 * com o novo texto integral). Tres frases: ciencia + bases legais +
 * direitos. Antecede o botao `[Ler termo integral]` que abre o modal
 * rolavel com o texto literal integral acima.
 */
export const TERMO_RESUMO_V10: string =
  'A ROIPeople trata seus dados pessoais na qualidade de operadora, exclusivamente conforme ' +
  'as instruções da sua empresa empregadora, para gestão de pessoas, avaliação de desempenho ' +
  'e desenvolvimento profissional. O tratamento tem base nas hipóteses legais da LGPD aplicáveis ' +
  'à relação de trabalho e independe de consentimento. Você mantém todos os direitos previstos ' +
  'no art. 18 da LGPD, exercidos pelos canais da sua empresa.';

/**
 * Mapa canonico `versao -> HTML estruturado`. Chaves sao os valores
 * canonicos de `lgpdConsents.versaoTermoAceita` (varchar 10). Novas
 * versoes adicionam entrada aqui sem remover as antigas.
 */
export const TERMO_LITERAL_HTML_POR_VERSAO: Readonly<Record<string, string>> = {
  '1.0': TERMO_LITERAL_V10_HTML,
};

/**
 * Mapa canonico `versao -> texto literal` (plain-text fallback).
 * Chaves sao os valores canonicos de `lgpdConsents.versaoTermoAceita`
 * (varchar 10). Novas versoes adicionam entrada aqui sem remover as
 * antigas.
 */
export const TERMO_LITERAL_POR_VERSAO: Readonly<Record<string, string>> = {
  '1.0': TERMO_LITERAL_V10,
};

/**
 * Mapa canonico `versao -> resumo curto`. Mesma logica dos mapas de
 * texto literal. Resumos novos vinculados a versoes novas sao
 * adicionados aqui.
 */
export const TERMO_RESUMO_POR_VERSAO: Readonly<Record<string, string>> = {
  '1.0': TERMO_RESUMO_V10,
};

/**
 * Getter canonico do texto literal (plain-text) por versao. Retorna
 * o texto quando a versao e conhecida; retorna `null` quando a versao
 * e desconhecida (rastreabilidade: o PDF renderiza fallback "(versao
 * historica — texto nao disponivel)" sem quebrar o render).
 */
export function getTermoLiteral(versao: string): string | null {
  return TERMO_LITERAL_POR_VERSAO[versao] ?? null;
}

/**
 * Getter canonico do HTML estruturado por versao (ME-1.12.d). Retorna
 * o HTML quando a versao e conhecida; retorna `null` quando a versao
 * e desconhecida. Consumidores que renderizam ricamente (modal do
 * gate, PDF via Puppeteer) devem preferir este getter sobre o
 * `getTermoLiteral` (plain-text) para preservar a estrutura canonica
 * do termo juridico.
 */
export function getTermoLiteralHtml(versao: string): string | null {
  return TERMO_LITERAL_HTML_POR_VERSAO[versao] ?? null;
}

/**
 * Getter canonico do resumo curto por versao. Retorna o resumo quando
 * a versao e conhecida; retorna `null` quando desconhecida. O
 * `GateLgpdClient` cai em fallback canonico (versao atual) nesse
 * caso.
 */
export function getTermoResumo(versao: string): string | null {
  return TERMO_RESUMO_POR_VERSAO[versao] ?? null;
}
