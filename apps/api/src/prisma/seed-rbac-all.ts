import { seedRbac } from '../rbac/seed.js';
import { db } from './db.js';

const organizations = await db.orm.public.Organization.all();

for (const org of organizations) {
  console.log(`Seeding RBAC for organization ${org.id} (${org.name})...`);
  await seedRbac(org.id);
}

console.log(`Done: ${organizations.length} organization(s) seeded.`);
process.exit(0);