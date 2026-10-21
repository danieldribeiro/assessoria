#!/bin/bash
# Valida a 0009 e a 0010 (com a 0007 e a 0008) num Postgres local descartável: esquema 0001–0006, dados fictícios,
# conferência do núcleo do diagnóstico antes e depois, aplicação das migrations e testes. Roda também os testes da
# 0008 (que incluem os da 0007) para garantir que nada do que já existia mudou.
# Uso: PGHOST=/caminho/do/socket PGPORT=5432 PGUSER=postgres supabase/testes/0010/rodar.sh
set -e
S=$(cd "$(dirname "$0")" && pwd); R=$S/../../migrations; T6=$S/../0006; W=$(mktemp -d)
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -c "drop database if exists teste_0010" -c "create database teste_0010"
D="$P -d teste_0010"
for f in $T6/00_stubs.sql $R/000{1,2,3,4,5,6}_*.sql $T6/seed.sql $S/../0007/seed-local.sql; do
  $D -f $f >/dev/null 2>&1 || { echo "falhou: $f"; exit 1; }
done
echo "1. Esquema 0001–0006 e dados fictícios carregados"
$D -At -f $T6/conferencia.sql > $W/conf-antes.txt
for m in 0007_financeiro_fluxo_caixa 0008_financeiro_editar_lancamento 0009_financeiro_fornecedores 0010_financeiro_extratos_ofx; do
  $D --single-transaction -f $R/$m.sql
done
$D -At -f $T6/conferencia.sql > $W/conf-depois.txt
diff -q $W/conf-antes.txt $W/conf-depois.txt >/dev/null && echo "2. Aplicadas 0007 a 0010; núcleo do diagnóstico igual: $(tr '\n' ' ' < $W/conf-depois.txt)"
$D -f $S/../0007/01_permissoes_supabase.sql
resumo() { python3 -c "import json,sys; d=json.load(open('$1')); print('$2', d['passaram'], 'de', d['total']); [print('   falhou:', f['caso'], '| esperado', f['esperado'], '| obtido', f['obtido']) for f in d['falhas']]"; }
$D -At -f $S/../0008/testes.sql | tail -1 > $W/r0008.json; resumo $W/r0008.json "3. Testes da 0007 e da 0008, com a 0009 e a 0010 aplicadas:"
$D -At -f $S/testes.sql | tail -1 > $S/resultado-testes-local.json; resumo $S/resultado-testes-local.json "4. Testes da 0009 e da 0010:"
$D -At -c "select count(*) from public.fin_contas" -c "select count(*) from public.fin_lancamentos" -c "select count(*) from public.fin_extratos" | tr '\n' ' ' | grep -q "^0 0 0 $" && echo "5. Testes não deixaram resíduo"
$D -At -f $T6/conferencia.sql > $W/conf-fim.txt
diff -q $W/conf-antes.txt $W/conf-fim.txt >/dev/null && echo "6. Núcleo do diagnóstico igual ao de antes das migrations"
rm -r $W
