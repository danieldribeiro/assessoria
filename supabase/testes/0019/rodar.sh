#!/bin/bash
# Valida a 0019 (fichas técnicas e vendas do PDV) num Postgres local descartável: esquema 0001–0006, dados fictícios, migrations
# 0007 a 0026, os testes da 0008, 0010 e 0011 (nada do que existia mudou) e os testes da 0018.
# Uso: PGHOST=/caminho/do/socket PGPORT=5432 PGUSER=postgres supabase/testes/0018/rodar.sh
set -e
S=$(cd "$(dirname "$0")" && pwd); R=$S/../../migrations; T6=$S/../0006; W=$(mktemp -d)
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -c "drop database if exists teste_0019" -c "create database teste_0019"
D="$P -d teste_0019"
for f in $T6/00_stubs.sql $R/000{1,2,3,4,5,6}_*.sql $T6/seed.sql $S/../0007/seed-local.sql; do
  $D -f $f >/dev/null 2>&1 || { echo "falhou: $f"; exit 1; }
done
echo "1. Esquema 0001–0006 e dados fictícios carregados"
$D -At -f $T6/conferencia.sql > $W/conf-antes.txt
for f in $R/00{07,08,09,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26}_*.sql; do
  $D --single-transaction -f $f >/dev/null || { echo "falhou: $f"; exit 1; }
done
$D -At -f $T6/conferencia.sql > $W/conf-depois.txt
diff -q $W/conf-antes.txt $W/conf-depois.txt >/dev/null && echo "2. Aplicadas 0007 a 0026; núcleo do diagnóstico igual: $(tr '\n' ' ' < $W/conf-depois.txt)"
$D -At -c "begin; insert into public.fin_estoque_itens (empresa_id, nome, unidade, conteudo, conteudo_medida) values ('00000000-0000-0000-0000-0000000000e1', 'Fini teste', 'cx', 12, 'pct'); rollback;" >/dev/null \
  && ! $D -At -c "begin; insert into public.fin_estoque_itens (empresa_id, nome, unidade, conteudo, conteudo_medida) values ('00000000-0000-0000-0000-0000000000e1', 'Fini teste', 'cx', 12, 'cx'); rollback;" >/dev/null 2>&1 \
  && echo "2b. 0022: conteúdo em pct aceito, em cx recusado"
$D -At -c "begin; insert into public.fin_estoque_produtos (empresa_id, nome, preco_venda) values ('00000000-0000-0000-0000-0000000000e1', 'Latte teste', 15.5); rollback;" >/dev/null \
  && ! $D -At -c "begin; insert into public.fin_estoque_produtos (empresa_id, nome, preco_venda) values ('00000000-0000-0000-0000-0000000000e1', 'Latte teste', -1); rollback;" >/dev/null 2>&1 \
  && echo "2c. 0024: preço de venda aceito, negativo recusado"
$D -f $S/../0007/01_permissoes_supabase.sql
resumo() { python3 -c "import json,sys; d=json.load(open('$1')); print('$2', d['passaram'], 'de', d['total']); [print('   falhou:', f['caso'], '| esperado', f['esperado'], '| obtido', f['obtido']) for f in d['falhas']]"; }
$D -At -f $S/../0008/testes.sql | tail -1 > $W/r0008.json; resumo $W/r0008.json "3. Testes da 0007 e da 0008, com a 0019 aplicada:"
$D -At -f $S/../0010/testes.sql | tail -1 > $W/r0010.json; resumo $W/r0010.json "4. Testes da 0009 e da 0010, com a 0019 aplicada:"
$D -At -f $S/../0011/testes.sql | tail -1 > $W/r0011.json; resumo $W/r0011.json "5. Testes da 0011, com a 0019 aplicada:"
$D -At -f $S/../0018/testes.sql | tail -1 > $W/r0018.json; resumo $W/r0018.json "6. Testes da 0018, com a 0019 aplicada:"
$D -At -f $S/testes.sql | tail -1 > $S/resultado-testes-local.json; resumo $S/resultado-testes-local.json "6b. Testes da 0019:"
$D -At -f $S/../0023/testes.sql | tail -1 > $W/r0023.json; resumo $W/r0023.json "6c. Testes da 0023 (fechar o CMV do mês):"
$D -At -f $S/../0025/testes.sql | tail -1 > $W/r0025.json; resumo $W/r0025.json "6d. Testes da 0025 (complementos do CMV do mês):"
$D -At -f $S/../0026/testes.sql | tail -1 > $W/r0026.json; resumo $W/r0026.json "6e. Testes da 0026 (notas de compra):"
$D -At -c "select count(*) from public.fin_estoque_itens" -c "select count(*) from public.fin_estoque_contagens" -c "select count(*) from public.fin_estoque_produtos" -c "select count(*) from public.fin_estoque_vendas" -c "select count(*) from public.fin_estoque_notas" -c "select count(*) from public.empresas where estoque_ativo" | tr '\n' ' ' | grep -q "^0 0 0 0 0 0 $" && echo "7. Testes não deixaram resíduo; nenhuma empresa com estoque ligado"
$D -At -f $T6/conferencia.sql > $W/conf-fim.txt
diff -q $W/conf-antes.txt $W/conf-fim.txt >/dev/null && echo "8. Núcleo do diagnóstico igual ao de antes das migrations"
rm -r $W
