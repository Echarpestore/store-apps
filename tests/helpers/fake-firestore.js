// Firestore وهمي صغير في الذاكرة — get/set(merge)/update/runTransaction. للاختبارات بس.
'use strict';
function makeDb(seed){
  const store = JSON.parse(JSON.stringify(seed || {}));   // { 'col/id': {…} }
  const log = { reads:[], writes:[] };
  const ref = (col, id) => {
    const key = col + '/' + id;
    return {
      id, path: key,
      get: async () => { log.reads.push(key); const d = store[key]; return { exists: d !== undefined, data: () => (d === undefined ? undefined : JSON.parse(JSON.stringify(d))) }; },
      set: async (data, opt) => { log.writes.push(key); store[key] = (opt && opt.merge) ? Object.assign({}, store[key] || {}, data) : JSON.parse(JSON.stringify(data)); },
      update: async (data) => { if(store[key] === undefined) throw new Error('NOT_FOUND ' + key); log.writes.push(key); store[key] = Object.assign({}, store[key], data); }
    };
  };
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, String(id)) }),
    runTransaction: async (fn) => {
      const pending = []; let wrote = false;
      const tx = {
        get: async (r) => { if(wrote) throw new Error('READ_AFTER_WRITE ' + r.path); return r.get(); },   // نفس قاعدة Firestore الحقيقية
        set: (r, d, o) => { wrote = true; pending.push(() => r.set(d, o)); },
        update: (r, d) => { wrote = true; pending.push(() => r.update(d)); }
      };
      const out = await fn(tx);
      for(const p of pending) await p();
      return out;
    },
    _store: store, _log: log
  };
  return db;
}
module.exports = { makeDb };
