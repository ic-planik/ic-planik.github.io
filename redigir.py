#!/usr/bin/env python3
"""Monta os payloads das visões restritas.

A regra é simples de dizer e por isso é simples de garantir: **cada diretor
recebe a operação do canal dele, e mais nada**. Não é a tela que filtra — o
navegador dele nunca chega a ver uma venda dos outros canais.

Só uma coisa atravessa esse corte, por decisão de negócio: a **Síntese**
continua mostrando a carteira inteira (VGV total dos empreendimentos, quanto
já foi vendido na vida e quanto sobra de estoque). São números de patrimônio,
não de desempenho de canal, e sem eles ele perderia a noção do tamanho do que
está vendendo.

Tudo o mais — meta, realizado, atingimento, GAP, ticket, gráficos, gerentes e
canais — passa a ser do canal dele. Onde o relatório pede "o geral", o geral
dele é o canal: a meta geral vira a meta do canal, e o desempenho geral vira
o desempenho do canal.

PERFIS

    parcerias   Diretor de Parcerias — canal Parcerias.
    house       Diretor House — canais Salão e Online juntos.

House tem DOIS canais, e foi isso que obrigou a generalizar este arquivo: a
meta "geral" dele não é a de um canal, é a soma dos dois, mês a mês. Duplicar
o script para o segundo perfil teria funcionado no primeiro dia e divergido no
primeiro ajuste — quem mexe num esquece o outro.

Uso:
    python redigir.py payload.json payload_parcerias.json parcerias
    python redigir.py payload.json payload_house.json house
"""
import json
import sys

# Blocos que só alimentam abas fora do acesso deles, ou que misturam canais de
# um jeito que não dá para separar. O m2 é média por empreendimento com todos
# os canais dentro; a conferencia é o fechamento da empresa; o desconto é
# calculado por produto sobre a carteira toda.
#
# origem/mkt saem também. Para o House isso é uma perda real — origem de
# captação só existe em Salão e Online, ou seja, o dado é inteiramente dele.
# Mas a aba Origem mede share sobre TODAS as unidades vendidas, incluindo
# Parcerias no denominador, e num payload sem Parcerias esse percentual
# mudaria de significado sem avisar. Entre entregar um número que muda de
# régua no escuro e não entregar, fica fora. Dá para reabrir depois, com a
# régua redefinida de propósito.
BLOCOS_FORA = ["desconto", "origem", "mkt", "canalPorProduto", "vso", "m2",
               "conferencia", "gerenteMes"]

PERFIS = {
    "parcerias": {
        "rot": "Diretor de Parcerias",
        "canais": ["Parcerias"],
        # blocos de gerente que sobrevivem, e como reconhecer os papéis dele
        "blocos": ["parcerias"],
        "papel": lambda p: str(p.get("papel", "")).endswith("parcerias"),
        # rótulos que o assistente usa ao falar do recorte. Ficam aqui, e não
        # no worker, para os dois lados dizerem a mesma coisa sempre.
        "rotCanal": "Parcerias",
        "rotCanalDet": "Parcerias",
        "canalTexto": "imobiliárias externas que trazem o cliente",
    },
    "house": {
        "rot": "Diretor House",
        "canais": ["Salão", "Online"],
        "blocos": ["plkGeral", "plkSalao", "plkOnline"],
        "papel": lambda p: str(p.get("papel", "")).endswith(("online", "salao",
                                                             "house", "plk")),
        "rotCanal": "House",
        "rotCanalDet": "House (Salão e Online)",
        "canalTexto": "a equipe própria da Planik, dividida em Salão e Online",
    },
}
TODOS_BLOCOS = ["plkGeral", "plkSalao", "plkOnline", "parcerias", "lancadoras"]


def _soma(rs, campo="valor"):
    return round(sum(r.get(campo) or 0 for r in rs), 2)


def _soma_series(series):
    """Soma listas de 12 posições posição a posição. É o que transforma as
    metas de Salão e Online na meta 'geral' do Diretor House."""
    saida = [0.0] * 12
    for s in series:
        for i, v in enumerate(s or []):
            if i < 12:
                saida[i] += (v or 0)
    return [round(v, 2) for v in saida]


def _junta_canais(metas_canais, canais):
    """Um bloco de meta único a partir de N canais. Com um canal só devolve o
    próprio bloco, para o perfil de Parcerias continuar idêntico ao que era."""
    blocos = [metas_canais.get(c) or {} for c in canais]
    blocos = [b for b in blocos if b]
    if not blocos:
        return {}
    if len(blocos) == 1:
        return blocos[0]
    prods = []
    for b in blocos:
        for p in (b.get("produtos") or []):
            if p not in prods:
                prods.append(p)
    return {
        "produtos": prods,
        "meta": _soma_series([b.get("meta") for b in blocos]),
        "metaAcum": _soma_series([b.get("metaAcum") for b in blocos]),
        "real": _soma_series([b.get("real") for b in blocos]),
    }


def _junta_desemp(desemp, canais):
    """Desempenho por produto somando os canais do perfil."""
    listas = [desemp.get(c) or [] for c in canais]
    listas = [x for x in listas if x]
    if not listas:
        return []
    if len(listas) == 1:
        return listas[0]
    acc = {}
    ordem = []
    for lista in listas:
        for x in lista:
            p = x.get("produto")
            if p not in acc:
                acc[p] = {"produto": p, "meta": [0.0] * 12, "real": [0.0] * 12,
                          "qtd": [0.0] * 12, "metaYTD": 0.0, "realYTD": 0.0,
                          "qtdYTD": 0.0}
                ordem.append(p)
            a = acc[p]
            for campo in ("meta", "real", "qtd"):
                for i, v in enumerate(x.get(campo) or []):
                    if i < 12:
                        a[campo][i] += (v or 0)
            for campo in ("metaYTD", "realYTD", "qtdYTD"):
                a[campo] += (x.get(campo) or 0)
    for p in ordem:
        a = acc[p]
        for campo in ("meta", "real", "qtd"):
            a[campo] = [round(v, 2) for v in a[campo]]
        for campo in ("metaYTD", "realYTD", "qtdYTD"):
            a[campo] = round(a[campo], 2)
    return [acc[p] for p in ordem]


def redigir(P, perfil="parcerias"):
    cfg = PERFIS[perfil]
    canais = cfg["canais"]

    tx = [t for t in P.get("transacoes") or [] if t.get("canal") in canais]
    Q = {k: v for k, v in P.items() if k not in BLOCOS_FORA}
    Q["transacoes"] = tx

    # o cabeçalho passa a declarar só os canais dele, e é dele que o site monta
    # o seletor de canais — sem isso apareceriam botões de canais vazios
    meta = dict(P.get("meta") or {})
    meta["canais"] = list(canais)
    Q["meta"] = meta

    # metas: a "geral" do acesso dele é a soma dos canais dele. Com um canal
    # só, as duas apontam para o mesmo bloco, porque é o mesmo universo.
    metas = P.get("metas") or {}
    mc = metas.get("canais") or {}
    juntas = _junta_canais(mc, canais)
    Q["metas"] = {"geral": juntas,
                  "canais": {c: (mc.get(c) or {}) for c in canais},
                  "kpi": metas.get("kpi"), "campanhas": []}

    # desempenho mês a mês por produto: idem
    des = P.get("desemp") or {}
    Q["desemp"] = {"Geral": _junta_desemp(des, canais)}
    for c in canais:
        Q["desemp"][c] = des.get(c) or []

    # gerentes: só os dos blocos do perfil, e os parâmetros/papéis deles
    G = P.get("gerentes") or {}
    time = []
    novos = {}
    for b in TODOS_BLOCOS:
        if b in cfg["blocos"]:
            novos[b] = list(G.get(b) or [])
            time += novos[b]
        else:
            novos[b] = []
    nomes = {x["nome"] for x in time if x.get("nome")}
    novos["parametros"] = {k: v for k, v in (G.get("parametros") or {}).items()
                           if k in nomes}
    novos["ativos"] = [n for n in (G.get("ativos") or []) if n in nomes]
    novos["papeis"] = [p for p in (G.get("papeis") or []) if cfg["papel"](p)]
    novos["totalAno"] = [t for t in (G.get("totalAno") or [])
                         if t.get("canal") in canais]
    Q["gerentes"] = novos

    # KPI do topo: recalculado para o perfil, senão ele veria a meta da empresa
    mesRef = (meta.get("mesRef") or 12)
    mAno = sum(juntas.get("meta") or [])
    mYTD = sum((juntas.get("meta") or [])[:mesRef])
    real = _soma(tx)
    Q["realYTD"] = real
    Q["qtdYTD"] = round(sum(t.get("peso") or 0 for t in tx), 2)
    kpi = dict(P.get("kpi") or {})
    kpi.update({
        "metaYTD": round(mYTD, 2), "gapYTD": round(mYTD - real, 2),
        "atingYTD": round(real / mYTD, 4) if mYTD else None,
        "metaAno": round(mAno, 2), "gapAno": round(mAno - real, 2),
        "atingAno": round(real / mAno, 4) if mAno else None,
    })
    Q["kpi"] = kpi

    linhas = len(tx)
    comCorretor = sum(1 for t in tx if t.get("corretor"))
    Q["coberturaCorretor"] = round(comCorretor / linhas, 4) if linhas else 0

    # "canal" é o rótulo curto do recorte, NÃO o primeiro canal da lista: para
    # o House o recorte se chama House, não "Salão". Escrever canais[0] aqui
    # faria o assistente dizer "esta base é a operação de Salão" e omitir
    # metade do que ele tem na mão.
    Q["_visao"] = {"tipo": perfil, "rot": cfg["rot"], "canais": list(canais),
                   "canal": cfg["rotCanal"], "canalDetalhado": cfg["rotCanalDet"],
                   "canalTexto": cfg["canalTexto"],
                   "vendas": linhas, "vgv": real,
                   "blocosRemovidos": BLOCOS_FORA}
    return Q


def confere(P, Q, perfil="parcerias"):
    """Duas perguntas: sobrou alguma venda de outro canal, e o que ficou bate
    com o mesmo recorte no relatório completo?"""
    cfg = PERFIS[perfil]
    canais = set(cfg["canais"])
    erros = []

    fora = [t for t in Q["transacoes"] if t.get("canal") not in canais]
    if fora:
        erros.append("sobraram %d venda(s) de outro canal no extrato" % len(fora))

    orig = [t for t in P["transacoes"] if t.get("canal") in canais]
    for campo in ("valor", "peso"):
        a, b = _soma(orig, campo), _soma(Q["transacoes"], campo)
        if abs(a - b) > 0.01:
            erros.append("%s de %s: completo %s x restrito %s"
                         % (campo, "+".join(sorted(canais)), a, b))

    # nenhum bloco de gerente de fora pode ter sobrado
    for bloco in TODOS_BLOCOS:
        if bloco not in cfg["blocos"] and Q.get("gerentes", {}).get(bloco):
            erros.append("bloco de gerentes '%s' deveria estar vazio" % bloco)
    if set((Q.get("metas") or {}).get("canais", {})) - canais:
        erros.append("metas de outros canais continuam no arquivo")
    if set((Q.get("desemp") or {})) - ({"Geral"} | canais):
        erros.append("desempenho de outros canais continua no arquivo")
    for b in BLOCOS_FORA:
        if b in Q:
            erros.append("bloco '%s' deveria ter saído" % b)

    # a meta "geral" tem de ser a soma dos canais do perfil, não a da empresa
    mc = (P.get("metas") or {}).get("canais") or {}
    esperada = sum(sum(( (mc.get(c) or {}).get("meta") or [] )) for c in canais)
    obtida = sum((Q.get("metas") or {}).get("geral", {}).get("meta") or [])
    if abs(esperada - obtida) > 1:
        erros.append("a meta geral do perfil (%s) não é a soma dos canais (%s)"
                     % (round(obtida), round(esperada)))

    # a Síntese é a exceção combinada: tem de continuar inteira
    if len(Q.get("sintese") or []) != len(P.get("sintese") or []):
        erros.append("a Síntese perdeu empreendimentos — ela deve ficar completa")

    # o texto todo não pode conter nome de gerente de fora
    forasteiros = {t.get("gerente") for t in P["transacoes"]
                   if t.get("canal") not in canais and t.get("gerente")}
    forasteiros -= {t.get("gerente") for t in orig if t.get("gerente")}
    bruto = json.dumps(Q, ensure_ascii=False)
    for nome in forasteiros:
        if ('"%s"' % nome) in bruto:
            erros.append("nome de gerente de outro canal ainda aparece: %s" % nome)

    # e nenhum nome de canal de fora pode aparecer em canto nenhum
    for c in set((P.get("meta") or {}).get("canais") or []) - canais:
        if ('"%s"' % c) in bruto:
            erros.append("nome do canal '%s' ainda aparece no arquivo" % c)
    return erros


def main():
    entrada = sys.argv[1] if len(sys.argv) > 1 else "payload.json"
    saida = sys.argv[2] if len(sys.argv) > 2 else "payload_parcerias.json"
    perfil = sys.argv[3] if len(sys.argv) > 3 else "parcerias"
    if perfil not in PERFIS:
        print("perfil desconhecido: %s (use %s)"
              % (perfil, ", ".join(PERFIS)), file=sys.stderr)
        sys.exit(2)
    with open(entrada, encoding="utf-8") as f:
        P = json.load(f)
    Q = redigir(P, perfil)
    erros = confere(P, Q, perfil)
    if erros:
        print("ABORTADO — a visão restrita não passou na conferência:", file=sys.stderr)
        for e in erros[:20]:
            print("  - " + e, file=sys.stderr)
        sys.exit(2)
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(Q, f, ensure_ascii=False, separators=(",", ":"))
    v = Q["_visao"]
    print("%s — %s: %d vendas de %s, R$ %s · nenhum dado de outro canal" %
          (saida, v["rot"], v["vendas"], "+".join(v["canais"]),
           format(v["vgv"], ",.2f").replace(",", ".")))


if __name__ == "__main__":
    main()
