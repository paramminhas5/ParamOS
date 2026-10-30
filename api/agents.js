// Agent switches. GET -> agents + latest run for each. POST { id, enabled } -> toggles Enabled in the Agents table.
// Agents that read this table at the start of a run stop when switched off (flag "enforced").
const OS = "appVRRUkNDx089A4R", AGENTS = "tblRyl1in8eelz1a3", RUNS = "tblHysNjC8p2sO6dy";
const A = { name: "fldCR5JsAWYmYYapL", lane: "fldgP0q9kWeIwOFQh", trig: "fldqOak4EhBZYXbNE", on: "fldk3odEta2UZtNfM", sched: "fldioSJ13NKxE4YL4", model: "fldjYCCcLLqFK7iP3" };
const RN = { agent: "fldISs8RuhDzR8N08", date: "fldh62EbF7Xulgbyv", result: "fldnrXCkilf5P6qFt", summary: "fldVpxML2Kb3ma1Bx", run: "flduu1JyFZ3ggWRPh" };
// Agents whose prompt checks the Agents table before doing anything.
const ENFORCED = new Set(["CCD curator", "Merman content", "LinkedIn content", "Clout content"]);
const at = (path, init = {}) => fetch(`https://api.airtable.com/v0/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT}`, "Content-Type": "application/json" } });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.AIRTABLE_PAT) return res.status(503).json({ error: "not_configured" });
  try {
    if (req.method === "GET") {
      const [a, r] = await Promise.all([
        at(`${OS}/${AGENTS}?returnFieldsByFieldId=true&pageSize=100`).then((x) => x.json()),
        at(`${OS}/${RUNS}?returnFieldsByFieldId=true&pageSize=60&sort%5B0%5D%5Bfield%5D=${RN.date}&sort%5B0%5D%5Bdirection%5D=desc`).then((x) => x.json()),
      ]);
      const runs = (r.records || []).map((x) => ({ agent: x.fields[RN.agent] || "", date: x.fields[RN.date] || "", result: x.fields[RN.result] || "", summary: x.fields[RN.summary] || "", run: x.fields[RN.run] || "" }));
      const agents = (a.records || []).map((x) => {
        const name = x.fields[A.name] || "";
        const last = runs.find((q) => q.agent && (name.toLowerCase().includes(q.agent.toLowerCase()) || q.agent.toLowerCase().includes(name.toLowerCase())));
        return { id: x.id, name, lane: x.fields[A.lane] || "", trigger: x.fields[A.trig] || "", enabled: !!x.fields[A.on], schedule: x.fields[A.sched] || "", model: x.fields[A.model] || "", enforced: ENFORCED.has(name), last: last || null };
      });
      return res.status(200).json({ agents, recent: runs.slice(0, 12) });
    }
    if (req.method === "POST") {
      const { id, enabled } = req.body || {};
      if (!/^rec[A-Za-z0-9]{14}$/.test(String(id)) || typeof enabled !== "boolean") return res.status(400).json({ error: "bad_request" });
      const r = await at(`${OS}/${AGENTS}/${id}`, { method: "PATCH", body: JSON.stringify({ fields: { [A.on]: enabled } }) });
      if (!r.ok) throw new Error(`airtable write ${r.status}`);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "method" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
