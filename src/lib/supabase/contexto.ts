import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

// Fora das telas (no conector do Claude) não há cookies: quem chama guarda aqui o cliente do Supabase da pessoa,
// e as consultas de sempre (criarCliente) passam a usá-lo, com as mesmas regras de acesso do banco.
export const clienteDoContexto = new AsyncLocalStorage<SupabaseClient>();
