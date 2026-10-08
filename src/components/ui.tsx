import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
export { cx };

const variantes = {
  primario: "bg-marca-600 text-white hover:bg-marca-700 shadow-sm",
  secundario: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
  fantasma: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  perigo: "text-red-600 hover:bg-red-50",
};

export function classeBotao(variante: keyof typeof variantes = "primario", pequeno = false) {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
    pequeno ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
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
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-100";

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
      className={cx("rounded-lg border border-slate-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}

export function CabecalhoCartao({
  titulo,
  children,
  contagem,
}: {
  titulo: string;
  children?: ReactNode;
  contagem?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-900">
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
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{titulo}</h1>
        {subtitulo && <div className="mt-1 text-sm text-slate-500">{subtitulo}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
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
  cabeca:
    "border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500",
  th: "px-4 py-2.5 font-medium",
  linha: "border-b border-slate-100 last:border-0 hover:bg-slate-50/60",
  td: "px-4 py-2.5 align-top",
};
