# Testes da migração 0006

A migração está em `supabase/migrations/0006_situacao_indicadores.sql`. Esta pasta guarda a reversão, os testes e as evidências da validação. **Nada aqui roda em produção**, exceto o roteiro de conferência, que só lê.

| Arquivo | Para quê |
|---|---|
| `0006_reversao.sql` | Desfaz a 0006: apaga só as 4 colunas e as 10 restrições que ela cria |
| `roteiro-conferencia-producao.sql` | Só leitura. Rodar antes e depois da aplicação em produção |
| `conferencia.sql` | Contagem e hash de `indicadores` e `diagnosticos` (usado pelos testes e pelo roteiro) |
| `rodar.sh` | Ciclo completo num Postgres local descartável: 0001–0005, dados fictícios, 0006, testes, reversão, reaplicação |
| `00_stubs.sql`, `seed.sql` | Esquema `auth` mínimo e dados fictícios para o Postgres local |
| `testes.sql` | 40 testes das restrições (Postgres local) |
| `seed-supabase.sql`, `testes-supabase.sql` | Dados fictícios e 50 testes no projeto Supabase `axis-testes`, com login real como equipe, cliente e anônimo |
| `reversao-teste-supabase.sql` | Reversão e reaplicação dentro de uma subtransação desfeita no fim; compara esquema e dados |
| `resultado-*` | Saídas das execuções |

## Resultados

| Verificação | Onde | Resultado |
|---|---|---|
| Testes das restrições R0–R5 e R7 | Postgres 16 local | 40 de 40 |
| Testes das restrições + central como equipe, cliente e anônimo | Supabase `axis-testes` (PostgreSQL 17) | 50 de 50 |
| Dados antes = depois da 0006 (66 indicadores, 3 diagnósticos) | local e Supabase | iguais |
| Testes sem resíduo | local e Supabase | iguais |
| Reversão devolve esquema e dados | local | iguais |
| Esquema depois da reversão = esquema atual de produção | local × produção (só leitura) | mesmo hash (`c3b087ff…`) |
| Reaplicação depois da reversão | local | ok, dados iguais |
| Esquema com a 0006: Supabase = local | `axis-testes` × local | mesmo hash (`5eafb3f2…`) |
| SQL aplicado no `axis-testes` = este arquivo | histórico de migrações do Supabase | mesmo MD5 (sem a quebra de linha final) |

**Reversão no Supabase:** a ferramenta usada nesta sessão bloqueia comandos `drop` à espera de uma confirmação manual, então a reversão não rodou no `axis-testes`. Para rodá-la lá, abra o SQL Editor do projeto `axis-testes` e execute `reversao-teste-supabase.sql`. O script desfaz tudo no fim e mostra os hashes de cada etapa. O esperado é:
- esquema `c3b087ff99e22628b8ff5d8f614dd866` depois da reversão;
- esquema `5eafb3f2fad6a1edfb06f0594964b809` depois de reaplicar;
- dados iguais em todas as etapas.

Os testes passando validam as restrições, não a metodologia.
