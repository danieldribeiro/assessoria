# Assessoria · Sistema interno de diagnóstico

Ferramenta interna da assessoria para organizar clientes, diagnósticos, coleta de dados, indicadores, achados, oportunidades e planos de ação.

Stack: Next.js (App Router) · Supabase (PostgreSQL + Auth) · Tailwind CSS. Hospedagem sugerida: Vercel.

## Telas

- **Painel**: números do dia, diagnósticos em andamento (filtráveis), problemas e oportunidades de prioridade alta, ações pendentes.
- **Empresas** e **Empresa**: cadastro, contatos e diagnósticos de cada cliente.
- **Diagnóstico**: trilha Coleta → Análise → Achados → Oportunidades → Plano de ação, uma aba por etapa, mais a Visão geral.
- **Relatório final**: página pronta para imprimir ou salvar em PDF.

## Configuração (uma vez)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor** do Supabase, rode em ordem os arquivos de `supabase/migrations/` (`0001_esquema.sql`, `0002_ajustes_seguranca.sql`, `0003_responsaveis.sql`...).
3. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**. Só a equipe acessa.
4. Em **Authentication → Users → Add user → Create new user**, crie um usuário (e-mail e senha) para cada pessoa da equipe. Marque "Auto Confirm User".
   - Para o nome aparecer certo no sistema, depois de criar rode no SQL Editor:
     `update perfis set nome = 'Nome da pessoa' where email = 'email@exemplo.com';`
5. Em **Project Settings → API**, copie a URL do projeto e a chave `anon` (ou `publishable`).
6. Na [Vercel](https://vercel.com), importe este repositório e defina as variáveis:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Rodar localmente

```bash
cp .env.example .env.local   # preencha com os dados do Supabase
npm install
npm run dev
```

## Metodologia

As listas padrão de solicitações e de indicadores criadas em cada novo diagnóstico ficam em `src/lib/modelos/index.ts`. Editar essas listas muda os próximos diagnósticos, sem afetar os já criados.

A prioridade de achados e oportunidades é calculada no banco a partir de três notas de 1 a 3:
`Impacto + Urgência + (4 − Esforço)`. De 7 a 9 é Alta, 5 e 6 Média, 3 e 4 Baixa. Pode ser ajustada manualmente em cada item.
