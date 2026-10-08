"use client";

import { ImageUp, Search, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { avisar } from "@/components/avisos";
import { Campo, Entrada, Selecao, classeBotao, cx } from "@/components/ui";
import { UFS, type Cadastro } from "@/lib/dominio";

const so = (v: string) => v.replace(/\D/g, "");

export function formatarCnpj(v: string) {
  const d = so(v);
  if (d.length !== 14) return v;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatarCep(v: string) {
  const d = so(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v;
}

function formatarTelefone(v: string) {
  const d = so(v);
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return v;
}

// "SAO PAULO" → "São Paulo" não dá para acentuar; ao menos tira o caixa alta.
function capitalizar(v: string) {
  if (v !== v.toUpperCase()) return v;
  return v
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, espaco, letra) => espaco + letra.toUpperCase())
    .replace(/\s(D[aeo]s?|E)\s/g, (m) => m.toLowerCase());
}

// Preenche campos do formulário pelo nome. `soVazios` não sobrescreve o que já foi digitado.
function preencher(
  form: HTMLFormElement | null,
  valores: Record<string, string | null | undefined>,
  soVazios: string[] = [],
) {
  if (!form) return;
  for (const [nome, valor] of Object.entries(valores)) {
    const campo = form.elements.namedItem(nome);
    if (!(campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement)) continue;
    if (!valor || (soVazios.includes(nome) && campo.value.trim())) continue;
    campo.value = valor;
  }
}

// Campos de razão social, CNPJ, inscrições, contato e endereço.
// O CNPJ busca os dados na Receita (BrasilAPI) e o CEP completa o endereço (ViaCEP).
export function CamposCadastro({
  valores,
  campoNome,
  extrasIdentificacao,
  ladoALado,
}: {
  valores?: Partial<Cadastro> | null;
  campoNome: string; // onde cai o nome fantasia da Receita, se estiver vazio
  extrasIdentificacao?: ReactNode;
  ladoALado?: boolean; // dados fiscais e endereço em duas colunas
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const [buscando, setBuscando] = useState(false);
  const v = (c: keyof Cadastro) => valores?.[c] ?? "";
  const form = () => ancora.current?.closest("form") ?? null;

  async function buscarCnpj() {
    const campo = form()?.elements.namedItem("cnpj") as HTMLInputElement | null;
    const cnpj = so(campo?.value ?? "");
    if (cnpj.length !== 14) {
      avisar("Digite os 14 números do CNPJ.", "erro");
      return;
    }
    setBuscando(true);
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!r.ok) throw new Error(r.status === 404 ? "CNPJ não encontrado na Receita." : "A consulta do CNPJ falhou.");
      const d = await r.json();
      const tipo = d.descricao_tipo_de_logradouro ? `${capitalizar(d.descricao_tipo_de_logradouro)} ` : "";
      preencher(
        form(),
        {
          cnpj: formatarCnpj(cnpj),
          razao_social: d.razao_social,
          [campoNome]: d.nome_fantasia ? capitalizar(d.nome_fantasia) : null,
          email: d.email?.toLowerCase(),
          telefone: d.ddd_telefone_1 ? formatarTelefone(d.ddd_telefone_1) : null,
          cep: d.cep ? formatarCep(String(d.cep)) : null,
          logradouro: d.logradouro ? tipo + capitalizar(d.logradouro) : null,
          numero: d.numero,
          complemento: d.complemento ? capitalizar(d.complemento) : null,
          bairro: d.bairro ? capitalizar(d.bairro) : null,
          cidade: d.municipio ? capitalizar(d.municipio) : null,
          uf: d.uf,
          codigo_municipio: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : null,
        },
        [campoNome, "email", "telefone"],
      );
      avisar("Dados da Receita preenchidos. Confira antes de salvar.");
    } catch (e) {
      avisar(e instanceof TypeError ? "Sem conexão com a consulta de CNPJ." : (e as Error).message, "erro");
    } finally {
      setBuscando(false);
    }
  }

  async function buscarCep(valor: string) {
    const cep = so(valor);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) return avisar("CEP não encontrado.", "erro");
      preencher(
        form(),
        {
          cep: formatarCep(cep),
          logradouro: d.logradouro,
          bairro: d.bairro,
          cidade: d.localidade,
          uf: d.uf,
          codigo_municipio: d.ibge,
        },
        ["logradouro", "bairro"],
      );
    } catch {
      // Sem a consulta, o endereço é digitado à mão.
    }
  }

  return (
    <div ref={ancora} className={ladoALado ? "grid gap-x-6 gap-y-5 md:grid-cols-2" : "space-y-5"}>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dados fiscais</legend>
        <Campo rotulo="CNPJ" dica="Use “Buscar” para trazer razão social e endereço da Receita.">
          <div className="flex gap-2">
            <Entrada
              name="cnpj"
              defaultValue={v("cnpj")}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              onBlur={(e) => (e.currentTarget.value = formatarCnpj(e.currentTarget.value))}
            />
            <button type="button" onClick={buscarCnpj} disabled={buscando} className={classeBotao("secundario")}>
              <Search />
              {buscando ? "Buscando…" : "Buscar"}
            </button>
          </div>
        </Campo>
        <Campo rotulo="Razão social">
          <Entrada name="razao_social" defaultValue={v("razao_social")} />
        </Campo>
        {extrasIdentificacao}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Inscrição municipal">
            <Entrada name="inscricao_municipal" defaultValue={v("inscricao_municipal")} />
          </Campo>
          <Campo rotulo="Inscrição estadual">
            <Entrada name="inscricao_estadual" defaultValue={v("inscricao_estadual")} placeholder="Isento" />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="E-mail para notas">
            <Entrada name="email" type="email" defaultValue={v("email")} />
          </Campo>
          <Campo rotulo="Telefone">
            <Entrada
              name="telefone"
              defaultValue={v("telefone")}
              inputMode="tel"
              onBlur={(e) => (e.currentTarget.value = formatarTelefone(e.currentTarget.value))}
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Endereço</legend>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Campo rotulo="CEP">
            <Entrada
              name="cep"
              defaultValue={v("cep")}
              inputMode="numeric"
              placeholder="00000-000"
              onBlur={(e) => buscarCep(e.currentTarget.value)}
            />
          </Campo>
          <Campo rotulo="Logradouro">
            <Entrada name="logradouro" defaultValue={v("logradouro")} />
          </Campo>
        </div>
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Campo rotulo="Número">
            <Entrada name="numero" defaultValue={v("numero")} />
          </Campo>
          <Campo rotulo="Complemento">
            <Entrada name="complemento" defaultValue={v("complemento")} />
          </Campo>
        </div>
        <Campo rotulo="Bairro">
          <Entrada name="bairro" defaultValue={v("bairro")} />
        </Campo>
        <div className="grid grid-cols-[1fr_5.5rem] gap-3">
          <Campo rotulo="Cidade">
            <Entrada name="cidade" defaultValue={v("cidade")} />
          </Campo>
          <Campo rotulo="UF">
            <Selecao name="uf" opcoes={UFS} defaultValue={v("uf")} vazio=" " />
          </Campo>
        </div>
        <Campo rotulo="Código IBGE do município" dica="Pedido na nota de serviço. Vem junto com o CEP ou o CNPJ.">
          <Entrada name="codigo_municipio" defaultValue={v("codigo_municipio")} inputMode="numeric" />
        </Campo>
      </fieldset>
    </div>
  );
}

const LADO = { foto: 320, logo: 640 };

// Reduz a imagem no navegador antes de enviar: fotos de celular passam fácil de 5 MB.
async function reduzir(arquivo: File, lado: number): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.88));
  if (!blob) throw new Error("Não foi possível ler a imagem.");
  // Navegadores sem WebP devolvem PNG.
  const ext = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `imagem.${ext}`, { type: blob.type });
}

// Foto de perfil ou logo: mostra a atual, troca e remove. O arquivo vai no próprio formulário.
export function SeletorImagem({
  nome,
  valor,
  tipo,
  substituto,
}: {
  nome: string;
  valor: string | null | undefined;
  tipo: "foto" | "logo";
  substituto: ReactNode; // o que aparece sem imagem (iniciais)
}) {
  const escolha = useRef<HTMLInputElement>(null);
  const envio = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState(valor ?? null);
  const [removida, setRemovida] = useState(false);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const reduzido = await reduzir(arquivo, LADO[tipo]);
      const lista = new DataTransfer();
      lista.items.add(reduzido);
      envio.current!.files = lista.files;
      setPrevia(URL.createObjectURL(reduzido));
      setRemovida(false);
    } catch {
      avisar("Formato de imagem não suportado. Use JPG, PNG ou WebP.", "erro");
    }
  }

  function remover() {
    if (envio.current) envio.current.value = "";
    setPrevia(null);
    setRemovida(true);
  }

  const redonda = tipo === "foto";
  return (
    <div className="flex items-center gap-4">
      <div
        className={cx(
          "flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 text-lg font-semibold text-slate-500 ring-1 ring-slate-200",
          redonda ? "size-16 rounded-full" : "h-16 w-28 rounded-lg bg-superficie p-1.5",
        )}
      >
        {previa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previa} alt="" className={cx("size-full", redonda ? "object-cover" : "object-contain")} />
        ) : (
          substituto
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => escolha.current?.click()} className={classeBotao("secundario", true)}>
          <ImageUp />
          {previa ? "Trocar" : redonda ? "Enviar foto" : "Enviar logo"}
        </button>
        {previa && (
          <button type="button" onClick={remover} className={classeBotao("fantasma", true)}>
            <Trash2 />
            Remover
          </button>
        )}
      </div>
      <input
        ref={escolha}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => escolher(e.currentTarget.files?.[0])}
      />
      <input ref={envio} type="file" name={nome} className="hidden" tabIndex={-1} aria-hidden />
      {removida && <input type="hidden" name={`${nome}_remover`} value="1" />}
    </div>
  );
}
