import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
export { cx };

const variantes = {
  primario: "bg-marca-600 text-white hover:bg-marca-700 shadow-sm shadow-marca-600/20",
  secundario: "bg-superficie text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-xs",
  fantasma: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  perigo: "text-red-600 hover:bg-red-50",
};

export function classeBotao(variante: keyof typeof variantes = "primario", pequeno = false) {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
    pequeno ? "h-7 px-2.5 text-xs [&_svg]:size-3.5" : "h-9 px-3.5 text-sm [&_svg]:size-4",
    variantes[variante],
  );
}

export function Botao({
  variante = "primario",
  pequeno,
  className,
  ...props
}: ComponentProps<"button"> & { variante?: keyof typeof variantes; pequeno?: boolean }) {
  return <button className={cx(classeBotao(variante, pequeno), className)} {...props} />;
}

export function LinkBotao({
  variante = "secundario",
  pequeno,
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: keyof typeof variantes; pequeno?: boolean }) {
  return <Link className={cx(classeBotao(variante, pequeno), className)} {...props} />;
}

export const classeInput =
  "block w-full rounded-lg border border-slate-200 bg-superficie px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-marca-500 focus:outline-none focus:ring-3 focus:ring-marca-100";

export function Campo({
  rotulo,
  dica,
  children,
  className,
}: {
  rotulo: string;
  dica?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export function Entrada(props: ComponentProps<"input">) {
  return <input {...props} className={cx(classeInput, props.className)} />;
}

export function AreaTexto(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cx(classeInput, props.className)} />;
}

export function Selecao({
  opcoes,
  vazio,
  ...props
}: ComponentProps<"select"> & {
  opcoes: readonly (string | { valor: string; rotulo: string })[];
  vazio?: string;
}) {
  return (
    <select {...props} className={cx(classeInput, "pr-8", props.className)}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {opcoes.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ),
      )}
    </select>
  );
}

export function Cartao({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-xl border border-slate-200/80 bg-superficie shadow-xs", className)}
      {...props}
    />
  );
}

export function CabecalhoCartao({
  titulo,
  children,
  contagem,
  icone,
}: {
  titulo: string;
  children?: ReactNode;
  contagem?: number;
  icone?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <h2 className="flex items-center text-sm font-semibold text-slate-900">
        {icone && <span className="mr-2 text-slate-400 [&_svg]:size-4">{icone}</span>}
        {titulo}
        {contagem !== undefined && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {contagem}
          </span>
        )}
      </h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function CabecalhoPagina({
  titulo,
  subtitulo,
  icone,
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  icone?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {icone && <span className="text-marca-600 [&_svg]:size-7">{icone}</span>}
          {titulo}
        </h1>
        {subtitulo && <div className="mt-1.5 text-sm text-slate-500 sm:text-base">{subtitulo}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Vazio({ children, icone }: { children: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center text-sm text-slate-500">
      {icone && (
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 [&_svg]:size-5">
          {icone}
        </span>
      )}
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

export const tons = {
  cinza: "bg-slate-100 text-slate-700 ring-slate-200",
  azul: "bg-marca-50 text-marca-700 ring-marca-100",
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ambar: "bg-amber-50 text-amber-800 ring-amber-200",
  vermelho: "bg-red-50 text-red-700 ring-red-200",
  roxo: "bg-violet-50 text-violet-700 ring-violet-200",
};
export type Tom = keyof typeof tons;

export function Etiqueta({
  tom = "cinza",
  children,
  className,
  title,
}: {
  tom?: Tom;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tons[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const classeTabela = {
  tabela: "w-full text-left text-sm",
  cabeca: "border-b border-slate-100 bg-slate-50/70 text-xs font-medium text-slate-500",
  th: "px-5 py-2.5 font-medium first:pl-5",
  linha: "border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/70",
  td: "px-5 py-3 align-top",
};

// Iniciais para o avatar da empresa, ignorando palavras genéricas ("Clínica Odonto Vida" → "V").
const GENERICAS = new Set(["clínica", "clinica", "odonto", "odontologia", "consultório", "consultorio", "centro", "de", "da", "do", "das", "dos", "e"]);
export function iniciais(nome: string) {
  const palavras = nome.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean);
  const uteis = palavras.filter((p) => !GENERICAS.has(p.toLowerCase()));
  return (uteis.length ? uteis : palavras)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
