import { NextResponse } from "next/server";
import { criarCliente } from "@/lib/supabase/server";

// Baixar um arquivo enviado: o banco confere se a pessoa pode ver a clínica (RLS) e o link vale um minuto.
export async function GET(_pedido: Request, { params }: RouteContext<"/api/envios/[id]">) {
  const { id } = await params;
  const supabase = await criarCliente();
  const { data } = await supabase.from("envios_arquivos").select("caminho, nome_arquivo").eq("id", id).maybeSingle();
  if (!data) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  const { caminho, nome_arquivo } = data as { caminho: string; nome_arquivo: string };
  const { data: link, error } = await supabase.storage.from("envios").createSignedUrl(caminho, 60, { download: nome_arquivo });
  if (error || !link) return new NextResponse("Não foi possível abrir o arquivo agora.", { status: 502 });
  return NextResponse.redirect(link.signedUrl);
}
