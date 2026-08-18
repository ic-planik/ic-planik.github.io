#!/usr/bin/env python3
"""
Publica o payload no Firestore.

Roda depois do planik_extract.py, nunca junto: se a extração falhar por mudança
de estrutura na planilha ela sai com código 2 e este script não chega a rodar —
o site continua mostrando o último dado bom em vez de um dado quebrado.

Publica DOIS documentos:

    dados/atual       a planilha inteira, para a diretoria e a Inteligência
                      Comercial.
    dados/parcerias   a operação de Parcerias e nada mais, para quem tem
                      visão restrita. A carteira (VGV total, vendido na vida,
                      estoque) continua inteira, porque é patrimônio; o
                      desempenho é só do canal.

O segundo existe porque esconder na tela não esconde nada: o navegador baixa o
documento inteiro e um F12 lê tudo. A separação só vale se o dado proibido nem
sair do servidor — e a regra do Firestore é que decide quem lê qual.

Se o redigir.py recusar (os totais não baterem), NENHUM dos dois é publicado.
Publicar só o completo deixaria a visão restrita apontando para um dado velho,
e ninguém perceberia.

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

# A visão restrita é montada e CONFERIDA antes de qualquer escrita.
restrito = redigir.redigir(dados)
erros = redigir.confere(dados, restrito)
if erros:
    print("ABORTADO: a visão restrita não bate com o relatório completo. "
          "Nada foi publicado.", file=sys.stderr)
    for e in erros[:20]:
        print("  - " + e, file=sys.stderr)
    sys.exit(2)

chave = os.environ.get("FIREBASE_KEY")
payload = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
payload_parc = json.dumps(restrito, ensure_ascii=False, separators=(",", ":"))
atualizado = (dados.get("meta") or {}).get("atualizado")
v = restrito["_visao"]

if not chave:
    print(f"FIREBASE_KEY ausente — modo teste. {len(payload):,} chars, "
          f"{len(dados['transacoes'])} transações, atualizado em {atualizado}.")
    print(f"  visão restrita: {len(payload_parc):,} chars · "
          f"{v['vendas']} vendas de {v['canal']} · nenhum dado de outro canal")
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
db.collection("dados").document("parcerias").set({
    "payloadStr": payload_parc,
    "atualizado": atualizado,
    "ts": ts,
})
print(f"Firestore atualizado: {len(payload):,} chars | planilha de {atualizado} | "
      f"{len(dados['transacoes'])} transações")
print(f"  dados/parcerias: {len(payload_parc):,} chars | "
      f"{v['vendas']} vendas de {v['canal']}, sem nenhum dado dos demais canais")
