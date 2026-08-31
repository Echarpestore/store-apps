const fs = require('fs');
const assert = require('assert');
const office = fs.readFileSync('Office/office.js','utf8');
const rules = fs.readFileSync('security/firestore-phase2.rules','utf8');
const sw = fs.readFileSync('Office/sw.js','utf8');

function ok(v,msg){ assert(v,msg); console.log('✓',msg); }
ok(office.includes("const OF_ACT_ARCHIVE_COLLECTION = 'pos_activity_archive'"),'v414 archive collection is configured');
ok(office.includes("const OF_ACT_ARCHIVE_CATALOG_TTL_MS = 24 * 60 * 60 * 1000"),'catalog is cached locally for 24h');
ok(office.includes('OF_ACT_ARCHIVE_TARGET_BYTES = 650 * 1024'),'archive chunks stay safely below Firestore document limit');
ok(office.includes('async function ofActHydrateArchives(sinceTs)'),'new devices can hydrate history from archive');
ok(office.includes('async function ofActPublishClosedArchives()'),'closed months are archived from local IndexedDB');
ok(office.includes("doc(OF_ACT_ARCHIVE_CATALOG_ID)"),'single archive catalog document is used');
ok(office.includes("archiveMonthsLoaded"),'downloaded archive months are remembered locally');
ok(office.includes("archivePublished"),'published archive months are remembered locally');
ok(office.includes("completeFromTs:0"),'complete-history marker exists for full-history cache');
ok(office.indexOf('completeFromTs:0') > office.indexOf('for(const month of Object.keys(byMonth).sort())'),'complete marker is only written after month publishing loop');
ok(office.includes('OF_ACT_SYNC_OVERLAP_MS = 2 * 60 * 60 * 1000'),'incremental overlap reduced from 24h to 2h');
ok(office.includes('ofActPublishClosedArchives().catch'),'archive publishing is fire-and-forget and does not block activity UI');
ok(rules.includes('match /pos_activity_archive/{id}'),'full Firestore rules include activity archive collection');
ok(rules.includes('allow read, create, update: if isStaff();'),'activity archive is staff-only');
ok(sw.includes("echarpe-office-v67"),'Office service worker cache bumped to v67');
console.log('v414 activity archive tests passed');
