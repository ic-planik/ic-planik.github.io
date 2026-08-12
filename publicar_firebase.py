#!/usr/bin/env python3
"""
Publica o payload no Firestore.

Roda depois do planik_extract.py, nunca junto: se a extração falhar por mudança
de estrutura na planilha ela sai com código 2 e este script não chega a rodar —
o site continua mostrando o último dado bom em vez de um dado quebrado.

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

CAMINHO = sys.argv[1] if len(sys.argv) > 1 else "payload.json"

with open(CAMINHO, encoding="utf-8") as f:
    dados = json.load(f)

# Guarda-chuva: payload sem transação é quase certamente extração vazia.
# Melhor não publicar do que zerar o relatório da diretoria.
if not dados.get("transacoes"):
    print("ABORTADO: payload sem transações — nada foi publicado.", file=sys.stderr)
    sys.exit(2)

chave = os.environ.get("FIREBASE_KEY")
payload = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
atualizado = (dados.get("meta") or {}).get("atualizado")

if not chave:
    print(f"FIREBASE_KEY ausente — modo teste. {len(payload):,} chars, "
          f"{len(dados['transacoes'])} transações, atualizado em {atualizado}.")
    sys.exit(0)

import firebase_admin
from firebase_admin import credentials, firestore

firebase_admin.initialize_app(credentials.Certificate(json.loads(chave)))
db = firestore.client()
db.collection("dados").document("atual").set({
    "payloadStr": payload,
    "atualizado": atualizado,
    "ts": int(time.time() * 1000),
})
print(f"Firestore atualizado: {len(payload):,} chars | planilha de {atualizado} | "
      f"{len(dados['transacoes'])} transações")
