import Link from 'next/link';
import { MarketplaceOrderList } from '@/components/commerce-operations/order-list';
import {
  AdminCommissionStatements,
  CategoryProposalQueue,
  CashOperations,
  ModerationQueue,
  SupportThreads,
} from '@/components/commerce-operations/operations-panels';
import styles from '@/components/commerce-operations/commerce-operations.module.css';
import { requireMarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import {
  listAllCommissionStatementsAsAdmin,
  listActiveProductCategories,
  listMyCashReconciliations,
  listMyCodCollections,
  listMyMarketplaceOrders,
  listMyMarketplaceSupportThreads,
  listPendingMarketplaceModeration,
  listPendingProductCategoryProposals,
} from '@/lib/commerce/operations';

export const dynamic = 'force-dynamic';

export default async function AdminMarketplaceOrdersPage() {
  const { roles } = await requireMarketplaceAdminRole(
    ['operations', 'support', 'finance', 'catalog_reviewer'],
    { nextPath: '/admin/marketplace/orders' },
  );
  const superAdmin = roles.includes('super_admin');
  const canOperate = superAdmin || roles.includes('operations');
  const canReview = superAdmin || roles.includes('catalog_reviewer');
  const canFinance = superAdmin || roles.includes('finance');
  const canSupport = superAdmin || roles.includes('support');
  const [orders, moderation, categoryProposals, categories, collections, reconciliations, support, commissions] = await Promise.all([
    canOperate ? listMyMarketplaceOrders({ limit: 100 }) : Promise.resolve([]),
    canReview ? listPendingMarketplaceModeration({ limit: 50 }) : Promise.resolve({ items: [], nextBefore: null }),
    canReview ? listPendingProductCategoryProposals(50) : Promise.resolve([]),
    canReview ? listActiveProductCategories() : Promise.resolve([]),
    canFinance ? listMyCodCollections({ limit: 50 }) : Promise.resolve({ items: [], nextBefore: null }),
    canFinance ? listMyCashReconciliations({ limit: 50 }) : Promise.resolve({ items: [], nextBefore: null }),
    canSupport ? listMyMarketplaceSupportThreads({ limit: 50 }) : Promise.resolve({ items: [], nextBefore: null }),
    canFinance ? listAllCommissionStatementsAsAdmin({ limit: 50 }) : Promise.resolve({ items: [], nextBefore: null }),
  ]);
  const returnTo = '/admin/marketplace/orders';
  return <main id="main-content" className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>إدارة المنصة</p><h1 className={styles.title}>عمليات السوق</h1><p className={styles.subtitle}>كل عضو يرى أدوات الدور المسند إليه فقط.</p></div><nav aria-label="إدارة السوق"><Link href="/account/notifications">الإشعارات</Link>{superAdmin ? <> · <Link href="/admin/marketplace/setup">إعدادات السوق</Link> · <Link href="/admin/marketplace/memberships">صلاحيات الإدارة</Link></> : null}</nav></header>
    {canReview ? <ModerationQueue items={moderation.items} returnTo={returnTo} /> : null}
    {canReview ? <CategoryProposalQueue items={categoryProposals} categories={categories} returnTo={returnTo} /> : null}
    {canFinance ? <><AdminCommissionStatements items={commissions.items} /><CashOperations collections={collections.items} reconciliations={reconciliations.items} role="admin" returnTo={returnTo} detailBase="/admin/marketplace/reconciliations" /></> : null}
    {canSupport ? <SupportThreads items={support.items} detailBase="/admin/marketplace/support" /> : null}
    {canOperate ? <><h2>الطلبات</h2><MarketplaceOrderList orders={orders} detailBase="/admin/marketplace/orders" /></> : null}
  </main>;
}
