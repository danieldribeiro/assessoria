#!/bin/bash
# Valida a 0006 num Postgres local descartável: esquema 0001–0005, dados fictícios, aplicação, testes, reversão e reaplicação.
# Uso: PGHOST=/caminho/do/socket PGPORT=5432 PGUSER=postgres supabase/testes/0006/rodar.sh
set -e
S=$(cd "$(dirname "$0")" && pwd); R=$S/../../migrations; W=$(mktemp -d)
P="psql -v ON_ERROR_STOP=1 -q -X"
ESQ="select table_name||'.'||column_name||' '||data_type||' '||is_nullable from information_schema.columns where table_schema='public' and table_name in ('indicadores','diagnosticos') union all select conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.indicadores'::regclass,'public.diagnosticos'::regclass) order by 1"
$P -c "drop database if exists teste_0006" -c "create database teste_0006"
D="$P -d teste_0006"
for f in $S/00_stubs.sql $R/000{1,2,3,4,5}_*.sql $S/seed.sql; do $D -f $f >/dev/null 2>&1 || { echo "falhou: $f"; exit 1; }; done
echo "1. Esquema 0001–0005 e dados fictícios carregados"
$D -Atc "$ESQ" > $W/esquema-antes.txt
$D -At -f $S/conferencia.sql > $W/conf-antes.txt
$D --single-transaction -f $R/0006_situacao_indicadores.sql
$D -At -f $S/conferencia.sql > $W/conf-depois.txt
diff -q $W/conf-antes.txt $W/conf-depois.txt >/dev/null && echo "2. Aplicada a 0006; conferência antes = depois: $(tr '\n' ' ' < $W/conf-depois.txt)"
$D -f $S/testes.sql 2>&1 | grep -v -E '^ caso|^------$|^ $|^\(1 row\)|^$' > $S/resultado-testes-local.txt
echo "3. Testes (passaram | total): $(grep -E "^ +[0-9]+ \| +[0-9]+$" $S/resultado-testes-local.txt)"
$D -At -f $S/conferencia.sql > $W/conf-pos-testes.txt
diff -q $W/conf-antes.txt $W/conf-pos-testes.txt >/dev/null && echo "4. Testes não deixaram resíduo (conferência igual)"
$D --single-transaction -f $S/0006_reversao.sql
$D -Atc "$ESQ" > $W/esquema-reversao.txt
$D -At -f $S/conferencia.sql > $W/conf-reversao.txt
diff $W/esquema-antes.txt $W/esquema-reversao.txt && diff -q $W/conf-antes.txt $W/conf-reversao.txt >/dev/null && echo "5. Reversão: esquema e dados idênticos aos de antes da 0006"
$D --single-transaction -f $R/0006_situacao_indicadores.sql
$D -At -f $S/conferencia.sql > $W/conf-reaplicada.txt
diff -q $W/conf-antes.txt $W/conf-reaplicada.txt >/dev/null && echo "6. Reaplicação depois da reversão: ok, dados idênticos"
rm -r $W
