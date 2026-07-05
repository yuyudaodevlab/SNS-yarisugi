// 監視対象サイトの定義
// hosts はホスト名の末尾一致で判定する（サブドメイン対応）
export const SITE_DEFS = [
  { id: "x",         name: "X (Twitter)",  kind: "sns",      hosts: ["x.com", "twitter.com"],        emoji: "🐦" },
  { id: "youtube",   name: "YouTube",      kind: "sns",      hosts: ["youtube.com"],                 emoji: "▶️" },
  { id: "instagram", name: "Instagram",    kind: "sns",      hosts: ["instagram.com"],               emoji: "📷" },
  { id: "tiktok",    name: "TikTok",       kind: "sns",      hosts: ["tiktok.com"],                  emoji: "🎵" },
  { id: "booth",     name: "BOOTH",        kind: "shopping", hosts: ["booth.pm"],                    emoji: "🎪" },
  { id: "amazon",    name: "Amazon",       kind: "shopping", hosts: ["amazon.co.jp", "amazon.com"],  emoji: "📦" },
  { id: "rakuten",   name: "楽天市場",      kind: "shopping", hosts: ["rakuten.co.jp"],               emoji: "🛍️" }
];

// URL から監視対象サイトを特定する。対象外なら null
export function matchSite(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const site of SITE_DEFS) {
    for (const h of site.hosts) {
      if (host === h || host.endsWith("." + h)) return site;
    }
  }
  return null;
}
