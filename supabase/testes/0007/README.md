# Testes da migração 0007 (fluxo de caixa)

A migração está em `supabase/migrations/0007_financeiro_fluxo_caixa.sql`. **Nada aqui roda em produção.** A 0007 só foi aplicada no projeto de teste `axis-testes`, com dados fictícios.

| Arquivo | Para quê |
|---|---|
| `rodar.sh` | Ciclo completo num Postgres 16 local descartável: 0001–0006, dados fictícios, hash do núcleo de diagnósticos, 0007, testes, conferência de resíduo e do hash de novo |
| `01_permissoes_supabase.sql`, `seed-local.sql` | Permissões no estilo do Supabase e dados fictícios (equipe, dois clientes, duas empresas) para o Postgres local |
| `testes.sql` | 113 casos: plano de contas, contas de caixa, lançamentos, rateio, transferências, saldos, fluxo e isolamento por empresa como equipe, cliente e anônimo. Cada caso roda numa subtransação desfeita no fim |
| `testes-locais.sql` | 7 tentativas de exclusão pela API. Só no Postgres local, porque a ferramenta do Supabase usada nesta sessão trava em comandos com essa palavra |
| `resultado-*` | Saídas das execuções |

## Resultados

| Verificação | Onde | Resultado |
|---|---|---|
| `testes.sql` | Postgres 16 local | 113 de 113 |
| `testes.sql` + `testes-locais.sql` | Postgres 16 local | 120 de 120 |
| `testes.sql` | Supabase `axis-testes` (PostgreSQL 17) | 113 de 113 |
| Núcleo de diagnósticos antes = depois da 0007 | local | mesmo hash |
| Testes sem resíduo | local e Supabase | nada gravado |
| SQL aplicado no `axis-testes` = este arquivo | histórico de migrações do Supabase | mesmo MD5 (`6e4674c9…`) |

SHA-256 da migração: `5d413b30d754924c30f5dad251808abf133598f9cbf3b1bcad582cd72b43c7db`.

Para rodar no `axis-testes` de novo: abra o SQL Editor do projeto e execute `testes.sql` inteiro de uma vez. A última linha mostra `{"total":113,"falhas":[],"passaram":113}`.

Os testes passando validam as regras do banco, não a metodologia nem o plano de contas de nenhuma clínica.
