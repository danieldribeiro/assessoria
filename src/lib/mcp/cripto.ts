import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Tokens do conector do Claude: tudo o que o AXIS precisa lembrar vai dentro do próprio token, cifrado e assinado
// (AES-256-GCM) com a chave AXIS_MCP_SEGREDO. Assim não há tabela nova no banco. Trocar a chave na Vercel
// desconecta o Claude de todas as contas de uma vez.

export type TipoToken = "cliente" | "codigo" | "acesso" | "renovacao";

export function segredoConfigurado() {
  return (process.env.AXIS_MCP_SEGREDO ?? "").length >= 32;
}

function chave(segredo = process.env.AXIS_MCP_SEGREDO) {
  if (!segredo || segredo.length < 32) throw new Error("AXIS_MCP_SEGREDO ausente ou curta (mínimo 32 caracteres).");
  return createHash("sha256").update(segredo).digest();
}

const agora = () => Math.floor(Date.now() / 1000);

// O tipo entra como dado autenticado: um código não serve como token de acesso, e vice-versa.
export function selar(tipo: TipoToken, dados: Record<string, unknown>, validadeSegundos: number, segredo?: string) {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave(segredo), iv);
  cifra.setAAD(Buffer.from(tipo));
  const corpo = Buffer.concat([cifra.update(JSON.stringify({ ...dados, exp: agora() + validadeSegundos })), cifra.final()]);
  return Buffer.concat([iv, cifra.getAuthTag(), corpo]).toString("base64url");
}

export function abrir<T extends Record<string, unknown>>(tipo: TipoToken, token: string | null | undefined, segredo?: string) {
  if (!token) return null;
  try {
    const bruto = Buffer.from(token, "base64url");
    if (bruto.length < 29) return null;
    const decifra = createDecipheriv("aes-256-gcm", chave(segredo), bruto.subarray(0, 12));
    decifra.setAAD(Buffer.from(tipo));
    decifra.setAuthTag(bruto.subarray(12, 28));
    const texto = Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString("utf8");
    const dados = JSON.parse(texto) as T & { exp: number };
    if (typeof dados.exp !== "number" || dados.exp < agora()) return null;
    return dados;
  } catch {
    return null;
  }
}
