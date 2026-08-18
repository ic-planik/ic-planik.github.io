#!/usr/bin/env python3
"""Monta o payload da visão do Diretor de Parcerias.

A regra é simples de dizer e por isso é simples de garantir: **ele recebe a
operação de Parcerias, e mais nada**. Não é a tela que filtra — o navegador
dele nunca chega a ver uma venda de Salão, Online, Lançadora ou Interna.

Só uma coisa atravessa esse corte, por decisão de negócio: a **Síntese**
continua mostrando a carteira inteira (VGV total dos empreendimentos, quanto
já foi vendido na vida e quanto sobra de estoque). São números de patrimônio,
não de desempenho de canal, e sem eles ele perderia a noção do tamanho do que
está vendendo.

Tudo o mais — meta, realizado, atingimento, GAP, ticket, gráficos, gerentes e
canais — passa a ser de Parcerias. Onde o relatório pede "o geral", o geral
dele é Parcerias: a meta geral vira a meta do canal, e o desempenho geral vira
o desempenho do canal.

Uso:
    python redigir.py payload.json payload_parcerias.json
"""
import json
import sys

CANAL = "Parcerias"

# Blocos que só alimentam abas fora do acesso dele, ou que misturam canais de
# um jeito que não dá para separar. O m2 é média por empreendimento com todos
# os canais dentro; a conferencia é o fechamento da empresa.
BLOCOS_FORA = ["desconto", "origem", "mkt", "canalPorProduto", "vso", "m2",
               "conferencia", "gerenteMes"]


def _soma(rs, campo="valor"):
    return round(sum(r.get(campo) or 0 for r in rs), 2)


def redigir(P):
    tx = [t for t in P.get("transacoes") or [] if t.get("canal") == CANAL]
    Q = {k: v for k, v in P.items() if k not in BLOCOS_FORA}
    Q["transacoes"] = tx

    # o cabeçalho passa a declarar um canal só, e é dele que o site monta o
    # seletor de canais — sem isso apareceriam quatro botões, três vazios
    meta = dict(P.get("meta") or {})
    meta["canais"] = [CANAL]
    Q["meta"] = meta

    # metas: a "geral" do acesso dele é a do canal. As duas apontam para o
    # mesmo bloco de propósito, porque é o mesmo universo.
    metas = P.get("metas") or {}
    parc = (metas.get("canais") or {}).get(CANAL) or {}
    Q["metas"] = {"geral": parc, "canais": {CANAL: parc},
                  "kpi": metas.get("kpi"), "campanhas": []}

    # desempenho mês a mês: idem
    des = P.get("desemp") or {}
    dp = des.get(CANAL) or []
    Q["desemp"] = {"Geral": dp, CANAL: dp}

    # gerentes: só os do canal, e os parâmetros/papéis correspondentes
    G = P.get("gerentes") or {}
    time_parc = [x for x in (G.get("parcerias") or [])]
    nomes = {x["nome"] for x in time_parc}
    Q["gerentes"] = {
        "parcerias": time_parc,
        "plkGeral": [], "plkSalao": [], "plkOnline": [], "lancadoras": [],
        "parametros": {k: v for k, v in (G.get("parametros") or {}).items()
                       if k in nomes},
        "ativos": [n for n in (G.get("ativos") or []) if n in nomes],
        "papeis": [p for p in (G.get("papeis") or [])
                   if str(p.get("papel", "")).endswith("parcerias")],
        "totalAno": [t for t in (G.get("totalAno") or [])
                     if t.get("canal") == CANAL],
    }

    # KPI do topo: recalculado para o canal, senão ele veria a meta da empresa
    mesRef = (meta.get("mesRef") or 12)
    mAno = sum(parc.get("meta") or [])
    mYTD = sum((parc.get("meta") or [])[:mesRef])
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

    Q["_visao"] = {"tipo": "parcerias", "canal": CANAL,
                   "vendas": linhas, "vgv": real,
                   "blocosRemovidos": BLOCOS_FORA}
    return Q


def confere(P, Q):
    """Duas perguntas: sobrou alguma venda de outro canal, e o que ficou bate
    com o mesmo recorte no relatório completo?"""
    erros = []
    fora = [t for t in Q["transacoes"] if t.get("canal") != CANAL]
    if fora:
        erros.append("sobraram %d venda(s) de outro canal no extrato" % len(fora))

    orig = [t for t in P["transacoes"] if t.get("canal") == CANAL]
    for campo in ("valor", "peso"):
        a, b = _soma(orig, campo), _soma(Q["transacoes"], campo)
        if abs(a - b) > 0.01:
            erros.append("%s de %s: completo %s x restrito %s" % (campo, CANAL, a, b))

    # nenhum bloco pode ter ficado com dado de outro canal
    for bloco in ("plkGeral", "plkSalao", "plkOnline", "lancadoras"):
        if Q.get("gerentes", {}).get(bloco):
            erros.append("bloco de gerentes '%s' deveria estar vazio" % bloco)
    if set((Q.get("metas") or {}).get("canais", {})) - {CANAL}:
        erros.append("metas de outros canais continuam no arquivo")
    if set((Q.get("desemp") or {})) - {"Geral", CANAL}:
        erros.append("desempenho de outros canais continua no arquivo")
    for b in BLOCOS_FORA:
        if b in Q:
            erros.append("bloco '%s' deveria ter saído" % b)

    # a Síntese é a exceção combinada: tem de continuar inteira
    if len(Q.get("sintese") or []) != len(P.get("sintese") or []):
        erros.append("a Síntese perdeu empreendimentos — ela deve ficar completa")

    # o texto todo não pode conter nome de gerente de fora
    forasteiros = {t.get("gerente") for t in P["transacoes"]
                   if t.get("canal") != CANAL and t.get("gerente")}
    forasteiros -= {t.get("gerente") for t in orig if t.get("gerente")}
    bruto = json.dumps(Q, ensure_ascii=False)
    for nome in forasteiros:
        if ('"%s"' % nome) in bruto:
            erros.append("nome de gerente de outro canal ainda aparece: %s" % nome)
    return erros


def main():
    entrada = sys.argv[1] if len(sys.argv) > 1 else "payload.json"
    saida = sys.argv[2] if len(sys.argv) > 2 else "payload_parcerias.json"
    with open(entrada, encoding="utf-8") as f:
        P = json.load(f)
    Q = redigir(P)
    erros = confere(P, Q)
    if erros:
        print("ABORTADO — a visão restrita não passou na conferência:", file=sys.stderr)
        for e in erros[:20]:
            print("  - " + e, file=sys.stderr)
        sys.exit(2)
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(Q, f, ensure_ascii=False, separators=(",", ":"))
    v = Q["_visao"]
    print("%s — %d vendas de %s, R$ %s · nenhum dado de outro canal" %
          (saida, v["vendas"], CANAL, format(v["vgv"], ",.2f").replace(",", ".")))


if __name__ == "__main__":
    main()
