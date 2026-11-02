/**
 * URL canônica: base da deduplicação de vagas.
 *
 * Inspirado em normalizeUrl() de url-key.mjs do Career Ops (lista de parâmetros
 * de rastreamento, https forçado, ordenação de parâmetros, barra final).
 * Copyright (c) 2026 Santiago Fernández de Valderrama — MIT License.
 * Veja THIRD_PARTY_NOTICES.md.
 *
 * Só normaliza o texto da URL: nenhuma requisição é feita.
 */

/** Parâmetros que identificam clique/campanha, nunca a vaga. Lista literal e conservadora. */
const TRACKING_PARAMS: RegExp[] = [
  /^utm_/i, /^gclid$/i, /^fbclid$/i, /^gh_src$/i, /^mc_cid$/i, /^mc_eid$/i, /^igshid$/i,
  /^_hsenc$/i, /^_hsmi$/i, /^trk/i, /^tracking/i, /^ref$/i, /^ref_?src$/i, /^refid$/i,
  /^source$/i, /^src$/i, /^lipi$/i, /^midtoken$/i, /^midsig$/i, /^ebp$/i, /^originalsubdomain$/i,
  /^jobboardsource$/i, /^msclkid$/i, /^yclid$/i, /^li_fat_id$/i, /^sessionid$/i,
];

export function canonicalUrl(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.port = "";
  url.hash = "";
  let host = url.hostname.toLowerCase().replace(/\.$/, "");
  host = host.replace(/^www\./, "");
  // br.linkedin.com, pt.linkedin.com… são a mesma vaga
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) host = "www.linkedin.com";
  url.hostname = host;

  const kept = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAMS.some((re) => re.test(key)));
  kept.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1));
  url.search = "";
  for (const [k, v] of kept) url.searchParams.append(k, v);

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  const out = url.toString();
  // "https://exemplo.com/" e "https://exemplo.com" são a mesma coisa
  return out.endsWith("/") && url.pathname === "/" && !url.search ? out.slice(0, -1) : out;
}
