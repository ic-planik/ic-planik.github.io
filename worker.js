/* =====================================================================
   Assistente do relatório — backend
   Cloudflare Worker · Planik Inteligência Comercial

   O que ele faz, em ordem:
     1. confere o login do Firebase que veio do navegador (ninguém entra sem);
     2. confere, no Firestore, se aquele login tem o chat liberado;
     3. lê `dados/atual` — o MESMO documento que alimenta o relatório — e monta
        a base de conhecimento na hora;
     4. chama a Messages API do Claude e devolve a resposta em streaming.

   O passo 3 é o que impede o assistente de envelhecer. Se os números fossem
   escritos aqui dentro, a planilha mudaria, a tela mudaria junto e o assistente
   continuaria repetindo o número velho — o pior erro possível numa reunião de
   diretoria. Aqui as contas saem do mesmo dado que a tela usa, sempre.

   A chave da API NUNCA pode ficar no HTML. Ela vive aqui, como secret.

   Variáveis (aba Settings > Variables and Secrets do Worker):
     ANTHROPIC_API_KEY  (secret)   chave criada em platform.claude.com
     FIREBASE_API_KEY   (texto)    a mesma apiKey que já está no index.html
     PROJECT_ID         (texto)    planik-dashboard
     ORIGEM             (texto)    https://ic-planik.github.io
     MODELO             (texto)    claude-sonnet-5     (opcional)
     CHAT_LOGINS        (texto)    lista de emergência, separada por vírgula
   ===================================================================== */

const INSTRUCOES = `Você é o Especialista de Inteligência Comercial da Planik Empreendimentos
Imobiliários — anos de mercado imobiliário de alto padrão em São Paulo, sentado à
mesa com a diretoria dentro do próprio relatório de vendas.

Você não é um consultor de fora que recita números. Você é quem lê esse relatório
todo dia e sabe onde os problemas se escondem: na média que esconde um
empreendimento, no canal que cresce em VGV e encolhe em unidade, no desconto que
paga o volume, no mês que virou sem ninguém perceber. Ninguém te procura para
ouvir de volta o que já está na tela. Te procuram para saber **o que aquilo
significa e o que fazer**.

## De onde vêm suas respostas

Você recebe, abaixo, uma base de conhecimento com os números já calculados da
planilha comercial. Ela é a sua única fonte de dados, é gerada no momento da
pergunta e sai do mesmo dado que alimenta as telas do relatório.

REGRA MAIS IMPORTANTE: **nunca invente nem estime um número.** Se a resposta exige
um número que não está na base, diga que não tem e aponte onde a pessoa encontra.
Um "não tenho esse dado" é sempre melhor que um número plausível e errado — quem
lê você decide milhões em cima disso.

O que você **pode e deve** fazer, porque isso é análise e não invenção: comparar
dois números da base, calcular a razão entre eles, a diferença, a variação de um
mês para o outro, o quanto um item pesa no total, e **cruzar tabelas diferentes**
— origem × empreendimento, canal × empreendimento, gerente × mês, desconto ×
volume. Sempre mostrando os números de partida, para quem lê poder conferir.

O que você **não** faz: reagregar listas longas por conta própria (não some as
linhas de campanha para achar um total de canal — o total já está pronto em outra
tabela) e produzir qualquer número que não saia do que está aqui.

## O que está fora do seu alcance

- Dados de mercado (VSO médio do setor, lançamentos de concorrentes, índices como
  INCC ou IGP-M). Você não tem. Diga isso com franqueza e não arrisque um número
  de memória. Você ainda pode raciocinar sobre a operação sem esse benchmark.
- Dados de clientes, CPF, contratos, jurídico, financeiro e RH.
- A decisão final: aprovar desconto fora do teto, avaliar uma pessoa, encerrar uma
  parceria. Você traz o número, o cenário e a recomendação; quem assina é humano.
- Períodos que não estão na base (comparação com 2025, por exemplo).

## Como responder

Português do Brasil, direto, como um especialista sênior falando com um diretor.
Sem saudação, sem "claro!", sem repetir a pergunta, sem "espero ter ajudado".

**Para pergunta analítica** ("qual o maior gargalo", "o que preocupa", "como está
o Online", "por que caiu"), responda nesta ordem:

1. **A leitura** — sua conclusão, em uma ou duas frases, antes de qualquer número.
2. **A evidência** — os números que sustentam, com o recorte explícito.
3. **Por que está acontecendo** — as hipóteses, marcadas como hipótese, e o que na
   base sustenta ou enfraquece cada uma. Diga também qual dado faltaria para
   confirmar.
4. **O que fazer** — de duas a quatro ações concretas, ordenadas por tamanho do
   impacto, cada uma amarrada a um número ("recuperar o ritmo de junho no Core
   Klabin fecha R$ X do GAP de R$ Y"). Diga quem toca: gerente, marketing,
   diretoria, Inteligência Comercial.
5. **Onde conferir** — a aba do relatório.

Uma resposta analítica sua tem tipicamente de quatro a oito parágrafos. Não corte
por economia: profundidade é o motivo de você existir. Só encurte se a pessoa
pedir.

**Para pergunta objetiva** ("quantas vendas no último tri"), o número vem na
primeira linha — e ainda assim acrescente uma frase de contexto: comparação com o
período anterior, com a meta, ou o que dentro daquele número chama atenção. Número
solto não decide nada.

**Sempre cruze antes de concluir.** Pergunte-se: esse número muda quando eu olho
por empreendimento? por canal? por origem? por mês? por gerente? Se muda, a média
está escondendo o problema — e é o problema que interessa. Exemplo do tipo de
frase que se espera de você: "o desconto da carteira é 3,4%, mas é 8,1% no X, e o
X é 22% do VGV; o desconto da carteira é, na prática, o desconto do X."

Nomeie o que está fora do padrão em vez de descrever a tabela inteira. Ordene por
impacto, nunca por ordem alfabética. Quando um recorte tiver menos de cinco
unidades, avise que a amostra é pequena demais para virar conclusão. Quando os
dados forem incompletos (vendas sem origem, campo de corretor em branco), diga
qual é o tamanho do buraco e o que ele impede de afirmar.

Toda afirmação vem com o número que a sustenta. Parágrafo é o padrão; use lista
apenas nas ações recomendadas e em comparações item a item.

Formate valores como a plataforma: R$ 1.234.567 e 61,2%. Quantidades com vírgula
(84,5 unidades) estão certas — é o Fifith, não arredonde.

As abas do relatório chamam-se exatamente: Síntese, Visão Geral, Vendas por
Empreendimento, Desconto por Empreendimento, Canais, Gerentes, Parceiros, Origem
por Empreendimento e VSO. Use esses nomes, não invente outros. Pergunta sobre
imobiliária externa, ranking de parceiro ou "quem é o principal parceiro de
fulano" se confere na aba **Parceiros**.

Se a pergunta for ambígua, responda com a interpretação mais provável e diga qual
usou, em vez de devolver a pergunta.

## Base de conhecimento
`;

/* ===================================================================
   Construção da base de conhecimento a partir do payload da planilha.
   É a mesma conta que o relatório faz: unidade = soma do peso (vaga 0,
   Fifith 0,5) e desconto em reais sobre valor de tabela.
   =================================================================== */

const MES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const ORDEM = ["NIK Frei Caneca","Core Klabin","Linn Vila Mariana","NIK Vila Mariana",
               "Nuv Moema","Taj Ibirapuera","NIK Faria Lima","NIK Estilo Paulista",
               "NIK Sunset Paulista","NIK Paradiso","NIK Paulista"];
const CANAIS_MKT = ["Salão","Online"];

/* Formatação própria, sem depender de Intl: o número tem de sair igual ao da
   tela em qualquer ambiente. */
function n(v, casas) {
  casas = casas || 0;
  if (v === null || v === undefined || isNaN(v)) return "—";
  const neg = v < 0;
  const s = Math.abs(v).toFixed(casas);
  const p = s.split(".");
  const inteiro = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + inteiro + (p[1] ? "," + p[1] : "");
}
const pc = (v, casas) => (v === null || v === undefined || isNaN(v))
  ? "—" : n(v * 100, casas === undefined ? 1 : casas) + "%";
const nu = v => n(v, Math.abs(v % 1) > 1e-9 ? 1 : 0);

function montaContexto(P) {
  const meta = P.meta || {}, kpi = P.kpi || {}, conf = P.conferencia || {};
  const tx = P.transacoes || [];
  const MESREF = (meta.mesRef || 12) - 1;
  const L = [];
  const w = s => L.push(s);

  const soma = r => r.reduce((a, t) => a + (t.valor || 0), 0);
  const unid = r => r.reduce((a, t) => a + (t.peso || 0), 0);
  const vgvTot = soma(tx), unTot = unid(tx);

  const sint = {}; (P.sintese || []).forEach(s => sint[s.produto] = s);
  const desc = {}; (P.desconto || []).forEach(x => desc[x.produto] = x);
  const metas = {}; (((P.metas || {}).geral || {}).produtos || []).forEach(p => metas[p.produto] = p.meta);
  const vso = ((P.vso || {}).anoYTD) || {};
  const m2 = P.m2 || {};
  const MKT = P.mkt || {};
  const qual = MKT.qualidade || {};
  /* O payload da visão restrita chega sem os blocos de desconto, origem e VSO
     — e sem o extrato linha a linha dos outros canais. Montar essas seções
     assim mesmo produziria número errado com cara de certo: o "desconto médio
     da carteira" sairia calculado só com Parcerias e ainda se chamaria
     carteira. Melhor a seção não existir. */
  const RESTRITO = !!P._visao;
  /* Rótulos do recorte. Vêm prontos do redigir.py — o mesmo arquivo que
     decide o que sai do payload — para a tela e o assistente nunca chamarem
     o mesmo acesso por dois nomes. Os padrões são só rede de segurança para
     um payload antigo, gerado antes destes campos existirem. */
  const V = P._visao || {};
  const VCANAL = V.canal || "Parcerias";
  const VDET = V.canalDetalhado || VCANAL;
  const VTEXTO = V.canalTexto || "imobiliárias externas";
  /* Se o recorte não inclui Parcerias, a base não tem imobiliária nenhuma e
     as seções que falam delas precisam sumir junto. */
  const VPARC = !RESTRITO || (V.canais || []).indexOf("Parcerias") >= 0;

  /* produtos na ordem do relatório; o que for novo na planilha entra no fim */
  const prods = ORDEM.filter(p => sint[p])
    .concat(Object.keys(sint).filter(p => ORDEM.indexOf(p) < 0));

  const porProd = {}, porCanal = {}, porGer = {}, porMes = {};
  tx.forEach(t => {
    (porProd[t.produto] = porProd[t.produto] || []).push(t);
    (porCanal[t.canal] = porCanal[t.canal] || []).push(t);
    (porMes[t.mes] = porMes[t.mes] || []).push(t);
    if (t.gerente) (porGer[t.gerente] = porGer[t.gerente] || []).push(t);
  });

  const nomes = l => (l || []).map(x => x.nome);
  const gerHouse = nomes((P.gerentes || {}).plkGeral);
  const gerParc = nomes((P.gerentes || {}).parcerias);
  const roster = gerHouse.concat(gerParc);

  const somaSe = (o, f) => Object.keys(o).reduce((a, k) => a + f(o[k]), 0);
  const vgvCarteira = somaSe(sint, s => s.vgvTotal || 0);
  const vendidoVida = somaSe(sint, s => s.vgvVendidoVida || 0);
  const dispon = somaSe(sint, s => s.vgvDisponivel || 0);
  const unLivres = somaSe(sint, s => s.uniLivres || 0);
  const unCart = somaSe(sint, s => s.uniTotal || 0);

  w(`# Base de conhecimento — Inteligência Comercial Planik

Planilha de referência: **${meta.atualizado || "—"}**. Ano-base **${meta.anoBase || "—"}**.
Período coberto pelos números de realizado: **${meta.periodo || "—"}** (último mês com
venda registrada: ${meta.mesRefNome || "—"}).

Esta base é gerada no momento da pergunta, a partir do mesmo dado que alimenta as
telas do relatório.

## O que existe aqui (confira antes de dizer que não tem o dado)

${RESTRITO ? `Esta base é a operação de **${VDET}**, e só ela: realizado,
meta, GAP, atingimento, ticket médio, desconto, mês a mês por empreendimento e
por gerente — tudo do canal. A **carteira** (VGV total dos empreendimentos, o que
já foi vendido na vida e o estoque que sobra) é da empresa inteira, porque é
patrimônio e não desempenho de canal.

O que **não** existe neste acesso: qualquer número dos outros canais de venda —
nem resultado, nem meta, nem desconto, nem gerente. Também não existe origem de
captação, campanha, linha de campanha, VSO, investimento de mídia, lead, visita, CPL,
CAC, ROI, proposta, distrato, dado de 2025 nem número de mercado externo.` : `Carteira e estoque por empreendimento · realizado, meta, GAP e atingimento em R$ e
em unidades · trimestre · mês a mês da carteira, de cada empreendimento, de cada
canal e de cada gerente · ticket médio · valor do m² · desconto e perda nominal
por empreendimento · **canal por empreendimento** · **meta e realizado por canal
dentro de cada empreendimento** · gerentes com meta, atingimento e mês de entrada
· **origem por empreendimento** · origem mês a mês · **o funil origem → campanha →
linha** · **campanhas com venda** · **linhas criativas** · VSO do ano, mês a
mês e por empreendimento · estoque disponível mês a mês.

O que **não** existe: investimento de mídia, leads, visitas, CPL, CAC, ROI,
proposta, distrato, dados de 2025 e qualquer número de mercado externo.`}

## Regras de contagem que valem para tudo

1. **Vaga de garagem não conta como unidade.** Vendas cuja unidade começa com "V"
   são vagas: entram no VGV, mas valem 0 na contagem de unidades (peso 0).
2. **Fifith é venda dividida entre duas equipes.** Cada uma das duas linhas vale
   **0,5** unidade para o respectivo gerente ou canal. Nunca são duas vendas.
   Por isso aparecem quantidades com vírgula, como 84,5 ou 187,5 — está correto.
${RESTRITO ? "" : `3. **Metragem de Fifith não se soma.** Para valor do m², as duas linhas são
   unificadas antes do cálculo.
`}4. Se alguém perguntar "quantas vendas", a resposta é **${nu(unTot)}** unidades.${RESTRITO ? `
5. **Neste acesso as vendas de fora de ${VDET} chegam somadas** por
   empreendimento e mês. Os totais são os mesmos do relatório completo, mas não
   existe unidade, desconto, metragem nem gerente por venda nesses canais.` : ""}

## Como cada indicador é calculado

- **VGV**: soma do valor das vendas. Vagas incluídas.
- **Unidades**: soma do peso (1 normal, 0,5 Fifith, 0 vaga).
- **Meta do período**: soma das metas mensais de janeiro até ${meta.mesRefNome || "—"},
  por mês inteiro. O realizado usa a data exata da venda.
- **Atingimento**: realizado ÷ meta do período.
- **GAP**: meta menos realizado. Negativo significa que falta vender.
- **Ticket médio**: VGV ÷ unidades.
${RESTRITO ? "" : `- **VSO (Velocidade Sobre Oferta)**: vendas do ano ÷ estoque disponível em 1º de
  janeiro. Mede quanto do estoque girou, não quanto se vendeu em reais.
- **Desconto**: calculado em reais sobre o valor de tabela, nunca como média de
  percentuais. Tabela = valor ÷ (1 + desconto). A taxa agregada é
  (Σ valor − Σ tabela) ÷ Σ tabela. **Perda nominal** é quanto o desconto acima do
  teto aprovado custou.
  teto aprovado custou.
`}- **Ritmo necessário**: GAP do ano ÷ meses restantes.
${RESTRITO ? `- **Canal**: esta base cobre um recorte só — **${VDET}**,
  ${VTEXTO}. Os demais canais da empresa não estão aqui.`
: `- **Canais**: House reúne Salão e Online (equipe própria). Parcerias são
  imobiliárias externas. Lançadora é canal próprio desde maio. Interna é venda
  direta da empresa.`}
${RESTRITO ? "" : `- **Origem de captação**: só Salão e Online têm origem real. Em Parcerias,
  Lançadora e Interna o campo Origem repete o nome do canal e não diz de onde veio
  o cliente. Por isso elas entram no denominador do share (para o percentual ser
  verdadeiro) mas ficam fora do ranking de origens.
- **Campanha**: a campanha que trouxe o lead (Instagram, Google adwords, Site
  Planik, Meta). Só existe quando a **origem é Online**; venda de PAP, Espontânea
  ou Carteira de Corretor não tem campanha, e isso não é erro de preenchimento.
- **Linha de campanha**: a peça criativa dentro da campanha ("Frei Caneca - Linha
  Investidor - Lookalike"). Só existe dentro de uma campanha.
`}- **Ato pago**: recorte que considera só vendas com o ato já pago. Os números
  desta base estão no recorte **Geral** (todas as vendas).

## Números gerais do ano

- VGV total da carteira (todos os empreendimentos, vida inteira): **R$ ${n(vgvCarteira)}**
- Já vendido na vida do empreendimento: **R$ ${n(vendidoVida)}**
- Estoque disponível: **R$ ${n(dispon)}** em **${nu(unLivres)}** unidades de **${nu(unCart)}** totais
- Realizado no período: **R$ ${n(vgvTot)}** em **${nu(unTot)}** unidades
- Meta do período: **R$ ${n(kpi.metaYTD)}** · atingimento **${pc(kpi.metaYTD ? vgvTot / kpi.metaYTD : null)}**
- Meta do ano: **R$ ${n(kpi.metaAno)}** · atingimento do ano **${pc(kpi.metaAno ? vgvTot / kpi.metaAno : null)}**
- GAP para a meta do ano: **R$ ${n(kpi.gapAno)}** · faltam **${kpi.mesesRestantes}** meses
- Ritmo necessário: **R$ ${n(kpi.mesesRestantes ? kpi.gapAno / kpi.mesesRestantes : null)}** por mês
- Ticket médio geral: **R$ ${n(unTot ? vgvTot / unTot : null)}**${RESTRITO ? "" : `
- Valor médio do m² da carteira: **R$ ${n((m2._geral || {}).valorM2, 2)}**
- VSO do ano até agora: **${pc((vso.TOTAL || {}).vso)}** (R$ ${n((vso.TOTAL || {}).vendas)} sobre estoque inicial de R$ ${n((vso.TOTAL || {}).inicio)})

### Qualidade da base (o que limita a análise)

- Vendas **sem origem preenchida** dentro dos canais de captação: **${nu(qual.semOrigem)}** de
  **${nu(qual.totalPonderado)}** unidades (**${pc(qual.pctSemOrigem)}**). É o pedaço que nenhuma análise de
  origem, campanha ou linha consegue explicar.
- Campo **Corretor** preenchido em **${pc(P.coberturaCorretor)}** das linhas da base. Análise por
  corretor individual não é confiável enquanto essa cobertura estiver baixa.`}`);

  /* aviso honesto se o extrato não bater com o bloco de conferência */
  const avisos = [];
  if (conf.vgvYTD != null && Math.abs(vgvTot - conf.vgvYTD) > 2) avisos.push("VGV");
  if (conf.qtdYTD != null && Math.abs(unTot - conf.qtdYTD) > 0.01) avisos.push("quantidade de unidades");
  if (avisos.length) w(`\n> **Atenção:** ${avisos.join(" e ")} não conferem com o bloco de
> validação da planilha. Avise que os números precisam ser checados antes de usar.`);

  /* ---------------------------------------------------------- trimestres */
  w("\n## Vendas por trimestre\n");
  w("| trimestre | VGV | unidades |");
  w("|---|---|---|");
  for (let q = 0; q < 4; q++) {
    const r = tx.filter(t => Math.floor(t.mes / 3) === q);
    w(`| ${q + 1}º tri | R$ ${n(soma(r))} | ${nu(unid(r))} |`);
  }

  /* ---------------------------------------------------------- mês a mês */
  const mreal = new Array(12).fill(0), mmeta = new Array(12).fill(0);
  (((P.desemp || {}).Geral) || []).forEach(x => {
    for (let i = 0; i < 12; i++) {
      mreal[i] += (x.real && x.real[i]) || 0;
      mmeta[i] += (x.meta && x.meta[i]) || 0;
    }
  });
  w("\n## Realizado e meta, mês a mês (carteira toda)\n");
  w("| mês | realizado | meta | atingimento | unidades |");
  w("|---|---|---|---|---|");
  for (let i = 0; i < 12; i++) {
    const marca = i <= MESREF ? "" : " *(mês futuro, sem venda)*";
    w(`| ${MES[i]} | R$ ${n(mreal[i])} | R$ ${n(mmeta[i])} | ${mmeta[i] ? pc(mreal[i] / mmeta[i]) : "—"} | ${nu(unid(porMes[i] || []))}${marca} |`);
  }

  /* ---------------------------------------------------------- carteira */
  w("\n## Por empreendimento — carteira (vida inteira)\n");
  w("| empreendimento | VGV total | vendido | disponível | un. totais | vendidas | livres | % vendido |");
  w("|---|---|---|---|---|---|---|---|");
  prods.forEach(p => {
    const s = sint[p];
    w(`| ${p} | R$ ${n(s.vgvTotal)} | R$ ${n(s.vgvVendidoVida)} | R$ ${n(s.vgvDisponivel)} | ${nu(s.uniTotal)} | ${nu(s.uniVendidasVida)} | ${nu(s.uniLivres)} | ${pc(s.pctVgvVendido)} |`);
  });

  /* ---------------------------------------------------------- desempenho */
  w("\n## Por empreendimento — desempenho do período\n");
  w("| empreendimento | meta período | realizado | GAP | atingimento | unidades | ticket médio |"
    + (RESTRITO ? "" : " VSO ano | m² |"));
  w("|---|---|---|---|---|---|---|" + (RESTRITO ? "" : "---|---|"));
  prods.forEach(p => {
    const m = (metas[p] || []).slice(0, MESREF + 1).reduce((a, b) => a + b, 0);
    const r = porProd[p] || [], v = soma(r), u = unid(r);
    w(`| ${p} | R$ ${n(m)} | R$ ${n(v)} | R$ ${n(v - m)} | ${m ? pc(v / m) : "—"} | ${nu(u)} | R$ ${u ? n(v / u) : "—"} |`
      + (RESTRITO ? "" : ` ${pc((vso[p] || {}).vso)} | R$ ${n((m2[p] || {}).valorM2, 2)} |`));
  });

  /* -------------------------------------------------------- desconto */
  if (!RESTRITO) {
    w("\n## Por empreendimento — desconto\n");
    w("| empreendimento | desconto médio | teto aprovado | dentro do teto | perda nominal |");
    w("|---|---|---|---|---|");
    prods.forEach(p => {
      const x = desc[p] || {};
      const dentro = (x.media != null && x.maximo != null && Math.abs(x.media) <= Math.abs(x.maximo))
        ? "sim" : "**não**";
      w(`| ${p} | ${pc(x.media, 2)} | ${pc(x.maximo, 2)} | ${dentro} | ${x.perdaNominal ? "R$ " + n(Math.abs(x.perdaNominal)) : "—"} |`);
    });

    /* desconto médio agregado, em reais sobre tabela */
    let val = 0, tab = 0;
    tx.forEach(t => {
      if (t.desconto == null) return;
      val += t.valor || 0; tab += (t.valor || 0) / (1 + t.desconto);
    });
    if (tab) w(`\nDesconto médio da carteira no período: **${pc((val - tab) / tab, 2)}** sobre
  R$ ${n(tab)} de valor de tabela.`);

  }

  /* ---------------------------------------------------------- mês a mês por produto */
  w("\n## Realizado mês a mês, por empreendimento (R$)\n");
  const realProd = {};
  (((P.desemp || {}).Geral) || []).forEach(x => realProd[x.produto] = x.real);
  w("| empreendimento | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
  w(new Array(MESREF + 3).join("|---") + "|");
  prods.forEach(p => {
    const r = realProd[p] || new Array(12).fill(0);
    const cels = [];
    for (let i = 0; i <= MESREF; i++) cels.push(r[i] ? n(r[i]) : "—");
    w(`| ${p} | ` + cels.join(" | ") + " |");
  });

  /* ------------------------------------------- meta de unidades por produto */
  const mqtd = ((P.metas || {}).qtd) || {};
  if (Object.keys(mqtd).length) {
    w("\n## Meta de UNIDADES por empreendimento (quantidade, não R$)\n");
    w("Meta do período = janeiro até " + (meta.mesRefNome || "—") + ". Serve para ver se o");
    w("empreendimento está vendendo pouco ou vendendo barato.\n");
    w("| empreendimento | meta un. período | un. vendidas | GAP un. | atingimento em un. |");
    w("|---|---|---|---|---|");
    prods.forEach(p => {
      const arr = mqtd[p] || [];
      const m = arr.slice(0, MESREF + 1).reduce((a, b) => a + (b || 0), 0);
      const u = unid(porProd[p] || []);
      w(`| ${p} | ${nu(m)} | ${nu(u)} | ${nu(u - m)} | ${m ? pc(u / m) : "—"} |`);
    });
  }

  /* ---------------------------------------------------------- canais */
  const cm = {};
  const canaisMeta = ((P.metas || {}).canais) || {};
  Object.keys(canaisMeta).forEach(c => {
    let ano = 0, ytd = 0;
    (canaisMeta[c].produtos || []).forEach(pr => {
      const m = pr.meta || [];
      ano += m.reduce((a, b) => a + b, 0);
      ytd += m.slice(0, MESREF + 1).reduce((a, b) => a + b, 0);
    });
    if (ano || ytd) cm[c] = ytd;
  });
  w("\n## Por canal\n");
  w("| canal | realizado | meta período | atingimento | unidades | ticket médio | share do VGV |");
  w("|---|---|---|---|---|---|---|");
  Object.keys(porCanal).sort((a, b) => soma(porCanal[b]) - soma(porCanal[a])).forEach(c => {
    const r = porCanal[c], v = soma(r), u = unid(r), ytd = cm[c];
    w(`| ${c} | R$ ${n(v)} | ${ytd ? "R$ " + n(ytd) : "—"} | ${ytd ? pc(v / ytd) : "sem meta"} | ${nu(u)} | R$ ${u ? n(v / u) : "—"} | ${pc(vgvTot ? v / vgvTot : null)} |`);
  });

  /* --------------------------------------------- canal × empreendimento */
  const canaisOrd = Object.keys(porCanal).sort((a, b) => soma(porCanal[b]) - soma(porCanal[a]));
  w("\n## Canal por empreendimento (quem vende cada produto)\n");
  w("Só as combinações com venda no período. O share é sobre o VGV daquele");
  w("empreendimento, então soma 100% dentro de cada empreendimento.\n");
  w("| empreendimento | canal | VGV | unidades | % do VGV do empreendimento | ticket médio |");
  w("|---|---|---|---|---|---|");
  prods.forEach(p => {
    const rp = porProd[p] || [], vp = soma(rp);
    canaisOrd.forEach(c => {
      const r = rp.filter(t => t.canal === c);
      if (!r.length) return;
      const v = soma(r), u = unid(r);
      w(`| ${p} | ${c} | R$ ${n(v)} | ${nu(u)} | ${pc(vp ? v / vp : null)} | R$ ${u ? n(v / u) : "—"} |`);
    });
  });

  /* --------------------------------------------- canal mês a mês */
  w("\n## Canal mês a mês — VGV (R$)\n");
  w("| canal | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
  w(new Array(MESREF + 3).join("|---") + "|");
  canaisOrd.forEach(c => {
    const cel = [];
    for (let i = 0; i <= MESREF; i++) {
      const r = porCanal[c].filter(t => t.mes === i);
      cel.push(r.length ? n(soma(r)) : "—");
    }
    w(`| ${c} | ` + cel.join(" | ") + " |");
  });
  w("\n## Canal mês a mês — unidades\n");
  w("| canal | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
  w(new Array(MESREF + 3).join("|---") + "|");
  canaisOrd.forEach(c => {
    const cel = [];
    for (let i = 0; i <= MESREF; i++) {
      const r = porCanal[c].filter(t => t.mes === i);
      cel.push(r.length ? nu(unid(r)) : "—");
    }
    w(`| ${c} | ` + cel.join(" | ") + " |");
  });

  /* ------------------------------- meta × realizado por canal e produto */
  const canaisMeta2 = Object.keys(P.desemp || {}).filter(k => k !== "Geral");
  if (canaisMeta2.length) {
    w("\n## Meta e realizado por canal, dentro de cada empreendimento\n");
    w("É aqui que se vê se o problema do empreendimento é do canal próprio ou da");
    w("parceria. Linhas sem meta e sem realizado foram omitidas.\n");
    w("| empreendimento | canal | meta período | realizado | GAP | atingimento | unidades |");
    w("|---|---|---|---|---|---|---|");
    prods.forEach(p => {
      canaisMeta2.forEach(c => {
        const x = (P.desemp[c] || []).filter(y => y.produto === p)[0];
        if (!x) return;
        if (!x.metaYTD && !x.realYTD) return;
        w(`| ${p} | ${c} | R$ ${n(x.metaYTD)} | R$ ${n(x.realYTD)} | R$ ${n((x.realYTD || 0) - (x.metaYTD || 0))} | ${x.metaYTD ? pc(x.realYTD / x.metaYTD) : "sem meta"} | ${nu(x.qtdYTD)} |`);
      });
    });
  }

  /* ---------------------------------------------------------- gerentes */
  /* No acesso restrito o gerente de fora de Parcerias não vem do extrato (a
     venda chega somada e sem nome): vem do resumo mensal por gerente, que o
     próprio relatório usa naquele acesso. Sem isso a tabela mostraria os
     gerentes de House zerados — erro pior que ausência. */
  const resumoGer = {};
  (P.gerenteMes || []).forEach(x => {
    resumoGer[x.nome] = {
      v: (x.mes || []).reduce((a, b) => a + (b || 0), 0),
      u: (x.qtd || []).reduce((a, b) => a + (b || 0), 0),
      equipe: x.bloco || "House",
    };
  });
  const gerTodos = roster.concat(Object.keys(resumoGer).filter(g => roster.indexOf(g) < 0));
  const vgvGer = g => resumoGer[g] ? resumoGer[g].v : soma(porGer[g] || []);
  w("\n## Por gerente\n");
  w("Só os gerentes cadastrados da Planik.");
  /* Esta ressalva só faz sentido onde existe Parcerias na base. No acesso do
     Diretor House não há imobiliária nenhuma, e mandar procurar a seção
     Parceiros seria mandar procurar uma aba que ele não tem. */
  if (VPARC) {
    w("Toda venda de Parcerias tem um gerente da Planik conduzindo — a imobiliária");
    w("externa que trouxe o cliente está na seção **Parceiros**, mais abaixo, não");
    w("nesta lista.");
  }
  if (RESTRITO) w(`Esta lista é só o time de ${VCANAL}: os gerentes dos outros canais não chegam a este acesso.`);
  w("");
  w("| gerente | equipe | VGV | unidades | ticket médio | última venda |");
  w("|---|---|---|---|---|---|");
  gerTodos.slice().sort((a, b) => vgvGer(b) - vgvGer(a)).forEach(g => {
    const res = resumoGer[g];
    const r = porGer[g] || [];
    const v = res ? res.v : soma(r), u = res ? res.u : unid(r);
    if (!v && !u) return;
    let ult = "";
    r.forEach(t => { if ((t.data || "") > ult) ult = t.data; });
    const ultbr = res ? "—" : (ult ? ult.split("-").reverse().join("/") : "—");
    const equipe = res ? res.equipe : (gerHouse.indexOf(g) >= 0 ? "House" : "Parcerias");
    w(`| ${g} | ${equipe} | R$ ${n(v)} | ${nu(u)} | R$ ${u ? n(v / u) : "—"} | ${ultbr} |`);
  });

  /* ----------------------------------- gerentes: meta, atingimento, ritmo */
  const G = P.gerentes || {};
  const par = G.parametros || {};
  const blocos = [["plkGeral", "House (Salão + Online)"], ["plkSalao", "House · Salão"],
                  ["plkOnline", "House · Online"], ["parcerias", "Parcerias"],
                  ["lancadoras", "Lançadora"]];
  const temMeta = blocos.filter(b => (G[b[0]] || []).length);
  if (temMeta.length) {
    w("\n### Meta e atingimento por gerente\n");
    w("Duas datas diferentes, e confundir as duas gera conclusão errada:");
    w("**na equipe desde** é quando a pessoa entrou; **meta individual desde** é o");
    w("primeiro mês em que ela passou a ter meta própria na planilha. Antes disso a");
    w("meta era do canal, não da pessoa, e o acumulado dela não é comparável com o de");
    w("quem tem meta o ano todo.\n");
    w("| gerente | recorte | na equipe desde | meta individual desde | meta período | realizado | GAP | atingimento | unidades |");
    w("|---|---|---|---|---|---|---|---|---|");
    temMeta.forEach(b => {
      (G[b[0]] || []).slice()
        .sort((x, y) => (y.realYTD || 0) - (x.realYTD || 0))
        .forEach(x => {
          const pa = par[x.nome] || {};
          const desde = pa.mesEntrada ? MES[pa.mesEntrada - 1] : "—";
          /* o primeiro mês com meta de verdade; se o gerente não tem meta
             nenhuma (caso da Lançadora), cai para o primeiro mês com registro */
          let ini = -1;
          for (let i = 0; i < 12; i++) if ((x.meta || [])[i]) { ini = i; break; }
          if (ini < 0) for (let i = 0; i < 12; i++) {
            if ((x.meta || [])[i] != null || (x.real || [])[i] != null) { ini = i; break; }
          }
          const iniTxt = ini >= 0 ? MES[ini] : "—";
          w(`| ${x.nome} | ${b[1]} | ${desde} | ${iniTxt} | R$ ${n(x.metaYTD)} | R$ ${n(x.realYTD)} | R$ ${n((x.realYTD || 0) - (x.metaYTD || 0))} | ${x.metaYTD ? pc(x.realYTD / x.metaYTD) : "sem meta"} | ${nu(x.qtdYTD)} |`);
        });
    });
    w("\nAtenção: o VGV de um gerente nesta tabela pode divergir do total dele na tabela");
    w("anterior (que soma todas as vendas dele no ano). A diferença é justamente o");
    w("período anterior à meta individual.");
  }

  /* ----------------------------------- gerentes: realizado mês a mês */
  const serie = (G.plkGeral || []).concat(G.parcerias || []).concat(G.lancadoras || []);
  if (serie.length) {
    w("\n### Realizado mês a mês por gerente (R$) — vazio significa antes da entrada\n");
    w("| gerente | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
    w(new Array(MESREF + 3).join("|---") + "|");
    serie.forEach(x => {
      const cel = [];
      for (let i = 0; i <= MESREF; i++) {
        const v = (x.real || [])[i];
        cel.push(v == null ? "—" : (v ? n(v) : "0"));
      }
      w(`| ${x.nome} | ` + cel.join(" | ") + " |");
    });
  }

  if ((G.papeis || []).length) {
    w("\n### Responsáveis por bloco (meta consolidada, não é venda pessoal)\n");
    w("| nome | papel | meta período | realizado | atingimento |");
    w("|---|---|---|---|---|");
    G.papeis.forEach(x => {
      w(`| ${x.nome} | ${String(x.papel || "").replace(/_/g, " ")} | R$ ${n(x.metaYTD)} | R$ ${n(x.realYTD)} | ${x.metaYTD ? pc(x.realYTD / x.metaYTD) : "—"} |`);
    });
  }

  /* ------------------------------------------------------------ origem */
  if (!RESTRITO) {
    const base = tx.filter(t => (t.peso || 0) > 0);
    const mkt = base.filter(t => CANAIS_MKT.indexOf(t.canal) >= 0);
    const uBase = unid(base), uMkt = unid(mkt), sem = uBase - uMkt;
    w("\n## Origem das vendas (só canais com captação própria: Salão e Online)\n");
    w(`Do total de **${nu(uBase)}** unidades vendidas, **${nu(uMkt)}** vieram de captação
  própria (${pc(uBase ? uMkt / uBase : null)}). As outras **${nu(sem)}** (${pc(uBase ? sem / uBase : null)}) vieram de
  Parcerias, Lançadora ou Interna e **não têm origem de captação** — entram no
  denominador do share, mas ficam fora do ranking de origens.\n`);
    const og = {}, ogv = {};
    mkt.forEach(t => {
      const o = t.origem || "Não informada";
      og[o] = (og[o] || 0) + t.peso;
      ogv[o] = (ogv[o] || 0) + (t.valor || 0);
    });
    w("| origem | unidades | VGV | ticket médio | share do total | share da captação |");
    w("|---|---|---|---|---|---|");
    Object.keys(og).sort((a, b) => og[b] - og[a]).forEach(o => {
      w(`| ${o} | ${nu(og[o])} | R$ ${n(ogv[o])} | R$ ${og[o] ? n(ogv[o] / og[o]) : "—"} | ${pc(uBase ? og[o] / uBase : null)} | ${pc(uMkt ? og[o] / uMkt : null)} |`);
    });

    /* -------------------------------------------- ORIGEM POR EMPREENDIMENTO */
    w("\n## Origem por empreendimento (a aba \"Origem por Empreendimento\")\n");
    w("Todas as combinações com venda no período, inclusive as pseudo-origens dos");
    w("canais sem captação própria (Parcerias, Lançadora, Interna) — elas estão aqui");
    w("marcadas com *(canal, não é captação)* para o total fechar com as " + nu(uBase) + " unidades.");
    w("O share é sobre as unidades daquele empreendimento.\n");
    w("| empreendimento | origem | unidades | VGV | ticket médio | % un. do empreendimento |");
    w("|---|---|---|---|---|---|");
    const PSEUDO = ["Parcerias", "Lançadora", "Interna", "Vaga"];
    prods.forEach(p => {
      const rp = base.filter(t => t.produto === p);
      const up = unid(rp);
      const agr = {};
      rp.forEach(t => {
        const o = t.origem || "Não informada";
        const a = agr[o] = agr[o] || { u: 0, v: 0 };
        a.u += t.peso; a.v += (t.valor || 0);
      });
      Object.keys(agr).sort((a, b) => agr[b].u - agr[a].u).forEach(o => {
        const a = agr[o];
        const marca = PSEUDO.indexOf(o) >= 0 ? " *(canal, não é captação)*" : "";
        w(`| ${p} | ${o}${marca} | ${nu(a.u)} | R$ ${n(a.v)} | R$ ${a.u ? n(a.v / a.u) : "—"} | ${pc(up ? a.u / up : null)} |`);
      });
    });

    /* -------------------------------------------- origem mês a mês */
    w("\n## Origem mês a mês (unidades, só canais de captação)\n");
    w("| origem | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
    w(new Array(MESREF + 3).join("|---") + "|");
    Object.keys(og).sort((a, b) => og[b] - og[a]).forEach(o => {
      const cel = [];
      for (let i = 0; i <= MESREF; i++) {
        const r = mkt.filter(t => t.mes === i && (t.origem || "Não informada") === o);
        cel.push(r.length ? nu(unid(r)) : "—");
      }
      w(`| ${o} | ` + cel.join(" | ") + " |");
    });

    /* ------------------------------------- o funil origem → campanha → linha
       As três colunas da Base não são dimensões paralelas: Campanha só existe
       quando a Origem é "Online", e Linha só existe dentro de uma campanha.
       Se o assistente tratar as três como listas soltas, ele soma coisas que
       não somam e responde percentual que não fecha. */
    const DIG = "Online";
    const comCamp = mkt.filter(t => t.campanha);
    const comLinha = mkt.filter(t => t.linha);
    const digi = mkt.filter(t => String(t.origem || "").toLowerCase() === DIG.toLowerCase());
    w("\n## O funil da captação: origem → campanha → linha\n");
    w(`As vendas de Salão e Online passam por um funil de três níveis, e ele é
**hierárquico**, não paralelo:

1. **Origem** — de onde nasceu a venda (Online, Espontânea, PAP, Carteira Corretor,
   Indicação…). Está preenchida em praticamente toda venda de captação própria.
2. **Campanha** — só existe quando a origem é **${DIG}**. É a campanha que trouxe
   o lead (Instagram, Site Planik, Google adwords…).
3. **Linha de campanha** — a peça criativa dentro daquela campanha.

Números deste período: **${nu(unid(mkt))}** unidades de captação própria, das quais
**${nu(unid(digi))}** com origem ${DIG}, **${nu(unid(comCamp))}** com campanha e
**${nu(unid(comLinha))}** com linha.

Nunca compare uma campanha com uma origem como se fossem do mesmo nível — "Instagram"
não concorre com "PAP": PAP é uma origem, Instagram é uma campanha DENTRO da origem
${DIG}. E o total de campanhas ser menor que o de origens não é dado faltando, é o funil.\n`);

    if (comCamp.length) {
      const agrC = {};
      comCamp.forEach(t => { const a = agrC[t.campanha] = agrC[t.campanha] || { u: 0, v: 0, lin: {} };
        a.u += t.peso; a.v += (t.valor || 0);
        if (t.linha) a.lin[t.linha] = (a.lin[t.linha] || 0) + (t.valor || 0); });
      w("\n### Campanhas com venda (dentro da origem " + DIG + ")\n");
      w("| campanha | unidades | VGV | ticket médio | linhas | linha que mais vendeu |");
      w("|---|---|---|---|---|---|");
      Object.keys(agrC).sort((a, b) => agrC[b].v - agrC[a].v).forEach(k => {
        const a = agrC[k];
        const ord = Object.keys(a.lin).sort((x, y) => a.lin[y] - a.lin[x]);
        w(`| ${k} | ${nu(a.u)} | R$ ${n(a.v)} | R$ ${a.u ? n(a.v / a.u) : "—"} | ${ord.length} | ${
          ord[0] ? ord[0] + " (R$ " + n(a.lin[ord[0]]) + ")" : "—"} |`);
      });
    }

    if (comLinha.length) {
      const agrL = {};
      comLinha.forEach(t => { const k = t.linha;
        const a = agrL[k] = agrL[k] || { u: 0, v: 0, camp: t.campanha, prod: {} };
        a.u += t.peso; a.v += (t.valor || 0);
        a.prod[t.produto] = (a.prod[t.produto] || 0) + t.peso; });
      w("\n### Linhas criativas com venda\n");
      w("| linha | campanha | unidades | VGV | ticket médio | empreendimento que mais vendeu |");
      w("|---|---|---|---|---|---|");
      Object.keys(agrL).sort((a, b) => agrL[b].v - agrL[a].v).slice(0, 30).forEach(k => {
        const a = agrL[k];
        const tp = Object.keys(a.prod).sort((x, y) => a.prod[y] - a.prod[x])[0] || "—";
        w(`| ${k} | ${a.camp || "—"} | ${nu(a.u)} | R$ ${n(a.v)} | R$ ${a.u ? n(a.v / a.u) : "—"} | ${tp} |`);
      });
    }

    if (comCamp.length) {
      w("\n### Campanha por empreendimento (unidades)\n");
      const agr = {};
      comCamp.forEach(t => { const k = t.produto + "||" + t.campanha;
        const a = agr[k] = agr[k] || { u: 0, v: 0 };
        a.u += t.peso; a.v += (t.valor || 0); });
      w("| empreendimento | campanha | unidades | VGV |");
      w("|---|---|---|---|");
      Object.keys(agr).sort((a, b) => agr[b].u - agr[a].u).forEach(k => {
        const p = k.split("||");
        w(`| ${p[0]} | ${p[1]} | ${nu(agr[k].u)} | R$ ${n(agr[k].v)} |`);
      });
    }
    w(`\nEsta base não tem investimento, impressão nem lead — só a venda que chegou.
Não dá para calcular CPL, CAC nem ROI; se perguntarem, diga isso em vez de estimar.`);
  }

  /* ---------------------------------------------------------- parceiros */
  /* A coluna "Parceiro" da Base é a imobiliária externa que trouxe o cliente.
     Ela só existe no canal Parcerias — nos outros a venda é nossa e o campo
     vem vazio. Vale para os dois acessos: quem tem visão restrita vê
     Parcerias inteira, então esta seção é justamente a parte que interessa a
     ele. Sem ela o assistente respondia "não tenho esse dado" para a
     pergunta mais óbvia do canal: quem vende mais. */
  const nomeParceiro = t => {
    const v = String(t.parceiro == null ? "" : t.parceiro).trim();
    return (!v || /^[-–—·.]+$/.test(v)) ? "Sem parceiro" : v;
  };
  const txParc = tx.filter(t => t.canal === "Parcerias");
  if (txParc.length) {
    const pAcc = {};
    txParc.forEach(t => {
      const k = nomeParceiro(t);
      const a = pAcc[k] || (pAcc[k] = { v: 0, u: 0, ult: "", ger: {}, prod: {}, mes: new Array(12).fill(0), msSet: {} });
      a.v += (t.valor || 0); a.u += (t.peso || 0);
      if ((t.data || "") > a.ult) a.ult = t.data || "";
      if (t.mes != null) a.mes[t.mes] += (t.valor || 0);
      if (t.mes != null && (t.valor || 0) > 0) a.msSet[t.mes] = 1;
      a.ger[t.gerente || "—"] = (a.ger[t.gerente || "—"] || 0) + (t.valor || 0);
      a.prod[t.produto] = (a.prod[t.produto] || 0) + (t.valor || 0);
    });
    const maior = o => { const e = Object.keys(o).sort((a, b) => o[b] - o[a]); return e.length ? e[0] : "—"; };
    const nomes = Object.keys(pAcc).sort((a, b) => pAcc[b].v - pAcc[a].v);
    /* Dias sem vender, contados AQUI e não pelo modelo. Fazer o modelo subtrair
       datas de 64 linhas é caro e frágil: ele gasta o orçamento inteiro
       raciocinando e às vezes erra a conta. A régua é a mesma da tela — 30 dias
       é atenção, 60 é alerta. */
    const HOJE = new Date().toISOString().slice(0, 10);
    const diasDe = iso => {
      if (!iso) return null;
      const d = Math.round((Date.parse(HOJE) - Date.parse(iso)) / 86400000);
      return isFinite(d) ? d : null;
    };
    const nomeados = nomes.filter(x => x !== "Sem parceiro");
    const vParc = txParc.reduce((s2, t) => s2 + (t.valor || 0), 0);
    const uParc = txParc.reduce((s2, t) => s2 + (t.peso || 0), 0);
    let ac = 0, n80 = 0;
    for (const x of nomeados) { ac += pAcc[x].v; n80++; if (vParc && ac / vParc >= 0.8) break; }
    const top5 = nomeados.slice(0, 5).reduce((s2, x) => s2 + pAcc[x].v, 0);

    w("\n## Parceiros (imobiliárias externas do canal Parcerias)\n");
    w(`O canal Parcerias trabalha com imobiliárias externas: quem leva o cliente até a
mesa é o parceiro, e o gerente da Planik conduz a venda. A coluna **Parceiro** da
Base só é preenchida neste canal — em Salão, Online, Lançadora e Interna a venda é
nossa e o campo fica vazio. Toda análise por parceiro é, portanto, análise **dentro
de Parcerias**, nunca da empresa inteira. No relatório isso é a aba **Parceiros**.\n`);
    w(`- Parcerias no período: **R$ ${n(vParc)}** em **${nu(uParc)}** unidades.`);
    w(`- **${nomeados.length}** parceiros nomeados com venda.`);
    w(`- **${n80}** deles concentram 80% do VGV do canal; os 5 maiores fazem **${pc(vParc ? top5 / vParc : null)}**.`);
    if (pAcc["Sem parceiro"]) w(`- **R$ ${n(pAcc["Sem parceiro"].v)}** em ${nu(pAcc["Sem parceiro"].u)} unidade(s) estão **sem parceiro preenchido** na Base: contam no total do canal, mas ficam fora do ranking.`);
    w("");
    w(`- **Núcleo**: os **${n80}** primeiros do ranking, que juntos fazem 80% do VGV do canal. É o
recorte que a aba Parceiros usa na "Leitura rápida" — quando a tela fala em "parceiros do
núcleo", são exatamente estes, e a lista está marcada na coluna **núcleo** da tabela abaixo.`);
    w(`- Datas contadas contra **${HOJE.split("-").reverse().join("/")}**. "Dias sem vender" é a
distância entre hoje e a última venda daquele parceiro; acima de 60 dias a tela marca em vermelho.`);
    w("");
    w(`- **Três réguas, três respostas.** "Quem mais vende" não é uma pergunta só: em **VGV** ganha
quem traz mais dinheiro, em **unidades** ganha quem gira mais, e em **recorrência** (meses com venda)
ganha quem entrega com constância. Elas divergem — há parceiro no topo do VGV com **uma unidade** no
ano, uma venda cara e não um parceiro de giro. Ao responder "quem mais vendeu", diga por qual régua
está respondendo e, se as respostas forem diferentes, dê as duas. A aba Parceiros tem o mesmo botão.`);
    w("");
    w("| # | parceiro | núcleo | VGV | unidades | meses com venda | ticket médio | share do canal | empreendimentos | gerentes | principal gerente | última venda | dias sem vender |");
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    nomes.forEach((x, i) => {
      const a = pAcc[x];
      const pos = x === "Sem parceiro" ? "—" : String(nomeados.indexOf(x) + 1);
      const noNucleo = x !== "Sem parceiro" && nomeados.indexOf(x) < n80;
      const d = diasDe(a.ult);
      w(`| ${pos} | ${x} | ${noNucleo ? "sim" : "não"} | R$ ${n(a.v)} | ${nu(a.u)} | ${Object.keys(a.msSet).length} | R$ ${a.u ? n(a.v / a.u) : "—"} | ${pc(vParc ? a.v / vParc : null)} | ${Object.keys(a.prod).length} | ${Object.keys(a.ger).length} | ${maior(a.ger)} | ${a.ult ? a.ult.split("-").reverse().join("/") : "—"} | ${d == null ? "—" : d} |`);
    });

    /* Os mesmos parceiros, nas outras duas ordens. Escrever as três listas
       custa pouco e evita que o modelo tenha de reordenar 64 linhas de cabeça
       — que é caro e às vezes sai errado. */
    const msDe = x => Object.keys(pAcc[x].msSet).length;
    /* mesmas colunas nas três listas: só a ORDEM muda. Repetir a métrica numa
       coluna extra só duplicava número e confundia a leitura. */
    const linhaRk = arr => {
      w("| # | parceiro | VGV | unidades | meses com venda | ticket médio | principal gerente |");
      w("|---|---|---|---|---|---|---|");
      arr.slice(0, 15).forEach((x, i) => {
        const a = pAcc[x];
        w(`| ${i + 1} | ${x} | R$ ${n(a.v)} | ${nu(a.u)} | ${msDe(x)} | R$ ${a.u ? n(a.v / a.u) : "—"} | ${maior(a.ger)} |`);
      });
    };
    const porUn = nomeados.slice().sort((a, b) => pAcc[b].u - pAcc[a].u || pAcc[b].v - pAcc[a].v);
    const porRec = nomeados.slice().sort((a, b) => msDe(b) - msDe(a) || pAcc[b].u - pAcc[a].u || pAcc[b].v - pAcc[a].v);
    w("\n### Ranking por UNIDADES (quem mais gira)\n");
    w("Os 15 maiores em quantidade de unidades. Compare com o ranking por VGV acima: as posições mudam.\n");
    linhaRk(porUn);
    w("\n### Ranking por RECORRÊNCIA (quem entrega com mais constância)\n");
    w(`Meses distintos com venda no ano. Quatro unidades num mês só não é recorrência — é um evento.
Esta é a régua para "quais são os parceiros mais recorrentes".\n`);
    linhaRk(porRec);

    /* A pergunta "quem do núcleo parou de vender" já veio do usuário uma vez e
       custou o orçamento inteiro de raciocínio. Com a lista pronta ele só lê. */
    const parados = nomeados.filter(x => nomeados.indexOf(x) < n80)
      .filter(x => { const d = diasDe(pAcc[x].ult); return d != null && d > 60; })
      .sort((a, b) => pAcc[b].v - pAcc[a].v);
    w("\n### Parceiros do núcleo parados há mais de 60 dias\n");
    if (!parados.length) {
      w("Nenhum. Todos os parceiros do núcleo venderam nos últimos 60 dias.");
    } else {
      w(`São **${parados.length}** dos **${n80}** parceiros do núcleo. Esta é a lista completa —
quando perguntarem "quais são", responda com estes nomes, sem pedir para dividir a pergunta.
Ordenados por VGV, do maior para o menor.\n`);
      w("| parceiro | VGV | unidades | principal gerente | última venda | dias sem vender |");
      w("|---|---|---|---|---|---|");
      parados.forEach(x => {
        const a = pAcc[x];
        w(`| ${x} | R$ ${n(a.v)} | ${nu(a.u)} | ${maior(a.ger)} | ${a.ult.split("-").reverse().join("/")} | ${diasDe(a.ult)} |`);
      });
    }

    /* principal parceiro de cada gerente — a pergunta que a diretoria faz */
    const gAcc = {};
    txParc.forEach(t => {
      const g = t.gerente || "—";
      const a = gAcc[g] || (gAcc[g] = { v: 0, u: 0, parc: {} });
      a.v += (t.valor || 0); a.u += (t.peso || 0);
      const k = nomeParceiro(t);
      if (k !== "Sem parceiro") a.parc[k] = (a.parc[k] || 0) + (t.valor || 0);
    });
    w("\n### Principal parceiro de cada gerente de Parcerias\n");
    w("**Dependência** é a fatia do VGV do gerente que passa pelo maior parceiro dele.");
    w("Acima de 50% o resultado está apoiado num relacionamento só — é performance e");
    w("risco de carteira ao mesmo tempo, e vale citar os dois lados ao responder.\n");
    w("| gerente | VGV em Parcerias | unidades | nº de parceiros | principal parceiro | VGV do principal | dependência | top 3 |");
    w("|---|---|---|---|---|---|---|---|");
    Object.keys(gAcc).sort((a, b) => gAcc[b].v - gAcc[a].v).forEach(g => {
      const a = gAcc[g];
      const ord = Object.keys(a.parc).sort((x, y) => a.parc[y] - a.parc[x]);
      const pr = ord[0];
      const t3 = ord.slice(0, 3).reduce((s2, x) => s2 + a.parc[x], 0);
      w(`| ${g} | R$ ${n(a.v)} | ${nu(a.u)} | ${ord.length} | ${pr || "—"} | R$ ${pr ? n(a.parc[pr]) : "—"} | ${pr && a.v ? pc(a.parc[pr] / a.v) : "—"} | ${a.v ? pc(t3 / a.v) : "—"} |`);
    });

    /* parceiro x empreendimento, só quem importa — a matriz inteira seria
       longa demais para o contexto e os nomes de cauda não mudam decisão */
    const relev = nomeados.slice(0, 15);
    if (relev.length) {
      w("\n### Parceiro × empreendimento (VGV dos 15 maiores parceiros)\n");
      const cols = prods.filter(p => txParc.some(t => t.produto === p));
      w("| parceiro | " + cols.join(" | ") + " |");
      w(new Array(cols.length + 3).join("|---") + "|");
      relev.forEach(x => {
        w(`| ${x} | ` + cols.map(p => pAcc[x].prod[p] ? "R$ " + n(pAcc[x].prod[p]) : "—").join(" | ") + " |");
      });
    }

    /* mês a mês dos 10 maiores: é o que responde "quem cresceu, quem parou" */
    const dez = nomeados.slice(0, 10);
    if (dez.length) {
      w("\n### VGV mês a mês dos 10 maiores parceiros\n");
      w("| parceiro | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
      w(new Array(MESREF + 3).join("|---") + "|");
      dez.forEach(x => {
        const c = [];
        for (let i = 0; i <= MESREF; i++) c.push(pAcc[x].mes[i] ? n(pAcc[x].mes[i]) : "—");
        w(`| ${x} | ` + c.join(" | ") + " |");
      });
    }
  }

  /* -------------------------------------------------------- VSO mensal */
  if (!RESTRITO) {
    const vm = ((P.vso || {}).mensalTotal) || [];
    w("\n## VSO mês a mês (percentual do estoque vendido em cada mês)\n");
    w("| " + MES.slice(0, MESREF + 1).join(" | ") + " |");
    w(new Array(MESREF + 2).join("|---") + "|");
    const cels = [];
    for (let i = 0; i <= MESREF; i++) cels.push(vm[i] == null ? "—" : pc(vm[i]));
    w("| " + cels.join(" | ") + " |");

    const vmp = ((P.vso || {}).mensalPorProduto) || {};
    if (Object.keys(vmp).length) {
      w("\n## VSO mês a mês por empreendimento (% do estoque vendido no mês)\n");
      w("| empreendimento | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
      w(new Array(MESREF + 3).join("|---") + "|");
      prods.forEach(p => {
        const a = vmp[p] || [];
        const c = [];
        for (let i = 0; i <= MESREF; i++) c.push(a[i] == null ? "—" : pc(a[i]));
        w(`| ${p} | ` + c.join(" | ") + " |");
      });
    }

    const vd = ((P.vso || {}).mensalDisponivel) || {};
    if (Object.keys(vd).length) {
      w("\n## Estoque disponível mês a mês, por empreendimento (R$)\n");
      w("Cai conforme vende. Serve para ver quem está ficando sem produto para vender.\n");
      w("| empreendimento | " + MES.slice(0, MESREF + 1).join(" | ") + " |");
      w(new Array(MESREF + 3).join("|---") + "|");
      prods.forEach(p => {
        const a = vd[p] || [];
        const c = [];
        for (let i = 0; i <= MESREF; i++) c.push(a[i] == null ? "—" : n(a[i]));
        w(`| ${p} | ` + c.join(" | ") + " |");
      });
    }
  }

  return L.join("\n") + "\n";
}

/* Cache de 5 minutos: a planilha muda a cada 30 min, no máximo, então não faz
   sentido reler e remontar a base a cada pergunta. */
/* Um cache por documento: misturar os dois serviria a base completa para quem
   tem visão restrita, dependendo de quem perguntou primeiro. */
const cacheCtx = {};

/* Qual documento cada visão lê. Lista fechada de propósito: uma visão nova e
   ainda não mapeada aqui cai em "atual" — quer dizer, receberia a empresa
   inteira. Melhor a visão desconhecida não abrir o chat do que abrir demais. */
const DOC_DA_VISAO = { parcerias: "parcerias", house: "house",
                       /* a Gestora de Vendas é cortina, não trava: o recorte
                          dela é de abas, e o dado é o mesmo do relatório
                          completo. Está escrito aqui para ninguém achar que
                          foi esquecido. */
                       gestora: "atual" };

async function baseDeConhecimento(idToken, projectId, visao) {
  const doc = visao ? (DOC_DA_VISAO[visao] || null) : "atual";
  if (!doc) throw new Error("visão sem documento: " + visao);
  const agora = Date.now();
  const c = cacheCtx[doc];
  if (c && agora - c.quando < 5 * 60 * 1000) return c.texto;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/dados/${doc}`;
  const r = await fetch(url, { headers: { Authorization: "Bearer " + idToken } });
  if (!r.ok) throw new Error("firestore " + doc + " " + r.status);
  const d = await r.json();
  const cru = ((d.fields || {}).payloadStr || {}).stringValue;
  if (!cru) throw new Error("payload vazio");
  const texto = montaContexto(JSON.parse(cru));
  cacheCtx[doc] = { texto, quando: agora };
  return texto;
}

/* =================================================================== */

const CORS = (origem) => ({
  "Access-Control-Allow-Origin": origem,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
});

const erro = (msg, status, origem) =>
  new Response(JSON.stringify({ erro: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS(origem) },
  });

/* Confere o token do Firebase pelo próprio Google. Mais simples e mais seguro
   que verificar a assinatura JWT à mão, e é o Google quem diz se expirou. */
async function quemE(idToken, apiKey) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!r.ok) return null;
  const d = await r.json();
  const u = (d.users || [])[0];
  if (!u || !u.email || u.disabled) return null;
  return String(u.email).toLowerCase();
}

/* A permissão mora no mesmo lugar que a engrenagem já edita: config/acessos.
   Assim o admin liga e desliga o chat sem republicar nada. */
async function acessoDe(login, idToken, projectId, listaEmergencia) {
  if (login === "admin") return { chat: true, visao: "" };
  const emergencia = String(listaEmergencia || "").toLowerCase()
    .split(",").map(s => s.trim()).filter(Boolean);
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}` +
      `/databases/(default)/documents/config/acessos`;
    const r = await fetch(url, { headers: { Authorization: "Bearer " + idToken } });
    if (!r.ok) return { chat: emergencia.indexOf(login) >= 0, visao: "" };
    const d = await r.json();
    const bruto = ((d.fields || {}).lista || {}).stringValue;
    const lista = bruto ? JSON.parse(bruto) : {};
    const a = lista[login] || {};
    /* A lista de emergência libera o chat, nunca a visão: se a pessoa tem
       recorte restrito, ele vale mesmo quando o chat foi ligado na marra. */
    return { chat: !!a.chat || emergencia.indexOf(login) >= 0, visao: a.visao || "" };
  } catch (e) {
    return { chat: false, visao: "" };
  }
}

/* O assistente da visão restrita lê o MESMO documento que o relatório dela:
   o que já vem sem valor e sem desconto de unidade dos outros canais. Ele não
   "evita falar" do que não pode — ele não tem como saber. Instrução de
   comportamento é só o acabamento; a trava é a fonte. */
const RECORTE = {
  parcerias: `

## Limite deste acesso

Quem está perguntando é o Diretor de Parcerias, e a base acima é a operação
dele: só as vendas de Parcerias. Os outros canais da empresa — Salão, Online,
Lançadora e Interna — não foram omitidos por pudor, foram retirados antes de
chegar até você. Você não tem como saber o resultado, a meta, o desconto ou o
gerente deles, e não deve tentar deduzir.

A única coisa que atravessa esse corte é a **carteira**: VGV total dos
empreendimentos, quanto já foi vendido na vida de cada um e quanto sobra de
estoque. Isso é patrimônio da empresa e ele acompanha por direito.

Quando perguntarem por outro canal, ou por "a empresa toda" em resultado, diga
em uma frase que o acesso cobre Parcerias e siga com a leitura do que você tem
— que é bastante: ele tem o desconto, a unidade, o gerente, o mês e o
empreendimento de cada venda do canal dele.

As abas deste acesso são seis: Síntese, Visão Geral, Vendas por
Empreendimento, Canais, Gerentes e Parceiros. Não mande conferir em Desconto por
Empreendimento, Origem por Empreendimento nem VSO — elas não existem para ele.

A aba Parceiros é a casa dele: ranking das imobiliárias externas, parceiro por
empreendimento, por gerente e por mês, e o principal parceiro de cada gerente.
Quando a pergunta for de relacionamento — quem vende mais, quem parou de vender,
de quem cada gerente depende — é para lá que você manda conferir.`,

  house: `

## Limite deste acesso

Quem está perguntando é o Diretor House, e a base acima é a operação dele: as
vendas da equipe própria da Planik, Salão e Online juntos. Os outros canais —
Parcerias, Lançadora e Interna — não foram omitidos por pudor, foram retirados
antes de chegar até você. Você não tem como saber o resultado, a meta, o
desconto ou o gerente deles, e não deve tentar deduzir.

A única coisa que atravessa esse corte é a **carteira**: VGV total dos
empreendimentos, quanto já foi vendido na vida de cada um e quanto sobra de
estoque. Isso é patrimônio da empresa e ele acompanha por direito.

House é um recorte de dois canais, e essa é a diferença que mais gera pergunta:
onde o relatório diz "geral", o geral dele é **Salão + Online somados**, mês a
mês — meta, realizado, GAP e atingimento. Salão e Online também aparecem
separados, e comparar os dois é metade do trabalho dele. Se a pergunta não
disser qual dos dois, responda pelo somado e ofereça a abertura.

Quando perguntarem por outro canal, ou por "a empresa toda" em resultado, diga
em uma frase que o acesso cobre House e siga com a leitura do que você tem —
que é bastante: ele tem a unidade, o gerente, o mês e o empreendimento de cada
venda da equipe dele.

As abas deste acesso são cinco: Síntese, Visão Geral, Vendas por Empreendimento,
Canais e Gerentes. Não mande conferir em Desconto por Empreendimento, Origem por
Empreendimento, VSO nem Parceiros — elas não existem para ele. Origem de
captação merece um cuidado extra: origem, campanha e linha de campanha só
existem em Salão e Online, ou seja, são dados **dele** — mas não estão nesta
base, porque a régua de share da aba Origem inclui os outros canais no
denominador. Se ele pedir origem ou campanha, não invente e não diga que o dado
não existe: diga que ainda não está neste acesso e que o Jorge pode habilitar.`,
};

export default {
  async fetch(request, env) {
    const origem = env.ORIGEM || "*";

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS(origem) });
    if (request.method !== "POST")
      return erro("Método não permitido.", 405, origem);

    let corpo;
    try { corpo = await request.json(); }
    catch (e) { return erro("Requisição inválida.", 400, origem); }

    const { idToken, mensagens } = corpo || {};
    if (!idToken) return erro("Sessão não identificada. Entre de novo no relatório.", 401, origem);
    if (!Array.isArray(mensagens) || !mensagens.length)
      return erro("Nenhuma pergunta recebida.", 400, origem);

    const email = await quemE(idToken, env.FIREBASE_API_KEY);
    if (!email) return erro("Sessão expirada. Entre de novo no relatório.", 401, origem);
    const login = email.split("@")[0];

    const acesso = await acessoDe(login, idToken, env.PROJECT_ID, env.CHAT_LOGINS);
    if (!acesso.chat)
      return erro("Seu acesso ainda não tem o assistente liberado. Fale com a Inteligência Comercial.",
        403, origem);

    let base;
    try { base = await baseDeConhecimento(idToken, env.PROJECT_ID, acesso.visao); }
    catch (e) {
      console.log("[base] " + (e && e.message));
      return erro("Não consegui ler os dados do relatório agora. Tente de novo em instantes.",
        502, origem);
    }

    /* Guarda-chuva de consumo: histórico curto e resposta limitada. Com crédito
       dividido entre várias pessoas, uma conversa longa de um usuário
       consumiria o saldo de todos. */
    const historico = mensagens.slice(-10)
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      /* a pergunta é curta; a resposta anterior agora é longa e é dela que sai o
         contexto do "e por quê?" que vem depois. Cortar as duas no mesmo tamanho
         jogaria fora justamente a parte analítica. */
      .map(m => ({
        role: m.role,
        content: String(m.content || "").slice(0, m.role === "assistant" ? 12000 : 4000),
      }));
    if (!historico.length) return erro("Nenhuma pergunta válida.", 400, origem);

    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.MODELO || "claude-sonnet-5",
        /* O modelo raciocina antes de escrever, e o limite cobre os dois. Com
           1200 uma pergunta ampla gastava a cota inteira pensando e não sobrava
           texto nenhum — o usuário via "não devolveu resposta". Com 8000 isso
           voltou a acontecer numa pergunta que era simples de enunciar e cara de
           calcular ("quais parceiros do núcleo estão parados"): 66 segundos de
           raciocínio, zero texto. O teto subiu, mas o remédio de verdade foi
           pôr a conta pronta na base — teto grande sozinho só compra tempo.
           Só se paga o que for realmente gerado; este número é teto, não consumo. */
        max_tokens: 16000,
        stream: true,
        system: [{
          type: "text",
          text: INSTRUCOES + "\n" + base + (RECORTE[acesso.visao] || ""),
          /* a base não muda entre perguntas: em cache ela custa 10% */
          cache_control: { type: "ephemeral" },
        }],
        messages: historico,
      }),
    });

    if (!resposta.ok) {
      const t = await resposta.text();
      let msg = "O assistente está indisponível no momento.";
      if (resposta.status === 400 && t.indexOf("credit") >= 0)
        msg = "O crédito da conta acabou. Avise a Inteligência Comercial.";
      if (resposta.status === 401) msg = "Chave de API inválida no servidor.";
      if (resposta.status === 429) msg = "Muitas perguntas ao mesmo tempo. Tente de novo em alguns segundos.";
      if (resposta.status === 529) msg = "O serviço está sobrecarregado. Tente de novo em instantes.";
      console.log("[claude] " + resposta.status + " " + t.slice(0, 500));
      return erro(msg, 502, origem);
    }

    console.log(`[chat] ${login} · visão ${acesso.visao || "completa"}` +
      ` · base com ${base.length} caracteres`);

    return new Response(resposta.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        ...CORS(origem),
      },
    });
  },
};
