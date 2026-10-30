// Free daily content scan. No AI. Gathers raw research into the Param OS "Research" table:
//  CCD: music news feeds, scored for India / labels / releases / events
//  Merman: today's talk prompts and project facts from Merman OS state.json
//  LinkedIn (Mondays): job search numbers from the Job Search base
// Agents later pick the best items and do the deep research and drafting.
const OS = "appVRRUkNDx089A4R", JOBS = "appuSXKcNmuc3ifVS", RESEARCH = "tblJpnTebaPgm8u9h", RUNS = "tblHysNjC8p2sO6dy";
const F = { item: "flddhywIVGrrTuBhV", channel: "fldVNNkidpeLaC2t4", source: "fldFLH0otK5OUXzq6", url: "fldW7dPYLbk4QpRi5",
  pub: "fldaDojL4YicGtKvz", summary: "fldhmAsPURyfO8Dc7", score: "fldTdL8XKQSFWlPBO", status: "fld3jZYBc6LX5nSzo", found: "fldsQcZifCe4eUpl1" };

const gn = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:4d")}&hl=en-IN&gl=IN&ceid=IN:en`;
// [name, url, bonus]. Google News searches are India-specific, so they start with a bonus.
const FEEDS = [
  ["Mixmag", "https://mixmag.net/rss.xml", 0],
  ["DJ Mag", "https://djmag.com/rss.xml", 0],
  ["Pitchfork", "https://pitchfork.com/feed/feed-news/rss", 0],
  ["Bandcamp Daily", "https://daily.bandcamp.com/feed", 0],
  ["News: electronic music India", gn("electronic music India"), 4],
  ["News: club nights in Indian cities", gn("techno OR house OR disco club night Bengaluru OR Mumbai OR Delhi OR Goa OR Pune"), 4],
  ["News: DJs touring India", gn("DJ tour India 2027 OR \"India debut\" DJ"), 4],
  ["News: India festivals", gn("India music festival lineup electronic"), 4],
  ["News: independent labels and collectives", gn("independent label OR collective India electronic music"), 4],
];
const INDIA = /india|bengaluru|bangalore|mumbai|delhi|goa|pune|hyderabad|kolkata|chennai|indian|sunburn|nh7|magnetic fields|echoes of earth|dekmantel|boiler room india/i;
const ASIA = /asia|south asia|dubai|singapore|bali|tokyo|seoul|mumbai/i;
const SCENE = /label|imprint|debut|ep\b|album|compilation|lineup|line-up|festival|tour|residency|club|collective|first release|signs to|launch/i;
const SKIP = /\b(trump|election|obituary|lawsuit|dies|dead)\b/i;

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const at = (path, init = {}) => fetch(`https://api.airtable.com/v0/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT}`, "Content-Type": "application/json" } });

async function existingUrls() {
  const seen = new Set();
  let offset = "";
  do {
    const q = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true", "sort[0][field]": F.found, "sort[0][direction]": "desc" });
    q.append("fields[]", F.url); q.append("fields[]", F.item); q.append("fields[]", F.found);
    if (offset) q.set("offset", offset);
    const r = await at(`${OS}/${RESEARCH}?${q}`);
    if (!r.ok) throw new Error(`airtable ${r.status}`);
    const j = await r.json();
    j.records.forEach((x) => { if (x.fields[F.url]) seen.add(x.fields[F.url]); if (x.fields[F.item]) seen.add(x.fields[F.item]); });
    offset = j.offset || "";
    if (seen.size > 600) break;
  } while (offset);
  return seen;
}
async function create(base, table, rows) {
  for (let i = 0; i < rows.length; i += 10) {
    const r = await at(`${base}/${table}`, { method: "POST", body: JSON.stringify({ typecast: true, records: rows.slice(i, i + 10).map((fields) => ({ fields })) }) });
    if (!r.ok) throw new Error(`airtable write ${r.status}`);
  }
}
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const strip = (s) => decode(String(s || "")).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? strip(m[1]) : ""; };

async function readFeed([name, url, bonus]) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 paramos" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(String(r.status));
  const xml = await r.text();
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 25).map((b) => {
    const link = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || tag(b, "link");
    const d = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated");
    const date = d ? new Date(d) : null;
    return { bonus, source: name, title: tag(b, "title"), url: link, summary: (tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 600), date: date && !isNaN(date) ? date : null };
  }).filter((x) => x.title && x.url);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.AIRTABLE_PAT) return res.status(503).json({ error: "not_configured" });
  try {
    const D = today();
    const seen = await existingUrls();
    const rows = [];
    const feedStatus = {};
    const results = await Promise.allSettled(FEEDS.map(readFeed));
    results.forEach((r, i) => {
      const name = FEEDS[i][0];
      if (r.status !== "fulfilled") { feedStatus[name] = "failed " + (r.reason && r.reason.message); return; }
      feedStatus[name] = r.value.length;
      for (const it of r.value) {
        if (seen.has(it.url) || seen.has(it.title)) continue;
        if (it.date && Date.now() - it.date.getTime() > 4 * 86400e3) continue;
        if (SKIP.test(it.title)) continue;
        const text = it.title + " " + it.summary;
        let score = it.bonus || 0;
        if (INDIA.test(text)) score += 5;
        else if (ASIA.test(text)) score += 2;
        if (SCENE.test(text)) score += 2;
        if (score < 4) continue;
        seen.add(it.url);
        rows.push({ [F.item]: it.title.slice(0, 250), [F.channel]: "CCD", [F.source]: it.source, [F.url]: it.url,
          ...(it.date ? { [F.pub]: it.date.toISOString().slice(0, 10) } : {}), [F.summary]: it.summary, [F.score]: score, [F.status]: "New", [F.found]: D });
      }
    });

    // Merman: today's talk prompts and project facts from Merman OS
    try {
      const m = await (await fetch("https://raw.githubusercontent.com/paramminhas5/ParamOS/main/mermanos/state.json", { signal: AbortSignal.timeout(10000) })).json();
      const h = m.headline || {};
      const key = `Merman journey ${m.date || D}`;
      if (!seen.has(key)) {
        const talk = ((m.today || {}).talk || []).map((t) => `- ${t.prompt}`).join("\n");
        const listen = ((m.today || {}).listen || []).slice(0, 3).map((l) => `- ${l.artist}, ${l.release} (${l.label || "?"}): ${l.why || ""}`).join("\n");
        rows.push({ [F.item]: key, [F.channel]: "Merman", [F.source]: "Merman OS", [F.url]: "https://www.paramminhas.com/mermanos", [F.pub]: m.date || D, [F.score]: 5, [F.status]: "New", [F.found]: D,
          [F.summary]: `Latest project: ${h.latest_project || "?"} at ${h.latest_bpm || "?"} bpm. Days since last session: ${h.days_since_last_session}. Sets touched in 30 days: ${h.sets_touched_30d}. Finds waiting: ${h.finds_waiting}.\n\nQuestions Merman OS is asking:\n${talk}\n\nToday's finds:\n${listen}` });
      }
    } catch (e) { feedStatus["Merman OS"] = "failed " + e.message; }

    // LinkedIn: Mondays only, job search numbers
    if (new Date(Date.now() + 5.5 * 3600e3).getUTCDay() === 1) {
      try {
        const count = async (table, field, value) => {
          const q = new URLSearchParams({ filterByFormula: `{${field}}='${value}'`, returnFieldsByFieldId: "true", pageSize: "100" });
          const r = await at(`${JOBS}/${table}?${q}`); const j = await r.json(); return (j.records || []).length;
        };
        const [newRoles, sent, replied, drafted] = await Promise.all([
          count("tblCc5nyiCoFLiny8", "Status", "New"), count("tbl0xzPpnqxxYu10m", "Status", "Sent"),
          count("tbl0xzPpnqxxYu10m", "Status", "Replied"), count("tbl0xzPpnqxxYu10m", "Status", "Drafted")]);
        const key = `Job search week ${D}`;
        if (!seen.has(key)) rows.push({ [F.item]: key, [F.channel]: "LinkedIn", [F.source]: "Job Search 2026", [F.score]: 5, [F.status]: "New", [F.found]: D,
          [F.summary]: `New roles waiting: ${newRoles}. Outreach drafted: ${drafted}, sent: ${sent}, replied: ${replied}. Raw numbers only. Param decides what is worth saying.` });
      } catch (e) { feedStatus["Job Search"] = "failed " + e.message; }
    }

    rows.sort((a, b) => b[F.score] - a[F.score]);
    const keep = rows.filter((r) => r[F.channel] !== "CCD").concat(rows.filter((r) => r[F.channel] === "CCD").slice(0, 25));
    rows.length = 0; rows.push(...keep);
    if (rows.length) await create(OS, RESEARCH, rows);
    const byCh = rows.reduce((a, r) => { a[r[F.channel]] = (a[r[F.channel]] || 0) + 1; return a; }, {});
    const summary = `${rows.length} new research items (${Object.entries(byCh).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}). Feeds: ${Object.entries(feedStatus).map(([k, v]) => `${k} ${v}`).join("; ")}`;
    await create(OS, RUNS, [{ flduu1JyFZ3ggWRPh: `Content scan ${D}`, fldISs8RuhDzR8N08: "Content scan", fldh62EbF7Xulgbyv: D,
      fldnrXCkilf5P6qFt: Object.values(feedStatus).every((v) => typeof v === "number") ? "OK" : "Partial", fldVpxML2Kb3ma1Bx: summary, fldufc72HU9gacx7B: rows.length }]);
    return res.status(200).json({ ok: true, new: rows.length, feeds: feedStatus });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
