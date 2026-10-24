"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Gráfico mensal em SVG, sem biblioteca: colunas agrupadas e/ou linhas, um eixo só, grade discreta.
// Passar o mouse (ou o foco do teclado) num mês mostra todos os valores daquele mês; clicar abre os lançamentos.

export type CorSerie = 1 | 2 | 3 | 4;
export type Serie = {
  nome: string;
  valores: number[];
  forma: "coluna" | "linha";
  cor: CorSerie;
  // Colunas com sinal: positivo na cor da série, negativo em vermelho.
  sinal?: boolean;
};

const ALTURA = 220;
const MARGEM = { topo: 12, base: 26, esquerda: 64, direita: 12 };
const COR = (c: CorSerie) => `var(--grafico-${c})`;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const rotuloEixo = (v: number) => (v === 0 ? "0" : `${v < 0 ? "−" : ""}R$ ${compacto.format(Math.abs(v))}`);

// Marcas "redondas" para o eixo: 1, 2 ou 5 × 10^n.
export function escala(min: number, max: number, alvo = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (lo === hi) return { lo: 0, hi: 1, marcas: [0] };
  const bruto = (hi - lo) / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)!;
  const a = Math.floor(lo / passo) * passo;
  const b = Math.ceil(hi / passo) * passo;
  const marcas: number[] = [];
  for (let v = a; v <= b + passo / 2; v += passo) marcas.push(Math.round(v * 100) / 100);
  return { lo: a, hi: b, marcas };
}

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

export function GraficoMensal({
  rotulos,
  series,
  links,
  descricao,
  marca,
}: {
  rotulos: string[];
  series: Serie[];
  links?: (string | null)[];
  descricao: string;
  // Destaca uma posição com uma linha tracejada e um rótulo (por exemplo, o dia de menor saldo).
  marca?: { indice: number; rotulo: string };
}) {
  const router = useRouter();
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState<number | null>(null);
  const n = rotulos.length;
  const todos = series.flatMap((s) => s.valores);
  const { lo, hi, marcas } = escala(Math.min(...todos, 0), Math.max(...todos, 0));
  const larguraUtil = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita);
  const faixa = n ? larguraUtil / n : 0;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
  const y = (v: number) => MARGEM.topo + ((hi - v) / (hi - lo)) * alturaUtil;
  const xCentro = (i: number) => MARGEM.esquerda + faixa * i + faixa / 2;
  const colunas = series.filter((s) => s.forma === "coluna");
  const linhas = series.filter((s) => s.forma === "linha");
  const larguraColuna = colunas.length ? Math.min(24, (faixa * 0.7 - 2 * (colunas.length - 1)) / colunas.length) : 0;
  const passoRotulo = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(larguraUtil / 52))));
  const abrir = (i: number) => {
    const destino = links?.[i];
    if (destino) router.push(destino);
  };

  return (
    <div ref={ref} className="relative w-full">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {series.map((s) => (
            <li key={s.nome} className="flex items-center gap-1.5">
              {s.forma === "coluna" ? (
                <span className="size-2.5 rounded-sm" style={{ background: COR(s.cor) }} />
              ) : (
                <span className="h-0.5 w-3.5 rounded-full" style={{ background: COR(s.cor) }} />
              )}
              {s.nome}
            </li>
          ))}
        </ul>
      )}
      {largura > 0 && (
        <svg width={largura} height={ALTURA} role="img" aria-label={descricao} className="block overflow-visible">
          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={MARGEM.esquerda}
                x2={largura - MARGEM.direita}
                y1={y(m)}
                y2={y(m)}
                stroke="var(--grafico-grade)"
                strokeWidth={1}
              />
              <text x={MARGEM.esquerda - 8} y={y(m)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                {rotuloEixo(m)}
              </text>
            </g>
          ))}
          {lo < 0 && <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(0)} y2={y(0)} className="stroke-slate-400" strokeWidth={1} />}

          {rotulos.map((r, i) =>
            i % passoRotulo === 0 ? (
              <text key={r + i} x={xCentro(i)} y={ALTURA - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                {r}
              </text>
            ) : null,
          )}

          {ativo !== null && (
            <rect x={MARGEM.esquerda + faixa * ativo} y={MARGEM.topo} width={faixa} height={alturaUtil} className="fill-slate-100/70" />
          )}

          {marca && marca.indice < n && (
            <g>
              <line
                x1={xCentro(marca.indice)}
                x2={xCentro(marca.indice)}
                y1={MARGEM.topo}
                y2={MARGEM.topo + alturaUtil}
                className="stroke-slate-400"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={xCentro(marca.indice)}
                y={MARGEM.topo}
                dx={xCentro(marca.indice) > largura / 2 ? -6 : 6}
                dy="0.8em"
                textAnchor={xCentro(marca.indice) > largura / 2 ? "end" : "start"}
                className="fill-slate-600 text-[11px] font-medium"
              >
                {marca.rotulo}
              </text>
            </g>
          )}

          {colunas.map((s, k) =>
            s.valores.map((v, i) => {
              if (v === 0) return null;
              const x = xCentro(i) - (colunas.length * larguraColuna + 2 * (colunas.length - 1)) / 2 + k * (larguraColuna + 2);
              const topo = Math.min(y(v), y(0));
              const altura = Math.max(1, Math.abs(y(v) - y(0)));
              const cor = s.sinal && v < 0 ? "var(--grafico-negativo)" : COR(s.cor);
              return <path key={`${s.nome}${i}`} d={colunaArredondada(x, topo, larguraColuna, altura, v >= 0)} fill={cor} />;
            }),
          )}

          {linhas.map((s) => (
            <g key={s.nome}>
              <polyline
                points={s.valores.map((v, i) => `${xCentro(i)},${y(v)}`).join(" ")}
                fill="none"
                stroke={COR(s.cor)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {(ativo !== null ? [ativo] : n === 1 ? [0] : [n - 1]).map((i) => (
                <circle key={i} cx={xCentro(i)} cy={y(s.valores[i])} r={4} fill={COR(s.cor)} stroke="var(--color-superficie)" strokeWidth={2} />
              ))}
            </g>
          ))}

          {rotulos.map((r, i) => (
            <rect
              key={`alvo${i}`}
              x={MARGEM.esquerda + faixa * i}
              y={MARGEM.topo}
              width={faixa}
              height={alturaUtil}
              fill="transparent"
              tabIndex={0}
              role={links?.[i] ? "link" : undefined}
              aria-label={`${r}: ${series.map((s) => `${s.nome} ${moeda.format(s.valores[i])}`).join(", ")}`}
              className={links?.[i] ? "cursor-pointer outline-none" : "outline-none"}
              onPointerEnter={() => setAtivo(i)}
              onPointerLeave={() => setAtivo((a) => (a === i ? null : a))}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo((a) => (a === i ? null : a))}
              onClick={() => abrir(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter") abrir(i);
              }}
            />
          ))}
        </svg>
      )}
      {ativo !== null && largura > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-slate-200 bg-superficie px-3 py-2 text-xs shadow-md"
          style={{
            top: 28,
            left: Math.min(Math.max(0, xCentro(ativo) + (xCentro(ativo) > largura / 2 ? -176 : 16)), Math.max(0, largura - 168)),
          }}
        >
          <p className="mb-1 font-medium text-slate-500">{rotulos[ativo]}</p>
          {series.map((s) => (
            <p key={s.nome} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-0.5 w-3 rounded-full" style={{ background: COR(s.cor) }} />
                {s.nome}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">{moeda.format(s.valores[ativo])}</span>
            </p>
          ))}
          {links?.[ativo] && <p className="mt-1.5 text-slate-400">Clique para ver os lançamentos</p>}
        </div>
      )}
    </div>
  );
}

// Coluna com a ponta arredondada (4px) e a base reta, crescendo a partir da linha do zero.
function colunaArredondada(x: number, topo: number, w: number, h: number, paraCima: boolean) {
  const r = Math.min(4, w / 2, h);
  if (paraCima) {
    return `M${x},${topo + h} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + w - r} Q${x + w},${topo} ${x + w},${topo + r} V${topo + h} Z`;
  }
  const fundo = topo + h;
  return `M${x},${topo} V${fundo - r} Q${x},${fundo} ${x + r},${fundo} H${x + w - r} Q${x + w},${fundo} ${x + w},${fundo - r} V${topo} Z`;
}
