import { and, asc, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  cartItems,
  carts,
  contentPosts,
  fragranceQueries,
  inspiredFragrances,
  inventory,
  orderItems,
  orders,
  products,
  productVariants,
  profiles,
  VARIANT_TYPE_LABEL,
  wishlists,
} from "../db/schema/index.js";

/**
 * WEEKLY NUMBERS FOR THE ANALYTICS AGENT
 * ---------------------------------------------------------------
 * Read-only. Builds one plain object the owner's machine writes to
 * `.claude/team/data/<date>-analytics.json` (`npm run analytics:export`),
 * which is the only thing the Analytics agent is allowed to read. That is
 * the whole "AI gets no database access" rule again: the database is
 * queried here, by the owner's own backend, and the agent sees a file.
 *
 * What is deliberately NOT in the file: any customer's name, phone, email
 * or address; order numbers; user ids; anything from the supplier price
 * list. Selling prices and product names are public already.
 *
 * "This week" is the last 7 days ending now, "last week" the 7 before —
 * rolling windows, so the export gives the same shape on any day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Orders that count as sales: money has arrived. */
const SOLD_STATUSES = ["paid", "shipped", "delivered"] as const;
const TOP_N = 5;

export interface Window {
  from: string;
  to: string;
}

export interface OrderTotals {
  placed: number;
  pendingPayment: number;
  paid: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  /** Sum of `total` over paid+shipped+delivered orders placed in the window. */
  revenueRupees: number;
  averageOrderRupees: number;
}

export interface SoldLine {
  product: string;
  variant: string;
  units: number;
  revenueRupees: number;
}

export interface StockLine {
  product: string;
  form: string;
  size: string;
  sellable: number;
  threshold: number;
}

export interface WeeklyAnalytics {
  generatedAt: string;
  windows: { thisWeek: Window; lastWeek: Window; last30Days: Window };
  orders: { thisWeek: OrderTotals; lastWeek: OrderTotals; last30Days: OrderTotals };
  bestSellers: { thisWeek: SoldLine[]; last30Days: SoldLine[] };
  stock: { totalVariants: number; outOfStock: StockLine[]; lowStock: StockLine[] };
  customers: { newThisWeek: number; newLastWeek: number; total: number };
  carts: { openLast7Days: number; unitsInThem: number };
  wishlist: { top: Array<{ product: string; saves: number }> };
  customPage: {
    searchesThisWeek: number;
    searchesLastWeek: number;
    topQueries: Array<{ query: string; searches: number; matches: number }>;
    noMatchQueries: Array<{ query: string; searches: number }>;
    listedFragrances: number;
    availableFragrances: number;
  };
  content: {
    byStatus: { draft: number; approved: number; rejected: number; published: number };
    publishedThisWeek: number;
    approvedWaitingForTime: number;
    failed: Array<{ title: string; platform: string; attempts: number; lastError: string | null }>;
    rejectedLast30Days: Array<{ title: string; platform: string; ownerNote: string | null }>;
  };
  catalog: { activeProducts: number; productsWithoutPhoto: string[] };
}

const rupees = (paise: number | string | null | undefined): number => Math.round(Number(paise ?? 0)) / 100;

async function orderTotals(from: Date, to: Date): Promise<OrderTotals> {
  const db = getDb();
  const rows = await db
    .select({
      status: orders.status,
      n: count(),
      total: sql<string>`coalesce(sum(${orders.totalPaise}), 0)`,
    })
    .from(orders)
    .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to)))
    .groupBy(orders.status);

  const totals: OrderTotals = {
    placed: 0,
    pendingPayment: 0,
    paid: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    revenueRupees: 0,
    averageOrderRupees: 0,
  };
  let soldCount = 0;
  let soldPaise = 0;
  for (const row of rows) {
    totals.placed += row.n;
    if (row.status === "pending_payment") totals.pendingPayment = row.n;
    if (row.status === "paid") totals.paid = row.n;
    if (row.status === "shipped") totals.shipped = row.n;
    if (row.status === "delivered") totals.delivered = row.n;
    if (row.status === "cancelled") totals.cancelled = row.n;
    if ((SOLD_STATUSES as readonly string[]).includes(row.status)) {
      soldCount += row.n;
      soldPaise += Number(row.total);
    }
  }
  totals.revenueRupees = rupees(soldPaise);
  totals.averageOrderRupees = soldCount ? rupees(soldPaise / soldCount) : 0;
  return totals;
}

async function bestSellers(from: Date, to: Date): Promise<SoldLine[]> {
  const rows = await getDb()
    .select({
      product: orderItems.productName,
      variant: orderItems.variantLabel,
      units: sql<string>`sum(${orderItems.quantity})`,
      total: sql<string>`sum(${orderItems.lineTotalPaise})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to), inArray(orders.status, [...SOLD_STATUSES])))
    .groupBy(orderItems.productName, orderItems.variantLabel)
    .orderBy(desc(sql`sum(${orderItems.quantity})`), desc(sql`sum(${orderItems.lineTotalPaise})`))
    .limit(TOP_N);
  return rows.map((r) => ({ product: r.product, variant: r.variant, units: Number(r.units), revenueRupees: rupees(r.total) }));
}

async function stockReport(): Promise<WeeklyAnalytics["stock"]> {
  const rows = await getDb()
    .select({
      product: products.name,
      form: productVariants.variantType,
      size: productVariants.sizeLabel,
      quantity: inventory.quantity,
      reserved: inventory.reserved,
      threshold: inventory.lowStockThreshold,
    })
    .from(inventory)
    .innerJoin(productVariants, eq(inventory.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.isActive, true), eq(products.isActive, true)))
    .orderBy(asc(products.name), asc(productVariants.position));

  const lines: StockLine[] = rows.map((r) => ({
    product: r.product,
    form: VARIANT_TYPE_LABEL[r.form],
    size: r.size,
    sellable: r.quantity - r.reserved,
    threshold: r.threshold,
  }));
  return {
    totalVariants: lines.length,
    outOfStock: lines.filter((l) => l.sellable <= 0),
    lowStock: lines.filter((l) => l.sellable > 0 && l.sellable <= l.threshold),
  };
}

async function customerCounts(weekAgo: Date, twoWeeksAgo: Date, now: Date): Promise<WeeklyAnalytics["customers"]> {
  const db = getDb();
  const [thisWeek] = await db.select({ n: count() }).from(profiles).where(and(gte(profiles.createdAt, weekAgo), lt(profiles.createdAt, now)));
  const [lastWeek] = await db.select({ n: count() }).from(profiles).where(and(gte(profiles.createdAt, twoWeeksAgo), lt(profiles.createdAt, weekAgo)));
  const [total] = await db.select({ n: count() }).from(profiles);
  return { newThisWeek: thisWeek?.n ?? 0, newLastWeek: lastWeek?.n ?? 0, total: total?.n ?? 0 };
}

async function openCarts(weekAgo: Date): Promise<WeeklyAnalytics["carts"]> {
  const [row] = await getDb()
    .select({
      cartsN: sql<string>`count(distinct ${carts.id})`,
      units: sql<string>`coalesce(sum(${cartItems.quantity}), 0)`,
    })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .where(gte(carts.updatedAt, weekAgo));
  return { openLast7Days: Number(row?.cartsN ?? 0), unitsInThem: Number(row?.units ?? 0) };
}

async function wishlistTop(): Promise<WeeklyAnalytics["wishlist"]> {
  const rows = await getDb()
    .select({ product: products.name, saves: count() })
    .from(wishlists)
    .innerJoin(products, eq(wishlists.productId, products.id))
    .groupBy(products.name)
    .orderBy(desc(count()), asc(products.name))
    .limit(TOP_N);
  return { top: rows.map((r) => ({ product: r.product, saves: r.saves })) };
}

async function customPageReport(weekAgo: Date, twoWeeksAgo: Date, now: Date): Promise<WeeklyAnalytics["customPage"]> {
  const db = getDb();
  const inWeek = and(gte(fragranceQueries.createdAt, weekAgo), lt(fragranceQueries.createdAt, now));
  const lower = sql<string>`lower(${fragranceQueries.query})`;
  const [thisWeek] = await db.select({ n: count() }).from(fragranceQueries).where(inWeek);
  const [lastWeek] = await db
    .select({ n: count() })
    .from(fragranceQueries)
    .where(and(gte(fragranceQueries.createdAt, twoWeeksAgo), lt(fragranceQueries.createdAt, weekAgo)));
  const top = await db
    .select({ query: lower, searches: count(), matches: sql<string>`max(${fragranceQueries.matches})` })
    .from(fragranceQueries)
    .where(inWeek)
    .groupBy(lower)
    .orderBy(desc(count()), asc(lower))
    .limit(10);
  const noMatch = await db
    .select({ query: lower, searches: count() })
    .from(fragranceQueries)
    .where(and(inWeek, eq(fragranceQueries.matches, 0)))
    .groupBy(lower)
    .orderBy(desc(count()), asc(lower))
    .limit(10);
  const [listed] = await db.select({ n: count() }).from(inspiredFragrances);
  const [available] = await db.select({ n: count() }).from(inspiredFragrances).where(eq(inspiredFragrances.isAvailable, true));
  return {
    searchesThisWeek: thisWeek?.n ?? 0,
    searchesLastWeek: lastWeek?.n ?? 0,
    topQueries: top.map((r) => ({ query: r.query, searches: r.searches, matches: Number(r.matches) })),
    noMatchQueries: noMatch.map((r) => ({ query: r.query, searches: r.searches })),
    listedFragrances: listed?.n ?? 0,
    availableFragrances: available?.n ?? 0,
  };
}

async function contentReport(weekAgo: Date, monthAgo: Date, now: Date): Promise<WeeklyAnalytics["content"]> {
  const db = getDb();
  const perStatus = await db.select({ status: contentPosts.status, n: count() }).from(contentPosts).groupBy(contentPosts.status);
  const [publishedThisWeek] = await db
    .select({ n: count() })
    .from(contentPosts)
    .where(and(eq(contentPosts.status, "published"), gte(contentPosts.publishedAt, weekAgo), lt(contentPosts.publishedAt, now)));
  const [waiting] = await db
    .select({ n: count() })
    .from(contentPosts)
    .where(and(eq(contentPosts.status, "approved"), isNull(contentPosts.scheduledFor)));
  const failed = await db
    .select({ title: contentPosts.title, platform: contentPosts.platform, attempts: contentPosts.publishAttempts, lastError: contentPosts.lastError })
    .from(contentPosts)
    .where(and(eq(contentPosts.status, "approved"), sql`${contentPosts.publishAttempts} > 0`))
    .orderBy(asc(contentPosts.scheduledFor))
    .limit(20);
  const rejected = await db
    .select({ title: contentPosts.title, platform: contentPosts.platform, ownerNote: contentPosts.ownerNote })
    .from(contentPosts)
    .where(and(eq(contentPosts.status, "rejected"), gte(contentPosts.updatedAt, monthAgo)))
    .orderBy(desc(contentPosts.updatedAt))
    .limit(30);
  const byStatus = { draft: 0, approved: 0, rejected: 0, published: 0 };
  for (const row of perStatus) byStatus[row.status] = row.n;
  return {
    byStatus,
    publishedThisWeek: publishedThisWeek?.n ?? 0,
    approvedWaitingForTime: waiting?.n ?? 0,
    failed,
    rejectedLast30Days: rejected,
  };
}

async function catalogReport(): Promise<WeeklyAnalytics["catalog"]> {
  const rows = await getDb()
    .select({ slug: products.slug, photo: products.heroImageUrl })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.slug));
  return {
    activeProducts: rows.length,
    productsWithoutPhoto: rows.filter((r) => !r.photo).map((r) => r.slug),
  };
}

export async function buildWeeklyAnalytics(now = new Date()): Promise<WeeklyAnalytics> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
  const window = (from: Date, to: Date): Window => ({ from: from.toISOString(), to: to.toISOString() });

  // One query at a time on purpose: Supabase's pooler drops connections
  // when a burst of them opens at once, and nobody is waiting on this.
  return {
    generatedAt: now.toISOString(),
    windows: { thisWeek: window(weekAgo, now), lastWeek: window(twoWeeksAgo, weekAgo), last30Days: window(monthAgo, now) },
    orders: {
      thisWeek: await orderTotals(weekAgo, now),
      lastWeek: await orderTotals(twoWeeksAgo, weekAgo),
      last30Days: await orderTotals(monthAgo, now),
    },
    bestSellers: { thisWeek: await bestSellers(weekAgo, now), last30Days: await bestSellers(monthAgo, now) },
    stock: await stockReport(),
    customers: await customerCounts(weekAgo, twoWeeksAgo, now),
    carts: await openCarts(weekAgo),
    wishlist: await wishlistTop(),
    customPage: await customPageReport(weekAgo, twoWeeksAgo, now),
    content: await contentReport(weekAgo, monthAgo, now),
    catalog: await catalogReport(),
  };
}
