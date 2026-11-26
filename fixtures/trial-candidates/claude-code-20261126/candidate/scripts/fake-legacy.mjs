// Double de l'API interne de legacy-app (InternalApiServlet + DossierService),
// pour développer et tester sans Tomcat. Usage : npm run dev:legacy
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const LABEL_LOCK = { BROUILLON: [false, false], EN_INSTRUCTION: [true, false], REMIS: [true, true] };

export function createFakeLegacy(dossiers, today = '2025-11-01') {
  const data = dossiers.map(d => ({ submittedOn: null, ...d }));
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json;charset=UTF-8' });
    res.end(JSON.stringify(body));
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = /^\/api\/dossiers(?:\/([^/]+)(\/remise)?)?$/.exec(url.pathname);
    if (!m) return json(res, 404, { error: 'Unknown endpoint' });
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const q = k => url.searchParams.get(k) || null;
      if (req.method === 'GET' && !m[1]) {
        const iso = v => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
        const [n, a, s, f, t] = [q('number'), q('applicant'), q('status'), iso(q('filedFrom')), iso(q('filedTo'))];
        const found = data.filter(d => (!n || d.number === n) && (!a || d.applicant.toLowerCase().includes(a.toLowerCase()))
          && (!s || !LABEL_LOCK[s] || d.status === s) && (!f || d.filedOn >= f) && (!t || d.filedOn <= t));
        return json(res, 200, { dossiers: found.sort((x, y) => x.number.localeCompare(y.number)) });
      }
      const d = data.find(x => x.number === decodeURIComponent(m[1] ?? ''));
      if (!d) return json(res, 404, { error: `Unknown dossier ${m[1]}` });
      if (req.method === 'GET' && !m[2]) return json(res, 200, d);
      if (req.method === 'PUT' && !m[2]) {
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: 'Body is not JSON' }); }
        if (typeof body?.applicant !== 'string' || typeof body?.subject !== 'string') return json(res, 400, { error: 'Bad body' });
        const [aLocked, sLocked] = LABEL_LOCK[d.status];
        if ((aLocked && d.applicant !== body.applicant) || (sLocked && d.subject !== body.subject)) return json(res, 409, { error: 'locked' });
        d.applicant = body.applicant; d.subject = body.subject;
        return json(res, 200, d);
      }
      if (req.method === 'POST' && m[2]) {
        if (d.status !== 'EN_INSTRUCTION') return json(res, 409, { error: 'refused' });
        d.status = 'REMIS'; d.submittedOn = today;
        return json(res, 200, d);
      }
      return json(res, 405, { error: 'Method not allowed' });
    });
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.env.DATASET ?? fileURLToPath(new URL('../../legacy-app/src/main/resources/dossiers.json', import.meta.url));
  const port = Number(process.env.PORT ?? 8081);
  createFakeLegacy(JSON.parse(readFileSync(file, 'utf8')).dossiers, process.env.FROZEN_DATE ?? '2025-11-01')
    .listen(port, () => console.log(`Faux legacy sur ${port}`));
}
