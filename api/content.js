// Content station data bridge. Reached only through the password gate at /paramos/api/content.
// GET  -> { content: [...], research: [...] }
// POST -> { action: save | status | pick | drop | idea, ... }
const OS = "appVRRUkNDx089A4R", CONTENT = "tbl79ES1w2qJD6mDZ", RESEARCH = "tblJpnTebaPgm8u9h";
const C = { piece: "fld1r4gU3iFaYAeEh", channel: "fld16Xo0XIrJnOPPV", format: "fldFeTuKXl2jVDfK2", status: "fld8TkV0Qb1taR1KO", postOn: "fld8aLS6mwG5qdBzP",
  why: "fldtHxuwYiE9pitCI", research: "fldu9MSEEMLEdoBJn", sources: "fldHp1BBfLuW3L8Nh", questions: "fldqTOP1zaEE0aibB", notes: "fldYhe7JUuoT1vEjL",
  draft: "fldrk5VoUiP6fiGzP", edit: "fldRCBSSfiDqsENyI", image: "fldPYdqzhuZg9syn8", account: "fldHvzNrIZAwrobag", posted: "fldhvAoW6b789l5To", learned: "fldi0u7NST38AAxfO" };
const R = { item: "flddhywIVGrrTuBhV", channel: "fldVNNkidpeLaC2t4", source: "fldFLH0otK5OUXzq6", url: "fldW7dPYLbk4QpRi5", pub: "fldaDojL4YicGtKvz",
  summary: "fldhmAsPURyfO8Dc7", score: "fldTdL8XKQSFWlPBO", status: "fld3jZYBc6LX5nSzo", found: "fldsQcZifCe4eUpl1" };
const SAVE_FIELDS = { notes: C.notes, edit: C.edit, image: C.image, account: C.account, postOn: C.postOn };
const STATUS_OK = ["Needs your notes", "Drafted", "Needs approval", "Approved", "Skipped", "Idea"];
const CHANNELS = ["CCD Instagram", "Merman Instagram", "LinkedIn"];
const RCHANNELS = ["CCD", "Merman", "LinkedIn"];

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const at = (path, init = {}) => fetch(`https://api.airtable.com/v0/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT}`, "Content-Type": "application/json" } });

async function all(table, qs) {
  const out = [];
  let offset = "";
  do {
    const r = await at(`${OS}/${table}?${qs}&returnFieldsByFieldId=true&pageSize=100${offset ? `&offset=${offset}` : ""}`);
    if (!r.ok) throw new Error(`airtable ${r.status}`);
    const j = await r.json();
    out.push(...j.records);
    offset = j.offset || "";
  } while (offset && out.length < 500);
  return out;
}
const flat = (rec, map) => { const o = { id: rec.id }; for (const [k, f] of Object.entries(map)) o[k] = rec.fields[f] ?? ""; return o; };
async function patch(table, id, fields) {
  const r = await at(`${OS}/${table}/${id}`, { method: "PATCH", body: JSON.stringify({ typecast: true, fields }) });
  if (!r.ok) throw new Error(`airtable write ${r.status}`);
  return r.json();
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.AIRTABLE_PAT) return res.status(503).json({ error: "not_configured" });
  try {
    if (req.method === "GET") {
      const [content, research] = await Promise.all([
        all(CONTENT, "sort%5B0%5D%5Bfield%5D=" + C.postOn),
        all(RESEARCH, `filterByFormula=${encodeURIComponent("{Status}='New'")}&sort%5B0%5D%5Bfield%5D=${R.score}&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=80`),
      ]);
      return res.status(200).json({
        content: content.map((r) => flat(r, C)).filter((x) => x.piece),
        research: research.map((r) => flat(r, R)),
        now: new Date().toISOString(),
      });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const b = req.body || {};
    const id = String(b.id || "");
    if (b.action === "idea") {
      const text = String(b.text || "").trim().slice(0, 4000);
      if (!text || !RCHANNELS.includes(b.channel)) return res.status(400).json({ error: "bad_idea" });
      const r = await at(`${OS}/${RESEARCH}`, { method: "POST", body: JSON.stringify({ typecast: true, fields: {
        [R.item]: text.split("\n")[0].slice(0, 120), [R.channel]: b.channel, [R.source]: "Param", [R.summary]: text, [R.score]: 99, [R.status]: "New", [R.found]: today() } }) });
      if (!r.ok) throw new Error(`airtable write ${r.status}`);
      return res.status(200).json({ ok: true });
    }
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: "bad_id" });
    if (b.action === "pick") { await patch(RESEARCH, id, { [R.score]: 90 }); return res.status(200).json({ ok: true }); }
    if (b.action === "drop") { await patch(RESEARCH, id, { [R.status]: "Dropped" }); return res.status(200).json({ ok: true }); }
    if (b.action === "save" || b.action === "status") {
      const fields = {};
      for (const [k, f] of Object.entries(SAVE_FIELDS)) if (k in (b.fields || {})) fields[f] = String(b.fields[k] ?? "").slice(0, 10000) || null;
      if (b.action === "status") {
        if (!STATUS_OK.includes(b.status)) return res.status(400).json({ error: "bad_status" });
        if (b.status === "Approved") {
          const cur = await (await at(`${OS}/${CONTENT}/${id}?returnFieldsByFieldId=true`)).json();
          const f = cur.fields || {};
          const ch = f[C.channel];
          const image = "image" in (b.fields || {}) ? b.fields.image : f[C.image];
          const account = "account" in (b.fields || {}) ? b.fields.account : f[C.account];
          if (!(f[C.draft] || f[C.edit] || (b.fields || {}).edit)) return res.status(400).json({ error: "needs_draft" });
          if (/Instagram/.test(ch || "") && !(image && account)) return res.status(400).json({ error: "needs_image_and_account" });
        }
        fields[C.status] = b.status;
      }
      if (!Object.keys(fields).length) return res.status(400).json({ error: "nothing" });
      await patch(CONTENT, id, fields);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "unknown_action" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};
