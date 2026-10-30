// Param OS data bridge. Reached only through paramminhas.com/paramos (password gate) or the Vercel-protected deployment.
// Needs AIRTABLE_PAT in the Vercel project's environment variables.
const BASE = "appVRRUkNDx089A4R";
const JOBS = "appuSXKcNmuc3ifVS";
const READ = {
  [BASE]: ["tblGIUtKrOmeYNx8v", "tblHysNjC8p2sO6dy", "tblvXBhpbXEhOWIRo", "tblvkUfJB3qy2cbxt", "tbl7wmOhQvnIyxhQJ"],
  [JOBS]: ["tbl3qL3x492Q88wuL", "tbl0WA0vi8VQY4q6n"],
};
const WRITE = { [BASE]: ["tblGIUtKrOmeYNx8v", "tbl7wmOhQvnIyxhQJ", "tblvkUfJB3qy2cbxt"] };
const NAME_TABLES = [["tblTaXOrOkEUKvhq9", "fldQdvsFMbPN1Z9wg"], ["tbl3qL3x492Q88wuL", "fldAaYPo9GlHMSaoX"]];

const api = (path, init = {}) =>
  fetch(`https://api.airtable.com/v0/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT}`, "Content-Type": "application/json" },
  });

let names = null;
async function nameMap() {
  if (names && Date.now() - names.at < 5 * 60e3) return names.map;
  const map = new Map();
  for (const [t, f] of NAME_TABLES) {
    let offset = "";
    do {
      const r = await api(`${JOBS}/${t}?returnFieldsByFieldId=true&fields%5B%5D=${f}&pageSize=100${offset ? `&offset=${offset}` : ""}`);
      if (!r.ok) break;
      const j = await r.json();
      for (const rec of j.records || []) map.set(rec.id, String((rec.fields || {})[f] ?? ""));
      offset = j.offset || "";
    } while (offset);
  }
  names = { at: Date.now(), map };
  return map;
}

const shape = (rec, nm) => {
  const cv = {};
  for (const [k, v] of Object.entries(rec.fields || {})) {
    cv[k] = nm && Array.isArray(v) && v.length && v.every((x) => typeof x === "string" && /^rec/.test(x))
      ? v.map((id) => ({ id, name: nm.get(id) || id }))
      : v;
  }
  return { id: rec.id, createdTime: rec.createdTime, cellValuesByFieldId: cv };
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!process.env.AIRTABLE_PAT) return res.status(503).json({ error: "not_configured" });
  const { tool, args } = req.body || {};
  const { baseId, tableId } = args || {};
  const writing = tool === "update_records_for_table" || tool === "create_records_for_table";
  if (!((writing ? WRITE : READ)[baseId] || []).includes(tableId)) return res.status(403).json({ error: "forbidden" });

  if (tool === "list_records_for_table") {
    const size = Math.min(Number(args.pageSize) || 100, 1000);
    const out = [];
    let offset = "";
    do {
      const r = await api(`${baseId}/${tableId}?returnFieldsByFieldId=true&pageSize=100${offset ? `&offset=${offset}` : ""}`);
      if (!r.ok) return res.status(502).json({ error: "airtable", status: r.status });
      const j = await r.json();
      out.push(...(j.records || []));
      offset = j.offset || "";
    } while (offset && out.length < size);
    const nm = baseId === JOBS ? await nameMap() : undefined;
    return res.status(200).json({ records: out.slice(0, size).map((r) => shape(r, nm)) });
  }

  if (writing) {
    const recs = Array.isArray(args.records) ? args.records : [];
    const done = [];
    for (let i = 0; i < recs.length; i += 10) {
      const r = await api(`${baseId}/${tableId}`, {
        method: tool === "update_records_for_table" ? "PATCH" : "POST",
        body: JSON.stringify({ typecast: true, returnFieldsByFieldId: true, records: recs.slice(i, i + 10) }),
      });
      if (!r.ok) return res.status(502).json({ error: "airtable", status: r.status });
      done.push(...((await r.json()).records || []));
    }
    return res.status(200).json({ records: done.map((r) => shape(r)) });
  }
  return res.status(400).json({ error: "unsupported" });
};
