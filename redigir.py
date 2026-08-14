#!/usr/bin/env python3
"""Gera o payload da visão restrita — o que o Diretor de Parcerias pode receber.

A diferença para o filtro de tela é onde a informação some. Esconder na tela
não esconde nada: o navegador já baixou a planilha inteira e qualquer pessoa
lê tudo com F12. Aqui o dado proibido nem chega a sair do servidor.

O que sai:
  - o extrato de vendas dos OUTROS canais, linha a linha. No lugar dele entra
    uma linha por (empreendimento, canal, mês) com o VGV e a quantidade
    somados, sem unidade, sem desconto, sem metragem, sem corretor e sem
    gerente. Os totais continuam idênticos aos do relatório completo — a
    Síntese, a Visão Geral, Canais e Gerentes fecham no centavo — mas não há
    como saber por quanto uma unidade específica foi vendida.
  - os blocos das abas que ele não acessa: Desconto por Empreendimento,
    Origem por Empreendimento e VSO, mais o valor do m² por empreendimento.

O que fica:
  - o extrato de Parcerias inteiro, com valor, desconto e metragem. É a
    operação dele.
  - todos os blocos agregados: metas, realizado mês a mês, carteira, gerentes.
  - um resumo mensal por gerente dos outros canais, sem empreendimento, para
    a aba Gerentes continuar mostrando o resultado de todo mundo.

O limite honesto: onde uma célula da tela tem UMA venda só, o valor dela é
dedutível — mas isso já vale para o relatório que ele enxerga, não é o
arquivo que entrega. A checagem no fim deste script prova isso a cada
publicação: nenhuma linha somada fica isolada sem que a tela já a isole.

Uso:
    python redigir.py payload.json payload_parcerias.json
"""
import json
import sys

CANAL_PROPRIO = "Parcerias"
HOUSE = ["Salão", "Online"]

# Campos que descrevem UMA venda específica. Some tudo, não só o valor: a
# unidade e a metragem identificam o apartamento, e com o m² dá para voltar
# ao preço. Esconder o valor e deixar a metragem seria teatro.
CAMPOS_DA_VENDA = [
    "unidade", "desconto", "metragem", "valorM2",
    "corretor", "parceiro", "origem", "plataforma", "campanha", "fifith",
]

# Blocos inteiros que só alimentam abas fora do acesso dele.
# O m2 é média por empreendimento com TODOS os canais dentro. Não é valor de
# unidade, mas é preço médio de metro quadrado de venda que não é dele — e o
# relatório dele nem usa esse bloco: a coluna de m² é recalculada das vendas
# detalhadas, que no acesso restrito são só as de Parcerias. Sai.
BLOCOS_FORA = ["desconto", "origem", "mkt", "canalPorProduto", "vso", "m2"]


def agrupa(transacoes):
    """Colapsa as vendas dos outros canais em linhas de mês.

    A chave é (empreendimento, canal, mês, ato) — e a escolha do que NÃO entra
    nela é o ponto mais importante deste arquivo.

    O ato NÃO entra na chave, mas a linha guarda quanto dela está pago
    (valorPago/pesoPago). Separar pago de pendente em duas linhas parecia mais
    simples, até a checagem apontar o caso real: em Linn Vila Mariana / Online
    / agosto havia três vendas, duas pagas e uma pendente — e a linha pendente
    sairia sozinha, entregando o valor daquela venda, que a tela mostra apenas
    somada às outras duas. Guardando a parte paga dentro da mesma linha, o
    recorte "Ato pago" continua exato e nenhuma venda fica isolada.

    O GERENTE não entra, de propósito. Com ele na chave, 66 das 189 vendas dos
    outros canais ficariam sozinhas na sua linha — e uma linha sozinha É a
    venda, com o valor à mostra. Vinte e três dessas não apareceriam em tela
    nenhuma do relatório, ou seja, o arquivo entregaria mais do que a tela.
    Sem o gerente, toda linha agregada corresponde a uma célula que a própria
    aba Vendas por Empreendimento já mostra: o arquivo não revela nada além do
    que ele enxerga de qualquer jeito.

    O preço disso é que os gerentes de House perdem o vínculo com a venda. A
    aba Gerentes passa a montá-los a partir do bloco de metas e realizado, que
    é mensal — e é por isso que o relatório avisa, naquele acesso, que o mês a
    mês dos outros canais vem por mês fechado.
    """
    proprias, resto = [], {}
    for t in transacoes:
        if t.get("canal") == CANAL_PROPRIO:
            proprias.append(t)
            continue
        k = (t.get("produto"), t.get("canal"), t.get("mes"))
        g = resto.get(k)
        if g is None:
            g = {c: None for c in CAMPOS_DA_VENDA}
            g.update({
                "produto": t.get("produto"), "canal": t.get("canal"),
                "gerente": None, "mes": t.get("mes"),
                "ato": None, "status": "",
                "valor": 0.0, "peso": 0.0, "data": None,
                "valorPago": 0.0, "pesoPago": 0.0,
                "agregado": True, "linhas": 0, "linhasPagas": 0,
            })
            resto[k] = g
        v, p = t.get("valor") or 0, t.get("peso") or 0
        g["valor"] += v
        g["peso"] += p
        g["linhas"] += 1
        if str(t.get("ato") or "").strip().upper() == "PAGO":
            g["valorPago"] += v
            g["pesoPago"] += p
            g["linhasPagas"] += 1
        d = t.get("data")
        if d and (g["data"] is None or d > g["data"]):
            g["data"] = d
    return proprias, list(resto.values())


def gerentes_por_mes(transacoes):
    """VGV e quantidade de cada gerente dos outros canais, mês a mês.

    Sem isto a aba Gerentes ficaria errada. O bloco de metas da planilha só
    tem série individual de House a partir de junho — usá-lo mostraria o
    Dorival com R$ 6,5 milhões no ano quando ele vendeu R$ 30,1 milhões. Um
    relatório que some com dois terços do resultado de um gerente é pior que
    um relatório sem a aba.

    Gerente × mês é a mesma granularidade do gráfico "mês a mês" que a aba já
    desenha para todo mundo, então o arquivo continua não entregando nada que
    a tela dele não mostre. O que segue de fora é o cruzamento com o
    empreendimento — por isso a matriz some fora de Parcerias.
    """
    por = {}
    for t in transacoes:
        if t.get("canal") == CANAL_PROPRIO:
            continue
        g = t.get("gerente")
        if not g:
            continue
        x = por.get(g)
        if x is None:
            x = por[g] = {"nome": g, "canais": set(),
                          "mes": [0.0] * 12, "qtd": [0.0] * 12}
        x["canais"].add(t.get("canal"))
        m = t.get("mes")
        if m is None:
            continue
        x["mes"][m] += t.get("valor") or 0
        x["qtd"][m] += t.get("peso") or 0
    # O bloco (House / Lançadora / Interna) substitui o canal linha a linha.
    # Nenhum gerente atravessa blocos — quem vende no Salão vende no Online e
    # em mais nada — então guardar o bloco não abre granularidade nova, e é o
    # que a aba precisa para saber quem entra em cada recorte.
    saida = []
    for x in por.values():
        c = x.pop("canais")
        x["bloco"] = "House" if c <= set(HOUSE) else sorted(c)[0]
        saida.append(x)
    return sorted(saida, key=lambda x: -sum(x["mes"]))


def redigir(P):
    Q = dict(P)
    proprias, agregadas = agrupa(P.get("transacoes") or [])
    Q["gerenteMes"] = gerentes_por_mes(P.get("transacoes") or [])
    # ordena por data para o extrato não sair embaralhado
    Q["transacoes"] = sorted(proprias + agregadas,
                             key=lambda t: (t.get("data") or "", t.get("produto") or ""))
    for b in BLOCOS_FORA:
        Q.pop(b, None)
    Q["_visao"] = {
        "tipo": "parcerias",
        "canalDetalhado": CANAL_PROPRIO,
        "linhasDetalhadas": len(proprias),
        "linhasAgregadas": len(agregadas),
        "vendasResumidas": sum(g["linhas"] for g in agregadas),
        "blocosRemovidos": BLOCOS_FORA,
    }
    return Q


def confere(P, Q):
    """Os totais têm de bater. Se não baterem, o Smith veria um relatório
    diferente do da diretoria — pior do que não ter relatório nenhum."""
    erros = []

    def soma(rs, campo):
        return round(sum(r.get(campo) or 0 for r in rs), 2)

    for campo in ("valor", "peso"):
        a, b = soma(P["transacoes"], campo), soma(Q["transacoes"], campo)
        if abs(a - b) > 0.01:
            erros.append(f"{campo}: completo {a} x restrito {b}")

    # e também dentro de cada canal, cada empreendimento e cada mês
    def porChave(rs, f):
        o = {}
        for r in rs:
            k = f(r)
            o[k] = o.get(k, 0) + (r.get("valor") or 0)
        return o

    for nome, f in (("canal", lambda r: r.get("canal")),
                    ("empreendimento", lambda r: r.get("produto")),
                    ("mês", lambda r: r.get("mes")),
                    ("empreendimento+canal+mês",
                     lambda r: (r.get("produto"), r.get("canal"), r.get("mes")))):
        a, b = porChave(P["transacoes"], f), porChave(Q["transacoes"], f)
        for k in set(a) | set(b):
            if abs(a.get(k, 0) - b.get(k, 0)) > 0.01:
                erros.append(f"{nome} {k}: {a.get(k,0):.2f} x {b.get(k,0):.2f}")

    # o recorte "Ato pago" tem de dar o mesmo número nos dois arquivos
    def pago(rs, campo):
        s = 0.0
        for r in rs:
            if r.get("agregado"):
                s += r.get("valorPago" if campo == "valor" else "pesoPago") or 0
            elif str(r.get("ato") or "").strip().upper() == "PAGO":
                s += r.get(campo) or 0
        return round(s, 2)
    for campo in ("valor", "peso"):
        a, b = pago(P["transacoes"], campo), pago(Q["transacoes"], campo)
        if abs(a - b) > 0.01:
            erros.append(f"ato pago · {campo}: completo {a} x restrito {b}")

    # dentro de Parcerias o extrato é integral, então o gerente tem de fechar
    def porGer(rs):
        o = {}
        for r in rs:
            if r.get("canal") != CANAL_PROPRIO:
                continue
            k = r.get("gerente")
            o[k] = o.get(k, 0) + (r.get("valor") or 0)
        return o
    a, b = porGer(P["transacoes"]), porGer(Q["transacoes"])
    for k in set(a) | set(b):
        if abs(a.get(k, 0) - b.get(k, 0)) > 0.01:
            erros.append(f"gerente de {CANAL_PROPRIO} {k}: {a.get(k,0):.2f} x {b.get(k,0):.2f}")

    # nenhuma venda de outro canal pode ter sobrado identificável
    for t in Q["transacoes"]:
        if t.get("canal") == CANAL_PROPRIO:
            continue
        for c in ("unidade", "desconto", "metragem", "valorM2", "corretor",
                  "gerente", "origem", "plataforma", "campanha"):
            if t.get(c) is not None:
                erros.append(f"vazou {c} numa venda de {t.get('canal')}")
                break

    # A prova que interessa: uma linha agregada com UMA venda dentro entrega o
    # valor daquela venda. Isso só é tolerável se a mesma venda já estivesse
    # sozinha numa célula que a tela mostra (empreendimento × canal × mês).
    # Se aparecer uma que não está, o arquivo passou a entregar mais que a tela.
    naTela = {}
    for t in P["transacoes"]:
        if t.get("canal") == CANAL_PROPRIO:
            continue
        k = (t.get("produto"), t.get("canal"), t.get("mes"))
        naTela[k] = naTela.get(k, 0) + 1
    for g in Q["transacoes"]:
        if not g.get("agregado") or g["linhas"] != 1:
            continue
        k = (g.get("produto"), g.get("canal"), g.get("mes"))
        if naTela.get(k, 0) != 1:
            erros.append(f"linha agregada isolada que a tela não isola: {k}")

    # o resumo por gerente tem de reproduzir o extrato completo
    real = {}
    for t in P["transacoes"]:
        if t.get("canal") == CANAL_PROPRIO or not t.get("gerente"):
            continue
        real[t["gerente"]] = real.get(t["gerente"], 0) + (t.get("valor") or 0)
    for x in Q.get("gerenteMes") or []:
        a, b = real.get(x["nome"], 0), sum(x["mes"])
        if abs(a - b) > 0.01:
            erros.append(f"gerente {x['nome']}: extrato {a:.2f} x resumo {b:.2f}")
    for nome in real:
        if not any(x["nome"] == nome for x in Q.get("gerenteMes") or []):
            erros.append(f"gerente {nome} sumiu do resumo")
    return erros


def main():
    entrada = sys.argv[1] if len(sys.argv) > 1 else "payload.json"
    saida = sys.argv[2] if len(sys.argv) > 2 else "payload_parcerias.json"
    with open(entrada, encoding="utf-8") as f:
        P = json.load(f)
    Q = redigir(P)
    erros = confere(P, Q)
    if erros:
        print("ABORTADO — a visão restrita não bate com o relatório completo:",
              file=sys.stderr)
        for e in erros[:20]:
            print("  - " + e, file=sys.stderr)
        sys.exit(2)
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(Q, f, ensure_ascii=False, separators=(",", ":"))
    v = Q["_visao"]
    print(f"{saida} — {v['linhasDetalhadas']} linhas de {CANAL_PROPRIO} inteiras · "
          f"{v['vendasResumidas']} vendas de outros canais viraram "
          f"{v['linhasAgregadas']} linhas de mês · blocos removidos: "
          f"{', '.join(v['blocosRemovidos'])}")


if __name__ == "__main__":
    main()
