// Tira o texto de um PDF com a posição de cada pedaço, usando o pdf.js (o mesmo leitor de PDF do Firefox).
// Roda no navegador: o arquivo não sai do computador. A leitura dos campos fica em notas-pdf.ts.

import type { PaginaPdf } from "./notas-pdf";

// O pedaço do pdf.js que usamos. O módulo é passado de fora: no navegador, o build normal (carregado só quando
// alguém escolhe um PDF); nos testes, o build "legacy" para Node.
type PdfJs = {
  getDocument: (p: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean; disableFontFace?: boolean; verbosity?: number }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getViewport: (p: { scale: number }) => { width: number; height: number; transform: number[] };
        getTextContent: () => Promise<{ items: unknown[] }>;
      }>;
    }>;
    destroy: () => Promise<void>;
  };
  Util: { transform: (a: number[], b: number[]) => number[] };
};

const MAX_PAGINAS = 10;

// No navegador: o pdf.js só é baixado quando alguém escolhe um PDF, e o worker dele lê o arquivo fora da tela.
export async function carregarPdfJs(): Promise<PdfJs> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs as unknown as PdfJs;
}

export async function paginasDoPdf(pdfjs: PdfJs, dados: ArrayBuffer | Uint8Array): Promise<PaginaPdf[]> {
  const tarefa = pdfjs.getDocument({ data: dados instanceof Uint8Array ? dados : new Uint8Array(dados), isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  try {
    const doc = await tarefa.promise;
    const paginas: PaginaPdf[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
      const pagina = await doc.getPage(n);
      const vista = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      const textos: PaginaPdf["textos"] = [];
      for (const bruto of conteudo.items) {
        const item = bruto as { str?: string; transform?: number[]; width?: number; height?: number };
        if (!item.str?.trim() || !item.transform) continue;
        const t = pdfjs.Util.transform(vista.transform, item.transform);
        textos.push({ texto: item.str, x: t[4], y: t[5], largura: item.width ?? 0, altura: item.height || Math.hypot(t[2], t[3]) });
      }
      paginas.push({ largura: vista.width, altura: vista.height, textos });
    }
    return paginas;
  } finally {
    await tarefa.destroy();
  }
}
