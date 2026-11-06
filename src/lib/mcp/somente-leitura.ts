// Trava de segurança do conector: mesmo que alguma ferramenta tentasse gravar, o cliente do Supabase usado pelo
// Claude só deixa sair leituras. Gravar, alterar ou apagar é recusado antes de chegar ao banco.

const FUNCOES_DE_LEITURA = new Set(["fin_saldos", "fin_fluxo_caixa"]);

export function requisicaoDeLeitura(url: string, metodo: string) {
  const m = metodo.toUpperCase();
  if (m === "GET" || m === "HEAD") return true;
  if (m !== "POST") return false;
  const caminho = new URL(url).pathname;
  const rpc = caminho.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  return !!rpc && FUNCOES_DE_LEITURA.has(rpc[1]);
}

export function fetchSomenteLeitura(base: typeof fetch = fetch): typeof fetch {
  return async (entrada, init) => {
    const pedido = entrada instanceof Request ? entrada : null;
    const url = pedido ? pedido.url : String(entrada);
    const metodo = init?.method ?? pedido?.method ?? "GET";
    if (!requisicaoDeLeitura(url, metodo)) {
      throw new Error("O conector do Claude é só de leitura: esta operação foi bloqueada.");
    }
    return base(entrada, init);
  };
}
