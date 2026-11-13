// Limpa o endereço antes de mandar ao Vercel Analytics.
// Só o caminho da página vai: tiramos parâmetros (?busca=..., ?code=..., filtros)
// e o trecho depois de "#", e trocamos ids (uuid) por ":id". Assim nenhum dado
// de cliente, termo pesquisado ou código de login sai do Axis.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function limparUrlAnalytics(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(UUID, ":id")}`;
  } catch {
    return url.split(/[?#]/)[0].replace(UUID, ":id");
  }
}
