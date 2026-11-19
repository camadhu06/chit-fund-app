import { db, resetDatabase } from './db.ts';

await resetDatabase();
const [counts] = await db.query(`
  SELECT (SELECT count(*)::int FROM members)      AS members,
         (SELECT count(*)::int FROM chit_groups)  AS groups,
         (SELECT count(*)::int FROM auctions)     AS auctions,
         (SELECT count(*)::int FROM installments) AS installments,
         (SELECT count(*)::int FROM payments)     AS payments`);
console.log(`Database reset (${db.kind}).`, counts);
process.exit(0);
