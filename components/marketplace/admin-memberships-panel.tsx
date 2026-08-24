import { randomUUID } from 'node:crypto';
import { Button } from '@heroui/react/button';
import type { MarketplaceAdminMembership, MarketplaceAdminRole } from '@/lib/admin/marketplace-memberships';
import styles from './operational-setup.module.css';

const roleOptions: Array<{ value: MarketplaceAdminRole; label: string; description: string }> = [
  { value: 'super_admin', label: 'مدير كامل', description: 'الإعدادات والعضويات وجميع وظائف السوق.' },
  { value: 'operations', label: 'العمليات والتوصيل', description: 'الطلبات وتعيين السائقين وتحديثات التسليم.' },
  { value: 'support', label: 'الدعم', description: 'محادثات الدعم فقط.' },
  { value: 'finance', label: 'المالية', description: 'التحصيلات والتسويات وكشوف العمولات.' },
  { value: 'catalog_reviewer', label: 'مراجع الكتالوج', description: 'مراجعة المتاجر والمنتجات والتعديلات المنشورة.' },
];

type FormAction = (form: FormData) => void | Promise<void>;

export function AdminMembershipsPanel({ memberships, action }: {
  memberships: MarketplaceAdminMembership[];
  action: FormAction;
}) {
  return <section className={styles.section} aria-labelledby="admin-memberships-title">
    <div className={styles.sectionHeader}><div>
      <h2 id="admin-memberships-title">صلاحيات فريق الإدارة</h2>
      <p>كل صلاحية محدودة داخل قاعدة البيانات وتتطلب جلسة تحقق بخطوتين. لا يمكن تعطيل آخر مدير كامل.</p>
    </div></div>
    <div className={styles.list}>{memberships.map((membership) => (
      <form action={action} className={styles.card} key={membership.user_id}>
        <input type="hidden" name="userId" value={membership.user_id} />
        <input type="hidden" name="expectedVersion" value={membership.version} />
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <h3>{membership.display_name}</h3>
        <p><bdi dir="ltr">{membership.phone}</bdi>{membership.profile_active ? '' : ' · الحساب موقوف'}</p>
        <fieldset className={styles.list}>
          <legend>الأدوار</legend>
          {roleOptions.map((role) => <label className={styles.checkbox} key={role.value}>
            <input type="checkbox" name="roles" value={role.value} defaultChecked={membership.roles.includes(role.value)} />
            <span><strong>{role.label}</strong> — {role.description}</span>
          </label>)}
        </fieldset>
        <label className={styles.checkbox}>
          <input type="checkbox" name="isActive" defaultChecked={membership.membership_active} />
          العضوية الإدارية مفعلة
        </label>
        <div className={styles.actions}>
          <Button.Root type="submit" className={styles.primary}>حفظ الصلاحيات</Button.Root>
        </div>
      </form>
    ))}</div>
  </section>;
}
