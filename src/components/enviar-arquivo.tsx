"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { avisar } from "@/components/avisos";
import { classeBotao, cx } from "@/components/ui";
import { ACEITA, caminhoDoArquivo, problemaNoArquivo } from "@/lib/envios";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { registrarEnvio } from "@/server/envios";

// Botão "Anexar": o arquivo sobe do navegador direto para o armazenamento privado da clínica
// (a regra do banco confere quem pode) e depois o envio é registrado. Aceita vários arquivos de uma vez.
export function EnviarArquivo({
  empresaId,
  itemId,
  competencia,
  rotulo = "Anexar",
  variante = "secundario",
}: {
  empresaId: string;
  itemId: string | null;
  competencia: string | null;
  rotulo?: string;
  variante?: "primario" | "secundario";
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const router = useRouter();

  async function enviar(arquivos: File[]) {
    const supabase = createBrowserClient(SUPABASE_URL!, SUPABASE_KEY!);
    let enviados = 0;
    for (const arquivo of arquivos) {
      const problema = problemaNoArquivo(arquivo.name, arquivo.size);
      if (problema) {
        avisar(`${arquivo.name}: ${problema}`, "erro");
        continue;
      }
      setEnviando(arquivo.name);
      const caminho = caminhoDoArquivo(empresaId, arquivo.name, crypto.randomUUID());
      const { error } = await supabase.storage
        .from("envios")
        .upload(caminho, arquivo, { contentType: arquivo.type || "application/octet-stream", upsert: false });
      if (error) {
        avisar(`${arquivo.name}: não foi possível enviar. Tente de novo.`, "erro");
        continue;
      }
      const r = await registrarEnvio(empresaId, { itemId, competencia, caminho, nomeArquivo: arquivo.name, tamanho: arquivo.size });
      if (r?.erro) {
        avisar(`${arquivo.name}: ${r.erro}`, "erro");
        continue;
      }
      enviados++;
    }
    setEnviando(null);
    if (entrada.current) entrada.current.value = "";
    if (enviados) {
      avisar(enviados === 1 ? "Arquivo enviado" : `${enviados} arquivos enviados`);
      router.refresh();
    }
  }

  return (
    <label className={cx(classeBotao(variante, true), enviando && "pointer-events-none opacity-60")}>
      <Paperclip />
      <span className="max-w-40 truncate">{enviando ? `Enviando ${enviando}…` : rotulo}</span>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEITA}
        className="sr-only"
        disabled={!!enviando}
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          if (lista.length) enviar(lista);
        }}
      />
    </label>
  );
}
