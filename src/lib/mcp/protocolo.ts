// Protocolo MCP (JSON-RPC 2.0) do conector do Claude, sem dependências: initialize, ping, tools/list e tools/call.
// Respostas sempre em JSON (o transporte "Streamable HTTP" permite), sem sessão no servidor.

export const VERSOES = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type Esquema = {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[]; pattern?: string }>;
  required?: string[];
  additionalProperties?: false;
};

export type Ferramenta = {
  name: string;
  title: string;
  description: string;
  inputSchema: Esquema;
  executar: (args: Record<string, unknown>) => Promise<unknown>;
};

type Mensagem = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type Resposta = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

// Erro que vai para o Claude como resposta da ferramenta (ex.: "empresa não encontrada"), não como falha do servidor.
export class ErroDeUso extends Error {}

const INSTRUCOES =
  "Dados do AXIS, o sistema da assessoria: empresas (clínicas), diagnósticos e financeiro gerencial. Só leitura. " +
  "Comece por listar_empresas para achar o id da empresa. Valores em reais; datas no formato AAAA-MM-DD. " +
  "O que aparece depende das permissões da conta que fez o login.";

const erro = (id: Mensagem["id"], code: number, message: string): Resposta => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export function validarArgumentos(esquema: Esquema, bruto: unknown): Record<string, unknown> {
  if (bruto !== undefined && (typeof bruto !== "object" || bruto === null || Array.isArray(bruto))) {
    throw new ErroDeUso("Os argumentos precisam ser um objeto.");
  }
  const args = (bruto ?? {}) as Record<string, unknown>;
  for (const campo of esquema.required ?? []) {
    if (args[campo] === undefined || args[campo] === null || args[campo] === "") throw new ErroDeUso(`Informe ${campo}.`);
  }
  const saida: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(args)) {
    const regra = esquema.properties[campo];
    if (!regra) throw new ErroDeUso(`Argumento desconhecido: ${campo}.`);
    if (valor === undefined || valor === null) continue;
    if (regra.type === "integer") {
      if (typeof valor !== "number" || !Number.isInteger(valor)) throw new ErroDeUso(`${campo} precisa ser um número inteiro.`);
    } else if (typeof valor !== regra.type) {
      throw new ErroDeUso(`${campo} precisa ser ${regra.type === "string" ? "um texto" : regra.type}.`);
    }
    if (regra.enum && !regra.enum.includes(valor as string)) throw new ErroDeUso(`${campo} precisa ser um de: ${regra.enum.join(", ")}.`);
    if (regra.pattern && !new RegExp(regra.pattern).test(valor as string)) throw new ErroDeUso(`${campo} está num formato inválido.`);
    saida[campo] = valor;
  }
  return saida;
}

export async function tratarMensagem(
  msg: Mensagem,
  ferramentas: Ferramenta[],
  registrar?: (ferramenta: string, args: Record<string, unknown>, ok: boolean) => void,
): Promise<Resposta | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return erro(msg?.id, -32600, "Requisição inválida.");
  }
  // Notificações (sem id) não têm resposta.
  if (msg.id === undefined) return null;
  const { id, method, params } = msg;

  switch (method) {
    case "initialize": {
      const pedida = params?.protocolVersion;
      const versao = VERSOES.find((v) => v === pedida) ?? VERSOES[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: versao,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "axis", title: "AXIS", version: "1.0.0" },
          instructions: INSTRUCOES,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: ferramentas.map(({ name, title, description, inputSchema }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
          })),
        },
      };
    case "tools/call": {
      const nome = params?.name;
      const ferramenta = ferramentas.find((f) => f.name === nome);
      if (!ferramenta) return erro(id, -32602, `Ferramenta desconhecida: ${String(nome)}.`);
      let args: Record<string, unknown> = {};
      try {
        args = validarArgumentos(ferramenta.inputSchema, params?.arguments);
        const dados = await ferramenta.executar(args);
        registrar?.(ferramenta.name, args, true);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(dados) }], isError: false } };
      } catch (e) {
        registrar?.(ferramenta.name, args, false);
        const texto = e instanceof ErroDeUso ? e.message : "Não foi possível consultar o AXIS agora. Tente de novo em instantes.";
        if (!(e instanceof ErroDeUso)) console.error("[mcp] erro na ferramenta", ferramenta.name, e);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: texto }], isError: true } };
      }
    }
    default:
      return erro(id, -32601, `Método não suportado: ${method}.`);
  }
}
