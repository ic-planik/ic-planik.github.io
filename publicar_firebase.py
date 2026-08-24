#!/usr/bin/env python3
"""
Publica o payload no Firestore.

Roda depois do planik_extract.py, nunca junto: se a extração falhar por mudança
de estrutura na planilha ela sai com código 2 e este script não chega a rodar —
o site continua mostrando o último dado bom em vez de um dado quebrado.

Publica UM documento por visão:

    dados/atual       a planilha inteira, para a diretoria e a Inteligência
                      Comercial.
    dados/parcerias   a operação de Parcerias e nada mais.
    dados/house       a operação de Salão + Online e nada mais.

Nos dois recortados a carteira (VGV total, vendido na vida, estoque) continua
inteira, porque é patrimônio; o desempenho é só do canal.

O segundo existe porque esconder na tela não esconde nada: o navegador baixa o
documento inteiro e um F12 lê tudo. A separação só vale se o dado proibido nem
sair do servidor — e a regra do Firestore é que decide quem lê qual.

Se o redigir.py recusar QUALQUER recorte (os totais não baterem), NENHUM
documento é publicado — nem os que passaram. Publicar só uma parte deixaria
uma visão apontando para dado velho ao lado de outra atualizada, e ninguém
perceberia.

Uso:
    python planik_extract.py planilha.xlsx payload.json
    python publicar_firebase.py payload.json

Espera a variável de ambiente FIREBASE_KEY com o JSON da service account.
Sem ela, imprime o que faria e sai com 0 (modo teste local).
"""
import json
import os
import sys
import time

import redigir

CAMINHO = sys.argv[1] if len(sys.argv) > 1 else "payload.json"

with open(CAMINHO, encoding="utf-8") as f:
    dados = json.load(f)

# Guarda-chuva: payload sem transação é quase certamente extração vazia.
# Melhor não publicar do que zerar o relatório da diretoria.
if not dados.get("transacoes"):
    print("ABORTADO: payload sem transações — nada foi publicado.", file=sys.stderr)
    sys.exit(2)

# TODAS as visões restritas são montadas e CONFERIDAS antes de qualquer
# escrita. Nada vai para o banco enquanto uma delas estiver errada.
recortes = {}
for perfil in redigir.PERFIS:
    q = redigir.redigir(dados, perfil)
    erros = redigir.confere(dados, q, perfil)
    if erros:
        print("ABORTADO: a visão '%s' não bate com o relatório completo. "
              "Nada foi publicado." % perfil, file=sys.stderr)
        for e in erros[:20]:
            print("  - " + e, file=sys.stderr)
        sys.exit(2)
    recortes[perfil] = q

chave = os.environ.get("FIREBASE_KEY")
payload = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
textos = {p: json.dumps(q, ensure_ascii=False, separators=(",", ":"))
          for p, q in recortes.items()}
atualizado = (dados.get("meta") or {}).get("atualizado")

if not chave:
    print(f"FIREBASE_KEY ausente — modo teste. {len(payload):,} chars, "
          f"{len(dados['transacoes'])} transações, atualizado em {atualizado}.")
    for p, q in recortes.items():
        v = q["_visao"]
        print(f"  dados/{p}: {len(textos[p]):,} chars · {v['vendas']} vendas de "
              f"{'+'.join(v['canais'])} · nenhum dado de outro canal")
    sys.exit(0)

import firebase_admin
from firebase_admin import credentials, firestore

firebase_admin.initialize_app(credentials.Certificate(json.loads(chave)))
db = firestore.client()
ts = int(time.time() * 1000)
db.collection("dados").document("atual").set({
    "payloadStr": payload,
    "atualizado": atualizado,
    "ts": ts,
})
for p, texto in textos.items():
    db.collection("dados").document(p).set({
        "payloadStr": texto,
        "atualizado": atualizado,
        "ts": ts,
    })
print(f"Firestore atualizado: {len(payload):,} chars | planilha de {atualizado} | "
      f"{len(dados['transacoes'])} transações")
for p, q in recortes.items():
    v = q["_visao"]
    print(f"  dados/{p}: {len(textos[p]):,} chars | {v['vendas']} vendas de "
          f"{'+'.join(v['canais'])}, sem nenhum dado dos demais canais")
