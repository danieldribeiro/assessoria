#!/bin/bash
# Valida a 0008 (com a 0007) num Postgres local descartável: esquema 0001–0006, dados fictícios, conferência do núcleo
# do diagnóstico antes e depois, aplicação da 0007 e da 0008 e testes (os da 0007, ajustados, mais os de edição).
# Uso: PGHOST=/caminho/do/socket PGPORT=5432 PGUSER=postgres supabase/testes/0008/rodar.sh
set -e
S=$(cd "$(dirname "$0")" && pwd); R=$S/../../migrations; T6=$S/../0006; W=$(mktemp -d)
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -c "drop database if exists teste_0008" -c "create database teste_0008"
D="$P -d teste_0008"
for f in $T6/00_stubs.sql $R/000{1,2,3,4,5,6}_*.sql $T6/seed.sql $S/../0007/seed-local.sql; do
  $D -f $f >/dev/null 2>&1 || { echo "falhou: $f"; exit 1; }
done
# seed.sql da 0006 traz as empresas e os diagnósticos fictícios; seed-local.sql acrescenta as pessoas e a central.
echo "1. Esquema 0001–0006 e dados fictícios carregados"
$D -At -f $T6/conferencia.sql > $W/conf-antes.txt
$D --single-transaction -f $R/0007_financeiro_fluxo_caixa.sql
$D --single-transaction -f $R/0008_financeiro_editar_lancamento.sql
$D -At -f $T6/conferencia.sql > $W/conf-depois.txt
diff -q $W/conf-antes.txt $W/conf-depois.txt >/dev/null && echo "2. Aplicadas a 0007 e a 0008; núcleo do diagnóstico igual: $(tr '\n' ' ' < $W/conf-depois.txt)"
$D -f $S/../0007/01_permissoes_supabase.sql
$D -At -f $S/testes.sql | tail -1 > $S/resultado-testes-local.json
python3 -c "import json,sys; d=json.load(open('$S/resultado-testes-local.json')); print('3. Testes:', d['passaram'], 'de', d['total']); [print('   falhou:', f['caso'], '| esperado', f['esperado'], '| obtido', f['obtido']) for f in d['falhas']]"
$D -At -f $S/../0007/testes-locais.sql -f $S/testes.sql | tail -1 > $S/resultado-testes-locais.json
python3 -c "import json,sys; d=json.load(open('$S/resultado-testes-locais.json')); print('4. Com os casos só locais:', d['passaram'], 'de', d['total']); [print('   falhou:', f['caso'], '| esperado', f['esperado'], '| obtido', f['obtido']) for f in d['falhas']]"
$D -At -c "select count(*) from public.fin_contas" -c "select count(*) from public.fin_lancamentos" | tr '\n' ' ' | grep -q "^0 0 $" && echo "5. Testes não deixaram resíduo"
$D -At -f $T6/conferencia.sql > $W/conf-fim.txt
diff -q $W/conf-antes.txt $W/conf-fim.txt >/dev/null && echo "6. Núcleo do diagnóstico igual ao de antes da 0007 e da 0008"
rm -r $W
