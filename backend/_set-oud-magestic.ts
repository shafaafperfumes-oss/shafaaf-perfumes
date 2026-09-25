/** Scratch: Oud Magestic now has both bottles — point each form at its own. */
import { sql } from "drizzle-orm";
import { closeDatabase, getDb } from "./src/db/client.js";

const db = getDb();
const PERFUME = "images/oud-magestic-perfume.webp";
const ATTAR = "images/oud-magestic-attar.webp";

await db.execute(sql`
  update products set hero_image_url = ${PERFUME}, updated_at = now()
  where slug = 'oud-magestic'
`);

for (const [form, url] of [["perfume", PERFUME], ["attar", ATTAR]] as const) {
  const done = await db.execute(sql`
    update product_variants pv
    set image_url = ${url}, updated_at = now()
    from products p
    where p.id = pv.product_id and p.slug = 'oud-magestic' and pv.variant_type = ${form}
    returning pv.size_label
  `);
  console.log(`oud-magestic ${form}: ${done.length} sizes -> ${url}`);
}

console.log(
  "check:",
  await db.execute(sql`
    select p.name, pv.variant_type, coalesce(pv.image_url, p.hero_image_url) as shows
    from product_variants pv join products p on p.id = pv.product_id
    where p.slug = 'oud-magestic'
    group by p.name, pv.variant_type, pv.image_url, p.hero_image_url
    order by pv.variant_type
  `),
);

await closeDatabase();
