// Cats Can Dance live panel: site health plus recent GitHub activity. Public data only, no tokens.
const SITE = "https://catscandance.com";
const PAGES = ["/", "/pets", "/artists", "/events", "/school"];
const REPOS = ["paramminhas5/CatsCanDanceOct2026", "paramminhas5/CCDWORKING"];
const get = (url, ms = 9000) => fetch(url, { headers: { "User-Agent": "paramos", Accept: "application/vnd.github+json" }, redirect: "follow", signal: AbortSignal.timeout(ms) });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const pages = await Promise.all(PAGES.map(async (p) => {
    const t = Date.now();
    try { const r = await get(SITE + p); return { path: p, status: r.status, ms: Date.now() - t }; } catch (e) { return { path: p, status: 0, ms: Date.now() - t }; }
  }));
  let homeHtml = "";
  try { homeHtml = await (await get(SITE + "/")).text(); } catch (_) {}
  const staleDate = /Jun(e)? 28,? 2026/i.test(homeHtml);
  const repos = await Promise.all(REPOS.map(async (repo) => {
    const out = { repo, commits: [], prs: [], error: "" };
    try {
      const c = await get(`https://api.github.com/repos/${repo}/commits?per_page=6`);
      if (c.ok) out.commits = (await c.json()).map((x) => ({ sha: x.sha.slice(0, 7), msg: String(x.commit.message).split("\n")[0].slice(0, 120), date: x.commit.author && x.commit.author.date, url: x.html_url }));
      else out.error = c.status === 404 ? "private or not found" : `github ${c.status}`;
      const p = await get(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=6`);
      if (p.ok) out.prs = (await p.json()).map((x) => ({ n: x.number, title: x.title, url: x.html_url, date: x.created_at }));
    } catch (e) { out.error = String(e.message || e); }
    return out;
  }));
  return res.status(200).json({ site: SITE, pages, staleDate, repos, checked: new Date().toISOString() });
};
