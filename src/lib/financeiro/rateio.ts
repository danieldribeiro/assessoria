// Rateio de um lançamento: uma linha por conta do plano, com soma exata (V7).
import { lerNumeroBR, mensagemNumeroInvalido } from "@/lib/numeros";

// Valor em reais com no máximo dois decimais (o banco guarda centavos). Devolve null se tiver mais casas.
export function emCentavos(valor: number) {
  const c = Math.round(valor * 100);
  return Math.abs(valor * 100 - c) < 1e-6 ? c : null;
}

// Lê as linhas do rateio ("rateio_conta" e "rateio_valor", na mesma ordem). Com uma linha só e valor vazio,
// a linha leva o valor total. A soma precisa ser exata (V7); o banco confere de novo ao gravar.
export function lerRateio(dados: FormData, totalCentavos: number) {
  const contas = dados.getAll("rateio_conta").map((v) => (typeof v === "string" ? v.trim() : ""));
  const valores = dados.getAll("rateio_valor").map((v) => (typeof v === "string" ? v : ""));
  const linhas: { conta_id: string; centavos: number }[] = [];
  for (let i = 0; i < contas.length; i++) {
    const leitura = lerNumeroBR(valores[i]);
    if (!contas[i] && leitura.estado === "vazio") continue;
    if (!contas[i]) return { erro: `Escolha a conta da linha ${i + 1} do rateio.` };
    if (leitura.estado === "invalido") return { erro: mensagemNumeroInvalido(`Valor da linha ${i + 1}`, leitura.texto) };
    let c: number | null;
    if (leitura.estado === "vazio") {
      if (contas.filter(Boolean).length > 1) return { erro: `Informe o valor da linha ${i + 1} do rateio.` };
      c = totalCentavos;
    } else {
      c = emCentavos(leitura.valor);
      if (c === null) return { erro: `O valor da linha ${i + 1} tem mais de duas casas decimais.` };
    }
    if (c <= 0) return { erro: `O valor da linha ${i + 1} precisa ser maior que zero.` };
    linhas.push({ conta_id: contas[i], centavos: c });
  }
  if (!linhas.length) return { erro: "Escolha ao menos uma conta do plano." };
  const soma = linhas.reduce((a, l) => a + l.centavos, 0);
  if (soma !== totalCentavos) {
    const f = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return { erro: `O rateio soma ${f(soma)} e o valor total é ${f(totalCentavos)}. A soma precisa ser exata.` };
  }
  return { linhas: linhas.map((l) => ({ conta_id: l.conta_id, valor: l.centavos / 100 })) };
}
