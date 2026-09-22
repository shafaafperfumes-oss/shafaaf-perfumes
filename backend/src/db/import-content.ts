import "dotenv/config";
import fs from "node:fs";
import { z } from "zod";
import { closeDatabase, getDb } from "./client.js";
import { CONTENT_KINDS, CONTENT_PLATFORMS, products } from "./schema/index.js";
import { importAgentDrafts } from "../repositories/content.repository.js";

/**
 * Loads the Content agent's drafts into the admin's Content tab:
 *
 *   npm run content:import -- ../.claude/team/content/2026-09-21-drafts.json
 *
 * The file is a JSON array of drafts (see `.claude/agents/content-agent.md`
 * for the shape). This is the only road from the agent to the database:
 * the agent writes a file, a human runs this on a machine that holds the
 * database credentials, and every row lands as a `draft` that still needs
 * the owner's approval. A draft whose `key` was imported before is skipped,
 * so re-running on the same file changes nothing.
 */

const draftSchema = z
  .object({
    key: z.string().trim().min(3).max(120),
    platform: z.enum(CONTENT_PLATFORMS),
    kind: z.enum(CONTENT_KINDS).optional(),
    title: z.string().trim().min(1).max(160),
    caption: z.string().trim().min(1).max(4000),
    hashtags: z.string().trim().max(1000).optional(),
    imageUrl: z.string().trim().max(500).nullable().optional(),
    productSlug: z.string().trim().max(120).nullable().optional(),
    agentNote: z.string().trim().max(2000).nullable().optional(),
    scheduledFor: z.coerce.date().nullable().optional(),
  })
  .strict();

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("Usage: npm run content:import -- <drafts.json>");
  process.exit(1);
}

const parsed = z.array(draftSchema).min(1).max(200).safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
if (!parsed.success) {
  console.error("The drafts file is not in the expected shape:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  process.exit(1);
}
const drafts = parsed.data;

// Forbidden words: the brand sells "inspired by" fragrances and never claims
// to copy anyone. A draft that slips is refused here, before the owner sees it.
const banned = /\b(replica|duplicate|copy of|clone|99\s*%|first copy|original quality)\b/i;
const offenders = drafts.filter((d) => banned.test(`${d.caption} ${d.hashtags ?? ""} ${d.title}`));
if (offenders.length) {
  console.error("Refusing drafts that use words the brand does not use (replica / duplicate / 99% …):");
  for (const d of offenders) console.error(`  ${d.key}`);
  process.exit(1);
}

// A draft may name a product only if that product exists — a typo here would
// send the owner to a dead link.
const slugs = new Set((await getDb().select({ slug: products.slug }).from(products)).map((p) => p.slug));
const unknown = drafts.filter((d) => d.productSlug && !slugs.has(d.productSlug));
if (unknown.length) {
  console.error("These drafts name a product slug that does not exist:");
  for (const d of unknown) console.error(`  ${d.key} → ${d.productSlug}`);
  process.exit(1);
}

const result = await importAgentDrafts(drafts.map(({ key, ...rest }) => ({ agentKey: key, ...rest })));
console.log(`Content drafts: ${drafts.length} read, ${result.inserted} added, ${result.skipped} already imported.`);
await closeDatabase();
