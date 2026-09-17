import { asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { addresses, orders, profiles } from "../db/schema/index.js";

/**
 * ADMIN CUSTOMER LOOKUP
 * ---------------------------------------------------------------
 * Read-only on purpose. An admin can look a customer up to answer a
 * support question, but nothing here edits a customer's own details or
 * their role — a role change is a database-level action precisely so that
 * no API route, however well guarded, can hand out admin access.
 *
 * Email addresses live in Supabase's `auth.users`, not in our `profiles`
 * table, and are not copied in here.
 */

const PAID_STATUSES = new Set(["paid", "shipped", "delivered"]);

export interface AdminCustomerSummary {
  id: string;
  fullName: string | null;
  phone: string | null;
  role: "customer" | "admin";
  orderCount: number;
  lifetimeSpend: number;
  createdAt: Date;
}

export interface AdminCustomerPage {
  customers: AdminCustomerSummary[];
  total: number;
}

export async function listCustomers(options: {
  page: number;
  perPage: number;
  search?: string;
}): Promise<AdminCustomerPage> {
  const db = getDb();

  const filter = options.search
    ? or(ilike(profiles.fullName, `%${options.search}%`), ilike(profiles.phone, `%${options.search}%`))
    : undefined;

  let rowsQuery = db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      phone: profiles.phone,
      role: profiles.role,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .$dynamic();

  let countQuery = db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(profiles).$dynamic();

  if (filter) {
    rowsQuery = rowsQuery.where(filter);
    countQuery = countQuery.where(filter);
  }

  const [rows, [totals]] = await Promise.all([
    rowsQuery
      .orderBy(desc(profiles.createdAt))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage),
    countQuery,
  ]);

  if (rows.length === 0) return { customers: [], total: totals?.count ?? 0 };

  // Lifetime spend counts orders that were paid for (including ones since
  // shipped or delivered) — an unpaid or cancelled order is not money the
  // shop ever received.
  const spend = await db
    .select({
      userId: orders.userId,
      orderCount: sql<number>`count(*)`.mapWith(Number),
      paidPaise: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.status} in ('paid', 'shipped', 'delivered')), 0)`.mapWith(
        Number,
      ),
    })
    .from(orders)
    .where(
      inArray(
        orders.userId,
        rows.map((row) => row.id),
      ),
    )
    .groupBy(orders.userId);
  const spendByUser = new Map(spend.map((row) => [row.userId, row]));

  return {
    customers: rows.map((row) => ({
      ...row,
      orderCount: spendByUser.get(row.id)?.orderCount ?? 0,
      lifetimeSpend: (spendByUser.get(row.id)?.paidPaise ?? 0) / 100,
    })),
    total: totals?.count ?? 0,
  };
}

export interface AdminCustomerDetail extends AdminCustomerSummary {
  addresses: Array<{
    id: string;
    label: string;
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: Date;
  }>;
}

/** Returns null when no customer has that id. */
export async function getCustomerDetail(userId: string): Promise<AdminCustomerDetail | null> {
  const db = getDb();

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  if (!profile) return null;

  const [addressRows, orderRows] = await Promise.all([
    db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.isDefault), asc(addresses.createdAt)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalPaise: orders.totalPaise,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt)),
  ]);

  const paidPaise = orderRows
    .filter((order) => PAID_STATUSES.has(order.status))
    .reduce((sum, order) => sum + order.totalPaise, 0);

  return {
    id: profile.id,
    fullName: profile.fullName,
    phone: profile.phone,
    role: profile.role,
    createdAt: profile.createdAt,
    orderCount: orderRows.length,
    lifetimeSpend: paidPaise / 100,
    addresses: addressRows.map((address) => ({
      id: address.id,
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
    })),
    orders: orderRows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.totalPaise / 100,
      createdAt: order.createdAt,
    })),
  };
}
