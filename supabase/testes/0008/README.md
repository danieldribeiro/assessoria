# Testes da migração 0008 (editar lançamento)

A migração está em `supabase/migrations/0008_financeiro_editar_lancamento.sql`. **Nada aqui roda em produção.** A 0008 foi aplicada no projeto de teste `axis-testes`, que tem só dados fictícios.

| Arquivo | Para quê |
|---|---|
| `rodar.sh` | Ciclo completo num Postgres 16 local descartável. Carrega as migrações 0001 a 0006 e os dados fictícios, aplica a 0007 e a 0008, roda os testes e confere que o núcleo de diagnósticos ficou igual e que nada ficou gravado |
| `testes.sql` | 146 casos. São os 113 da 0007 e mais 33 de edição: valor, rateio, caixa, datas, situação, regras V7 e V8, histórico e acesso por equipe, cliente e anônimo. Os 3 casos da 0007 que a 0008 muda de propósito estão marcados com "(0008)" |
| `resultado-*` | Saídas das execuções |

Os testes também usam três arquivos de `../0007/`: as permissões locais, os dados fictícios e os casos de exclusão que só rodam no Postgres local.

## Resultados

| Verificação | Onde | Resultado |
|---|---|---|
| `testes.sql` | Postgres 16 local | 146 de 146 |
| `testes.sql` com os casos só locais da 0007 | Postgres 16 local | 153 de 153 |
| Núcleo de diagnósticos antes e depois | local | mesmo hash |
| Resíduo deixado pelos testes | local | nenhum |
| SQL aplicado no `axis-testes` comparado com este arquivo | histórico de migrações do Supabase | mesmo MD5 (`c4032cf9…`) |

SHA-256 da migração: `64aea481e87ac9706023f908e426bca1d6cd6a2f656cd0e2576d01a6da83c696`.

Para rodar os testes no `axis-testes`, abra o SQL Editor do projeto e execute `testes.sql` inteiro. A última linha mostra o total de casos que passaram.
