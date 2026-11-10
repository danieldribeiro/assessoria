// Usado pelo aviso de "sistema fora do ar" (ex.: UptimeRobot): confere se o site responde e se o banco atende.
// Não lê dado nenhum de cliente: a consulta roda sem login, e as regras do banco devolvem zero linhas.

type Consulta = () => PromiseLike<{ error: { message: string } | null }>;

export type Saude = { ok: boolean; banco: "ok" | "erro" | "lento"; ms: number };

export async function verificarSaude(consultar: Consulta, limiteMs = 8000): Promise<Saude> {
  const inicio = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lento = new Promise<"lento">((resolve) => {
    timer = setTimeout(() => resolve("lento"), limiteMs);
  });
  try {
    const r = await Promise.race([consultar(), lento]);
    const banco = r === "lento" ? "lento" : r.error ? "erro" : "ok";
    return { ok: banco === "ok", banco, ms: Date.now() - inicio };
  } catch {
    return { ok: false, banco: "erro", ms: Date.now() - inicio };
  } finally {
    clearTimeout(timer);
  }
}
