'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Textarea,
} from '@heroui/react';
import {
  Building2,
  BarChart3,
  ClipboardCheck,
  Eye,
  History,
  Lightbulb,
  Link2,
  MessageSquareText,
  Megaphone,
  MousePointerClick,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  Utensils,
  UserCog,
  Users,
} from 'lucide-react';
import {
  createMerchant,
  createMerchantBranch,
  linkBranchToPlace,
  provisionUser,
  setUserActive,
} from '@/lib/operations/actions';
import {
  approvePendingPlace,
  rejectPendingPlace,
  resolveFeedbackWithoutChanges,
} from '@/lib/operations/approval-actions';
import { FeedbackDetailsModal } from '@/components/admin/FeedbackDetailsModal';
import { EditPlaceModal } from '@/components/admin/EditPlaceModal';
import { EditRequestModal } from '@/components/admin/EditRequestModal';
import { DriverManager } from '@/components/admin/DriverManager';
import { AccountRequestManager } from '@/components/admin/AccountRequestManager';
import { UserEditorModal } from '@/components/admin/UserEditorModal';
import { useDeliveryRealtime } from '@/hooks/useDeliveryRealtime';
import type { AccountRequest, FeedbackRequest, PendingRequest, Place } from '@/types';
import type { Driver, MarketingCampaign, MarketingChannel } from '@/types';
import type { BehaviorAnalyticsSummary } from '@/lib/analytics/admin';
import { MarketingCenter } from '@/components/admin/MarketingCenter';
import { formatCairoDateTime, formatUtcDayMonth } from '@/lib/format-date';

type Merchant = { id: string; display_name: string; is_active: boolean };
type Profile = {
  id: string;
  display_name: string;
  phone: string;
  role: 'admin' | 'merchant' | 'driver';
  is_active: boolean;
  merchant_id: string | null;
  must_change_password?: boolean;
};
type Order = {
  id: string;
  public_code: string;
  status: string;
  recipient_name: string;
  delivery_area: string;
  created_at: string;
};
type Branch = {
  id: string;
  merchant_id: string;
  place_id: string | null;
  name: string;
  phone: string;
  address: string;
  area: string;
  is_default: boolean;
  is_active: boolean;
};
type DirectoryDriver = {
  id: string;
  name: string | null;
  phone: string;
  whatsapp: string | null;
  vehicle_type: string | null;
  is_active: boolean;
  is_available: boolean;
  active_until: string | null;
  created_at: string;
  source: 'public' | 'account';
};
type AuditEntry = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
type ClientErrorSummary = {
  id: number;
  fingerprint: string;
  event_type: string;
  route: string;
  browser_family: string;
  os_family: string;
  release: string;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
};

type AdminWorkspaceProps = {
  merchants: Merchant[];
  profiles: Profile[];
  orders: Order[];
  branches: Branch[];
  places: Place[];
  pendingRequests: PendingRequest[];
  feedbackRequests: FeedbackRequest[];
  drivers: DirectoryDriver[];
  auditLog: AuditEntry[];
  accountRequests: AccountRequest[];
  clientErrors: ClientErrorSummary[];
  behaviorAnalytics: BehaviorAnalyticsSummary;
  marketingChannels: MarketingChannel[];
  marketingCampaigns: MarketingCampaign[];
  marketingDrivers: Driver[];
};

export function AdminWorkspace(props: AdminWorkspaceProps) {
  useDeliveryRealtime('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackRequest | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [merchantName, setMerchantName] = useState('');
  const [user, setUser] = useState({
    displayName: '',
    phone: '',
    password: '',
    role: 'driver' as Profile['role'],
    merchantId: '',
  });
  const [branch, setBranch] = useState({
    merchantId: '',
    placeId: '',
    name: '',
    phone: '',
    address: '',
    area: '',
  });

  const pendingFeedback = props.feedbackRequests.filter(
    (request) => request.status === 'pending',
  );
  const merchantChanges = pendingFeedback.filter(
    (request) => request.feedback_type === 'merchant_update',
  );
  const directoryReports = pendingFeedback.filter((request) =>
    ['menu_update', 'phone_change', 'details_update', 'report_issue'].includes(request.feedback_type),
  );
  const suggestions = pendingFeedback.filter((request) =>
    ['general_suggestion', 'rating'].includes(request.feedback_type),
  );
  const pendingAdditions = props.pendingRequests.filter(
    (request) => request.status === 'pending',
  );
  const pendingAccounts = props.accountRequests.filter(
    (request) => request.status === 'pending',
  );

  function complete(successMessage: string) {
    setMessage(successMessage);
    router.refresh();
  }

  function recoverFromActionError(error: unknown) {
    console.error('Admin action transport failed:', error);
    setMessage('انقطع الاتصال بعد تنفيذ العملية. جاري تحديث البيانات للتحقق من النتيجة.');
    router.refresh();
  }

  function createMerchantSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createMerchant(merchantName);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setMerchantName('');
      complete('تم إنشاء سجل المحل.');
    });
  }

  function createUserSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await provisionUser({
        ...user,
        merchantId: user.role === 'merchant' ? user.merchantId || null : null,
      });
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setUser({
        displayName: '',
        phone: '',
        password: '',
        role: 'driver',
        merchantId: '',
      });
      complete('تم إنشاء الحساب بكلمة المرور المؤقتة.');
    });
  }

  function createBranchSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createMerchantBranch({
        ...branch,
        placeId: branch.placeId || null,
        isDefault: false,
      });
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setBranch({
        merchantId: '',
        placeId: '',
        name: '',
        phone: '',
        address: '',
        area: '',
      });
      complete('تم إنشاء الفرع وربطه ببطاقة الخدمة.');
    });
  }

  function toggleProfile(profile: Profile) {
    startTransition(async () => {
      const result = await setUserActive(profile.id, !profile.is_active);
      if (result.success) complete('تم تحديث حالة الحساب.');
      else setMessage(result.message);
    });
  }

  function updateBranchLink(branchId: string, placeId: string) {
    startTransition(async () => {
      const result = await linkBranchToPlace(branchId, placeId || null);
      if (result.success) complete('تم تحديث ارتباط الفرع بكيان سيتي سبوت.');
      else setMessage(result.message);
    });
  }

  function approveRequest(requestId: string) {
    startTransition(async () => {
      try {
        const result = await approvePendingPlace(requestId);
        if (result.success) complete(result.message);
        else setMessage(result.message);
      } catch (error) {
        recoverFromActionError(error);
      }
    });
  }

  function rejectRequest(requestId: string) {
    startTransition(async () => {
      try {
        const result = await rejectPendingPlace(requestId);
        if (result.success) complete(result.message);
        else setMessage(result.message);
      } catch (error) {
        recoverFromActionError(error);
      }
    });
  }

  function resolveSuggestion(requestId: string) {
    startTransition(async () => {
      try {
        const result = await resolveFeedbackWithoutChanges(requestId);
        if (result.success) complete('تمت أرشفة الاقتراح أو التقييم.');
        else setMessage(result.message);
      } catch (error) {
        recoverFromActionError(error);
      }
    });
  }

  const selectedTargetPlace = selectedFeedback?.target_place_id
    ? props.places.find((place) => place.id === selectedFeedback.target_place_id) ?? null
    : null;

  return (
    <main id="main-content" className="dir-rtl mx-auto max-w-7xl space-y-5 overflow-x-clip px-3 py-5 sm:px-6">
      <section>
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <ShieldCheck className="size-6 text-zinc-900" />
          لوحة الإدارة
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          إدارة كيان سيتي سبوت والحسابات وعمليات التوصيل من مساحة واحدة.
        </p>
      </section>

      {message && (
        <p
          role="status"
          className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 text-sm font-semibold"
        >
          {message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric
          label="طلبات الحسابات"
          value={pendingAccounts.length}
          icon={<UserCog className="size-5" />}
        />
        <Metric
          label="الحسابات النشطة"
          value={props.profiles.filter((profile) => profile.is_active).length}
          icon={<Users className="size-5" />}
        />
        <Metric
          label="الأماكن العامة"
          value={props.places.length}
          icon={<Building2 className="size-5" />}
        />
        <Metric
          label="طلبات الإضافة"
          value={pendingAdditions.length}
          icon={<ClipboardCheck className="size-5" />}
        />
        <Metric
          label="تعديلات المحلات"
          value={merchantChanges.length}
          icon={<MessageSquareText className="size-5" />}
        />
        <Metric
          label="الاقتراحات والتقييمات"
          value={suggestions.length}
          icon={<Lightbulb className="size-5" />}
        />
      </div>

      <BehaviorAnalyticsOverview
        analytics={props.behaviorAnalytics}
        places={props.places}
        drivers={props.marketingDrivers}
      />

      {props.clientErrors.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50/50">
          <CardHeader className="flex items-center justify-between gap-3">
            <span className="font-black">تقارير الأعطال المجهولة — آخر 30 يومًا</span>
            <Chip className="bg-amber-100 text-amber-900">
              {props.clientErrors.reduce((total, item) => total + item.occurrences, 0)} حدث
            </Chip>
          </CardHeader>
          <CardBody className="gap-2">
            {props.clientErrors.slice(0, 10).map((item) => (
              <article
                key={item.id}
                className="grid gap-2 rounded-xl border border-amber-200 bg-white p-3 text-xs sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate font-black">
                    {item.event_type} · {item.route}
                  </p>
                  <p className="mt-1 text-zinc-500">
                    {item.browser_family} / {item.os_family} · بصمة {item.fingerprint.slice(0, 10)}
                  </p>
                </div>
                <div className="text-start font-bold tabular-nums sm:text-end">
                  <p>{item.occurrences} مرة</p>
                  <time dateTime={item.last_seen_at}>
                    {formatCairoDateTime(item.last_seen_at)}
                  </time>
                </div>
              </article>
            ))}
          </CardBody>
        </Card>
      )}

      <Tabs
        aria-label="إدارة المنصة"
        className="kayan-admin-tabs min-w-0"
        classNames={{
          tabList: 'max-w-full overflow-x-auto rounded-2xl bg-zinc-100 p-1 no-scrollbar',
          tab: 'min-h-11 shrink-0 px-4 font-bold',
          cursor: 'bg-zinc-950',
          panel: 'px-0 pt-4',
        }}
      >
        <Tab
          id="marketing"
          key="marketing"
          title={
            <span className="flex items-center gap-1.5">
              <Megaphone className="size-4" />
              التسويق والنشر
            </span>
          }
        >
          <MarketingCenter
            places={props.places}
            drivers={props.marketingDrivers}
            channels={props.marketingChannels}
            campaigns={props.marketingCampaigns}
          />
        </Tab>
        <Tab
          id="account-requests"
          key="account-requests"
          title={`طلبات الحسابات (${pendingAccounts.length})`}
        >
          <AccountRequestManager
            requests={props.accountRequests}
            places={props.places}
            onRefresh={() => router.refresh()}
            onMessage={setMessage}
          />
        </Tab>

        <Tab id="orders" key="orders" title="الطلبات">
          <OrdersTab orders={props.orders} />
        </Tab>

        <Tab
          id="merchant-changes"
          key="merchant-changes"
          title={`تعديلات المحلات (${merchantChanges.length})`}
        >
          <Card className="border border-zinc-200">
            <CardHeader className="gap-2 font-black">
              <Utensils className="size-5" />
              طلبات تحديث بطاقات المحلات والمطاعم
            </CardHeader>
            <CardBody className="gap-3">
              {merchantChanges.length ? (
                merchantChanges.map((request) => (
                  <article
                    key={request.id}
                    className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">{request.place_name_or_phone}</p>
                        <Chip className="bg-amber-500/10 text-amber-800">من حساب محل</Chip>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                        {request.notes}
                      </p>
                    </div>
                    <Button
                      onPress={() => setSelectedFeedback(request)}
                      className="bg-zinc-900 font-bold text-white"
                    >
                      مراجعة وتطبيق
                    </Button>
                  </article>
                ))
              ) : (
                <EmptyState text="لا توجد تعديلات معلقة من المحلات." />
              )}
            </CardBody>
          </Card>
        </Tab>

        <Tab
          id="directory-reports"
          key="directory-reports"
          title={`بلاغات التعديل (${directoryReports.length})`}
        >
          <Card className="border border-zinc-200">
            <CardHeader className="font-black">تعديلات وبلاغات زوار كيان سيتي سبوت</CardHeader>
            <CardBody className="gap-3">
              {directoryReports.length ? (
                directoryReports.map((request) => (
                  <article
                    key={request.id}
                    className="flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">{request.place_name_or_phone}</p>
                        <Chip className="bg-sky-500/10 text-sky-800">
                          {feedbackTypeLabel(request.feedback_type)}
                        </Chip>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{request.notes}</p>
                    </div>
                    <Button
                      onPress={() => setSelectedFeedback(request)}
                      className="bg-zinc-900 font-bold text-white"
                    >
                      مراجعة وتطبيق
                    </Button>
                  </article>
                ))
              ) : (
                <EmptyState text="لا توجد بلاغات تعديل معلقة من الزوار." />
              )}
            </CardBody>
          </Card>
        </Tab>

        <Tab id="additions" key="additions" title={`إضافات جديدة (${pendingAdditions.length})`}>
          <Card className="border border-zinc-200">
            <CardHeader className="font-black">طلبات إضافة مكان أو خدمة</CardHeader>
            <CardBody className="gap-3">
              {pendingAdditions.length ? (
                pendingAdditions.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-2xl border border-zinc-200 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-black">{request.title}</p>
                        <p className="dir-ltr mt-1 text-right text-sm text-zinc-600">
                          {request.phone}
                        </p>
                        <p className="mt-2 text-sm text-zinc-600">
                          {request.description || 'بدون وصف'}
                        </p>
                        {request.images.length > 0 && (
                          <p className="mt-2 text-xs text-zinc-500">
                            {request.images.length} صورة مرفقة
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          isDisabled={pending}
                          onPress={() => setSelectedRequest(request)}
                          startContent={<Pencil className="size-4" />}
                          className="border border-zinc-200 bg-white font-bold text-zinc-800"
                        >
                          مراجعة وتعديل
                        </Button>
                        <Button
                          isLoading={pending}
                          onPress={() => rejectRequest(request.id)}
                          className="border border-rose-200 bg-rose-50 font-bold text-rose-700"
                        >
                          رفض
                        </Button>
                        <Button
                          isLoading={pending}
                          onPress={() => approveRequest(request.id)}
                          className="bg-zinc-900 font-bold text-white"
                        >
                          موافقة ونشر
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState text="لا توجد طلبات إضافة معلقة." />
              )}
            </CardBody>
          </Card>
        </Tab>

        <Tab
          id="suggestions"
          key="suggestions"
          title={`الاقتراحات والتقييمات (${suggestions.length})`}
        >
          <Card className="border border-zinc-200">
            <CardHeader className="gap-2 font-black">
              <Lightbulb className="size-5" />
              آراء الزوار واقتراحاتهم
            </CardHeader>
            <CardBody className="gap-3">
              {suggestions.length ? (
                suggestions.map((request) => (
                  <article key={request.id} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip className="bg-violet-500/10 text-violet-800">
                            {request.feedback_type === 'rating' ? 'تقييم' : 'اقتراح'}
                          </Chip>
                          {request.feedback_type === 'rating' && (
                            <span className="flex items-center gap-1 text-sm font-black text-amber-600">
                              <Star className="size-4 fill-amber-400" />
                              {request.rating ?? 0} / 5
                            </span>
                          )}
                          <span className="text-xs text-zinc-500">
                            {formatDate(request.created_at)}
                          </span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-700">
                          {request.notes}
                        </p>
                        <p className="dir-ltr mt-2 text-right text-xs text-zinc-500">
                          {request.contact_phone || 'بدون رقم تواصل'}
                        </p>
                      </div>
                      <Button
                        isLoading={pending}
                        onPress={() => resolveSuggestion(request.id)}
                        className="border border-zinc-200 bg-zinc-100 font-bold text-zinc-800"
                      >
                        أرشفة بعد المراجعة
                      </Button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState text="لا توجد اقتراحات أو تقييمات جديدة." />
              )}
            </CardBody>
          </Card>
        </Tab>

        <Tab id="directory" key="directory" title="الخدمات والكباتن">
          <DirectoryTab
            places={props.places}
            drivers={props.drivers}
            onRefresh={() => router.refresh()}
          />
        </Tab>

        <Tab id="accounts" key="accounts" title="الحسابات والربط">
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="border border-zinc-200">
                <CardHeader className="font-black">إنشاء محل</CardHeader>
                <CardBody>
                  <form className="grid gap-3" onSubmit={createMerchantSubmit}>
                    <Input
                      isRequired
                      label="اسم المحل"
                      value={merchantName}
                      onValueChange={setMerchantName}
                    />
                    <Button
                      type="submit"
                      isLoading={pending}
                      className="bg-zinc-900 font-bold text-white"
                    >
                      إضافة المحل
                    </Button>
                  </form>
                </CardBody>
              </Card>

              <Card className="border border-zinc-200 lg:col-span-2">
                <CardHeader className="font-black">إنشاء فرع وربطه بكيان سيتي سبوت</CardHeader>
                <CardBody>
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={createBranchSubmit}
                  >
                    <Select
                      isRequired
                      label="المحل"
                      selectedKeys={branch.merchantId ? [branch.merchantId] : []}
                      onSelectionChange={(keys) =>
                        setBranch({
                          ...branch,
                          merchantId: String(Array.from(keys)[0] ?? ''),
                        })
                      }
                    >
                      {props.merchants.map((merchant) => (
                        <SelectItem key={merchant.id} value={merchant.id}>
                          {merchant.display_name}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      label="بطاقة المكان العامة"
                      selectedKeys={branch.placeId ? [branch.placeId] : ['']}
                      onSelectionChange={(keys) =>
                        setBranch({
                          ...branch,
                          placeId: String(Array.from(keys)[0] ?? ''),
                        })
                      }
                    >
                      <SelectItem key="unlinked" value="">
                        بدون ربط حالياً
                      </SelectItem>
                      {props.places.map((place) => (
                        <SelectItem key={place.id} value={place.id}>
                          {place.title}
                        </SelectItem>
                      ))}
                    </Select>
                    <Input
                      isRequired
                      label="اسم الفرع"
                      value={branch.name}
                      onValueChange={(name) => setBranch({ ...branch, name })}
                    />
                    <Input
                      isRequired
                      type="tel"
                      label="هاتف الفرع"
                      value={branch.phone}
                      onValueChange={(phone) => setBranch({ ...branch, phone })}
                    />
                    <Input
                      isRequired
                      label="المنطقة"
                      value={branch.area}
                      onValueChange={(area) => setBranch({ ...branch, area })}
                    />
                    <Textarea
                      isRequired
                      label="العنوان"
                      value={branch.address}
                      onValueChange={(address) => setBranch({ ...branch, address })}
                    />
                    <Button
                      type="submit"
                      isLoading={pending}
                      className="bg-zinc-900 font-bold text-white sm:col-span-2"
                    >
                      إنشاء وربط الفرع
                    </Button>
                  </form>
                </CardBody>
              </Card>
            </div>

            <Card className="border border-zinc-200">
              <CardHeader className="gap-2 font-black">
                <Link2 className="size-5" />
                ربط الفروع الحالية
              </CardHeader>
              <CardBody className="gap-3">
                {props.branches.map((item) => (
                  <div
                    key={item.id}
                    className="grid items-end gap-3 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[1fr_1.4fr]"
                  >
                    <div>
                      <p className="font-bold">{item.name}</p>
                      <p className="text-xs text-zinc-500">
                        {props.merchants.find((merchant) => merchant.id === item.merchant_id)
                          ?.display_name || 'محل غير معروف'}
                      </p>
                    </div>
                    <Select
                      label="بطاقة الخدمة"
                      selectedKeys={item.place_id ? [item.place_id] : ['']}
                      onSelectionChange={(keys) =>
                        updateBranchLink(
                          item.id,
                          String(Array.from(keys)[0] ?? ''),
                        )
                      }
                    >
                      <SelectItem key="none" value="">
                        بدون ربط
                      </SelectItem>
                      {props.places.map((place) => (
                        <SelectItem key={place.id} value={place.id}>
                          {place.title}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>
                ))}
              </CardBody>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="border border-zinc-200">
                <CardHeader className="font-black">إنشاء حساب تشغيل</CardHeader>
                <CardBody>
                  <form
                    className="grid gap-3"
                    onSubmit={createUserSubmit}
                    autoComplete="off"
                  >
                    <Input
                      isRequired
                      label="الاسم"
                      name="new-user-display-name"
                      autoComplete="off"
                      value={user.displayName}
                      onValueChange={(displayName) => setUser({ ...user, displayName })}
                    />
                    <Input
                      isRequired
                      type="tel"
                      label="الهاتف"
                      name="new-user-phone"
                      autoComplete="off"
                      value={user.phone}
                      onValueChange={(phone) => setUser({ ...user, phone })}
                    />
                    <Input
                      isRequired
                      type="password"
                      label="كلمة المرور المؤقتة"
                      name="new-user-password"
                      autoComplete="new-password"
                      value={user.password}
                      onValueChange={(password) => setUser({ ...user, password })}
                    />
                    <Select
                      label="الدور"
                      selectedKeys={[user.role]}
                      onSelectionChange={(keys) =>
                        setUser({
                          ...user,
                          role: String(Array.from(keys)[0]) as Profile['role'],
                        })
                      }
                    >
                      <SelectItem key="driver" value="driver">
                        كابتن
                      </SelectItem>
                      <SelectItem key="merchant" value="merchant">
                        محل
                      </SelectItem>
                      <SelectItem key="admin" value="admin">
                        أدمن
                      </SelectItem>
                    </Select>
                    {user.role === 'merchant' && (
                      <Select
                        isRequired
                        label="المحل"
                        selectedKeys={user.merchantId ? [user.merchantId] : []}
                        onSelectionChange={(keys) =>
                          setUser({
                            ...user,
                            merchantId: String(Array.from(keys)[0] ?? ''),
                          })
                        }
                      >
                        {props.merchants.map((merchant) => (
                          <SelectItem key={merchant.id} value={merchant.id}>
                            {merchant.display_name}
                          </SelectItem>
                        ))}
                      </Select>
                    )}
                    <Button
                      type="submit"
                      isLoading={pending}
                      className="bg-zinc-900 font-bold text-white"
                    >
                      إنشاء الحساب
                    </Button>
                  </form>
                </CardBody>
              </Card>

              <Card className="border border-zinc-200">
                <CardHeader className="font-black">كل الحسابات</CardHeader>
                <CardBody className="gap-2">
                  {props.profiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3"
                    >
                      <div>
                        <p className="font-bold">
                          {profile.display_name}{' '}
                          <Chip className="bg-zinc-100 text-zinc-700">
                            {profile.role}
                          </Chip>
                        </p>
                        <p className="dir-ltr text-xs text-zinc-500">
                          {profile.phone}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="flat"
                          isLoading={pending}
                          onPress={() => toggleProfile(profile)}
                          className={
                            profile.is_active
                              ? 'border border-rose-200 bg-rose-50 text-rose-700'
                              : 'border border-zinc-200 bg-zinc-100 text-zinc-900'
                          }
                        >
                          {profile.is_active ? 'تعطيل' : 'تفعيل'}
                        </Button>
                        <Button
                          onPress={() => setSelectedProfile(profile)}
                          startContent={<UserCog className="size-4" />}
                          className="bg-zinc-900 font-bold text-white"
                        >
                          إدارة
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          </div>
        </Tab>

        <Tab id="audit" key="audit" title="سجل الإدارة">
          <Card className="border border-zinc-200">
            <CardHeader className="gap-2 font-black">
              <History className="size-5" />
              آخر العمليات الإدارية
            </CardHeader>
            <CardBody className="gap-2">
              {props.auditLog.length ? (
                props.auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid gap-2 rounded-xl border border-zinc-200 p-3 text-sm sm:grid-cols-[1.4fr_1fr_auto]"
                  >
                    <div>
                      <p className="font-bold">{auditActionLabel(entry.action)}</p>
                      <p className="text-xs text-zinc-500">
                        {entry.entity_type} · {entry.entity_id}
                      </p>
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {Object.keys(entry.metadata || {}).length
                        ? JSON.stringify(entry.metadata)
                        : 'بدون تفاصيل إضافية'}
                    </p>
                    <time className="text-xs text-zinc-500">
                      {formatDate(entry.created_at)}
                    </time>
                  </div>
                ))
              ) : (
                <EmptyState text="لا توجد عمليات مسجلة بعد." />
              )}
            </CardBody>
          </Card>
        </Tab>
      </Tabs>

      {selectedFeedback && (
        <FeedbackDetailsModal
          key={selectedFeedback.id}
          isOpen
          onOpenChange={(open) => {
            if (!open) setSelectedFeedback(null);
          }}
          feedback={selectedFeedback}
          targetPlace={selectedTargetPlace}
          onSuccess={() => {
            setSelectedFeedback(null);
            router.refresh();
          }}
        />
      )}

      <EditRequestModal
        isOpen={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null);
        }}
        request={selectedRequest}
        onSuccess={() => {
          setSelectedRequest(null);
          complete('تم تعديل الطلب والموافقة عليه ونشر المكان.');
        }}
      />

      {selectedProfile && (
        <UserEditorModal
          key={selectedProfile.id}
          isOpen
          onOpenChange={(open) => {
            if (!open) setSelectedProfile(null);
          }}
          profile={selectedProfile}
          merchants={props.merchants}
          onSuccess={(successMessage) => {
            setSelectedProfile(null);
            complete(successMessage);
          }}
        />
      )}
    </main>
  );
}

const analyticsActionLabels: Record<string, string> = {
  place_open: 'فتح تفاصيل مكان',
  driver_open: 'فتح تفاصيل كابتن',
  guide_open: 'فتح دليل الاستخدام',
  marketing_share_click: 'مشاركة مادة تسويقية',
  card_download: 'تنزيل بطاقة نشر',
  phone_click: 'ضغط اتصال',
  whatsapp_click: 'ضغط WhatsApp',
  group_click: 'فتح جروب WhatsApp',
  telegram_click: 'فتح Telegram',
  map_click: 'فتح الخريطة',
  share_click: 'مشاركة مكان',
  favorite_click: 'إضافة للمفضلة',
  upvote_click: 'توصية بمكان',
  search_use: 'استخدام البحث',
  category_select: 'اختيار تصنيف',
  join_open: 'فتح الانضمام',
  feedback_open: 'فتح الاقتراحات',
  add_listing_open: 'بدء إضافة مكان',
  driver_signup_open: 'بدء تسجيل كابتن',
  support_click: 'التواصل مع الدعم',
};

function BehaviorAnalyticsOverview({
  analytics,
  places,
  drivers,
}: {
  analytics: BehaviorAnalyticsSummary;
  places: Place[];
  drivers: Driver[];
}) {
  const maxDaily = Math.max(
    1,
    ...analytics.daily.map((item) => Math.max(item.views, item.visitors)),
  );
  const topAction = analytics.topActions[0];
  const topPlace = analytics.topPlaces[0];
  const topDriver = analytics.topDrivers[0];
  const placeTitle = (placeId: string) =>
    places.find((place) => place.id === placeId)?.title ?? 'مكان محذوف أو غير منشور';
  const driverTitle = (driverId: string) =>
    drivers.find((driver) => driver.id === driverId)?.name ?? 'كابتن محذوف أو غير منشور';

  return (
    <Card className="overflow-hidden border border-zinc-200">
      <CardHeader className="flex flex-col items-stretch gap-3 border-b border-zinc-100 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-black">
            <BarChart3 className="size-5" aria-hidden="true" />
            تفاعل الزوار — آخر {analytics.periodDays} يومًا
          </h2>
          <p className="mt-1 text-xs font-semibold text-zinc-500">
            أرقام مجمّعة ومجهولة؛ لا يتم حفظ أرقام هواتف أو كلمات البحث أو IP.
          </p>
        </div>
        <Chip className={analytics.available ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}>
          {analytics.available ? 'التتبع يعمل' : 'في انتظار تفعيل الترحيل'}
        </Chip>
      </CardHeader>
      <CardBody className="gap-5 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <AnalyticsMetric
            label="زوار مختلفون"
            value={analytics.totalVisitors}
            detail={`${analytics.visitorsToday} اليوم`}
            icon={<Users className="size-5" aria-hidden="true" />}
          />
          <AnalyticsMetric
            label="مشاهدات الصفحات"
            value={analytics.pageViews}
            detail="بدون معاملات الرابط"
            icon={<Eye className="size-5" aria-hidden="true" />}
          />
          <AnalyticsMetric
            label="فتح التفاصيل"
            value={analytics.placeOpens}
            detail="بطاقات الأماكن"
            icon={<MousePointerClick className="size-5" aria-hidden="true" />}
          />
          <AnalyticsMetric
            label="فتح الكباتن"
            value={analytics.driverOpens}
            detail="بطاقات التوصيل"
            icon={<UserCog className="size-5" aria-hidden="true" />}
          />
          <AnalyticsMetric
            label="إجراءات التواصل"
            value={analytics.actionClicks}
            detail={`${analytics.actionRate}% من فتح البطاقات`}
            icon={<TrendingUp className="size-5" aria-hidden="true" />}
          />
          <AnalyticsMetric
            label="استخدام البحث"
            value={analytics.searchUses}
            detail="لا نحفظ كلمات البحث"
            icon={<Search className="size-5" aria-hidden="true" />}
          />
        </div>

        {analytics.daily.length > 0 && (
          <section aria-labelledby="traffic-chart-title">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 id="traffic-chart-title" className="text-sm font-black">
                الحركة اليومية — آخر 14 يومًا
              </h3>
              <div className="flex gap-3 text-[11px] font-bold text-zinc-500">
                <span className="flex items-center gap-1">
                  <i className="size-2 rounded-full bg-zinc-950" aria-hidden="true" />
                  مشاهدة
                </span>
                <span className="flex items-center gap-1">
                  <i className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  زائر
                </span>
              </div>
            </div>
            <div className="max-w-full overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="grid min-w-[620px] grid-cols-14 items-end gap-2" aria-label="رسم الحركة اليومية">
                {analytics.daily.map((day) => (
                  <div key={day.date} className="flex min-w-0 flex-col items-center gap-1.5">
                    <div className="flex h-28 w-full items-end justify-center gap-1">
                      <div
                        className="w-2.5 rounded-t bg-zinc-950"
                        style={{ height: `${Math.max(3, (day.views / maxDaily) * 100)}%` }}
                        title={`${day.views} مشاهدة`}
                      />
                      <div
                        className="w-2.5 rounded-t bg-emerald-500"
                        style={{ height: `${Math.max(3, (day.visitors / maxDaily) * 100)}%` }}
                        title={`${day.visitors} زائر`}
                      />
                    </div>
                    <time
                      dateTime={day.date}
                      className="text-[9px] font-bold text-zinc-500"
                    >
                      {formatUtcDayMonth(day.date)}
                    </time>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-zinc-200 p-4">
            <h3 className="text-sm font-black">أكثر ما يضغط عليه الزوار</h3>
            <div className="mt-3 space-y-2">
              {analytics.topActions.length ? analytics.topActions.slice(0, 6).map((item, index) => (
                <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-bold">
                    {index + 1}. {analyticsActionLabels[item.name] ?? item.name}
                  </span>
                  <bdi dir="ltr" className="shrink-0 font-black tabular-nums">{item.count}</bdi>
                </div>
              )) : <EmptyState text="ستظهر التفاعلات هنا بعد بدء جمع البيانات." />}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 p-4">
            <h3 className="text-sm font-black">أكثر الأماكن تفاعلاً</h3>
            <div className="mt-3 space-y-2">
              {analytics.topPlaces.length ? analytics.topPlaces.slice(0, 6).map((item, index) => (
                <div key={item.placeId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                  <span className="truncate font-bold">
                    {index + 1}. {placeTitle(item.placeId)}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-zinc-500">
                    {item.opens} فتح · {item.actions} إجراء
                  </span>
                </div>
              )) : <EmptyState text="ستظهر البطاقات الأعلى تفاعلاً هنا." />}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 p-4">
            <h3 className="text-sm font-black">أكثر الكباتن تفاعلاً</h3>
            <div className="mt-3 space-y-2">
              {analytics.topDrivers.length ? analytics.topDrivers.slice(0, 6).map((item, index) => (
                <div key={item.driverId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm">
                  <span className="truncate font-bold">
                    {index + 1}. {driverTitle(item.driverId)}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-zinc-500">
                    {item.opens} فتح · {item.actions} إجراء
                  </span>
                </div>
              )) : <EmptyState text="ستظهر بطاقات الكباتن الأعلى تفاعلاً هنا." />}
            </div>
          </section>
        </div>

        {(topAction || topPlace || topDriver) && (
          <p className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold leading-7 text-white">
            تحليل سريع: {topAction
              ? `أكثر تفاعل هو «${analyticsActionLabels[topAction.name] ?? topAction.name}» بعدد ${topAction.count}.`
              : ''}
            {topPlace
              ? ` والبطاقة الأعلى تفاعلاً هي «${placeTitle(topPlace.placeId)}».`
              : ''}
            {topDriver
              ? ` والكابتن الأعلى تفاعلاً هو «${driverTitle(topDriver.driverId)}».`
              : ''}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function AnalyticsMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
        <p className="truncate text-[10px] font-semibold text-zinc-400">{detail}</p>
      </div>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-900 shadow-sm">
        {icon}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border border-zinc-200">
      <CardBody className="flex flex-row items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">{label}</p>
          <p className="text-2xl font-black">{value}</p>
        </div>
        <div className="rounded-xl bg-zinc-100 p-3 text-zinc-800">{icon}</div>
      </CardBody>
    </Card>
  );
}

function OrdersTab({ orders }: { orders: Order[] }) {
  return (
    <Card className="border border-zinc-200">
      <CardHeader className="font-black">آخر طلبات التوصيل</CardHeader>
      <CardBody className="gap-2">
        {orders.length ? (
          orders.map((order) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 p-3 text-sm"
            >
              <span className="font-bold">
                #{order.public_code} — {order.recipient_name}
              </span>
              <span>{order.delivery_area}</span>
              <Chip className="bg-zinc-100 text-zinc-700">{order.status}</Chip>
            </div>
          ))
        ) : (
          <EmptyState text="لا توجد طلبات توصيل بعد." />
        )}
      </CardBody>
    </Card>
  );
}

function DirectoryTab({
  places,
  drivers,
  onRefresh,
}: {
  places: Place[];
  drivers: DirectoryDriver[];
  onRefresh: () => void;
}) {
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeModal, setPlaceModal] = useState<{
    mode: 'create' | 'edit';
    place: Place | null;
  } | null>(null);
  const filteredPlaces = places.filter((place) => {
    const query = placeSearch.trim().toLowerCase();
    return !query || place.title.toLowerCase().includes(query) || place.phone.includes(query);
  });

  return (
    <>
      <Tabs
        aria-label="إدارة كيان سيتي سبوت"
        className="kayan-admin-tabs min-w-0"
        classNames={{
          tabList: 'max-w-full overflow-x-auto rounded-2xl bg-zinc-100 p-1 no-scrollbar',
          tab: 'min-h-11 shrink-0 px-4 font-bold',
          cursor: 'bg-zinc-950',
          panel: 'px-0 pt-4',
        }}
      >
        <Tab key="places" title={`الأماكن والخدمات (${places.length})`}>
          <Card className="border border-zinc-200">
            <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-black">
                <Store className="size-5" />
                الأماكن والمطاعم والخدمات المنشورة
              </div>
              <Button
                onPress={() => setPlaceModal({ mode: 'create', place: null })}
                startContent={<Plus className="size-4" />}
                className="bg-zinc-900 font-bold text-white"
              >
                إضافة مكان مباشرة
              </Button>
            </CardHeader>
            <CardBody className="gap-3">
              <Input
                isClearable
                label="بحث بالاسم أو الهاتف"
                value={placeSearch}
                onValueChange={setPlaceSearch}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPlaces.map((place) => (
                  <article key={place.id} className="rounded-xl border border-zinc-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{place.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{place.category}</p>
                        <p className="dir-ltr mt-1 text-right text-xs text-zinc-500">
                          {place.phone}
                        </p>
                      </div>
                      <Button
                        isIconOnly
                        aria-label={`تعديل ${place.title}`}
                        variant="flat"
                        onPress={() => setPlaceModal({ mode: 'edit', place })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              {!filteredPlaces.length && <EmptyState text="لا توجد أماكن مطابقة للبحث." />}
            </CardBody>
          </Card>
        </Tab>
        <Tab key="drivers" title={`الكباتن (${drivers.length})`}>
          <DriverManager drivers={drivers} onRefresh={onRefresh} />
        </Tab>
      </Tabs>

      <EditPlaceModal
        isOpen={Boolean(placeModal)}
        onOpenChange={(open) => {
          if (!open) setPlaceModal(null);
        }}
        mode={placeModal?.mode ?? 'create'}
        place={placeModal?.place ?? null}
        onSuccess={() => {
          setPlaceModal(null);
          onRefresh();
        }}
      />
    </>
  );
}

function feedbackTypeLabel(type: FeedbackRequest['feedback_type']) {
  const labels: Record<FeedbackRequest['feedback_type'], string> = {
    merchant_update: 'تعديل من محل',
    menu_update: 'صور أو منيو',
    phone_change: 'تغيير هاتف',
    details_update: 'جروب أو عنوان',
    report_issue: 'بلاغ بيانات',
    general_suggestion: 'اقتراح',
    rating: 'تقييم',
  };
  return labels[type] ?? type;
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    feedback_applied: 'تم تطبيق تعديل على مكان',
    pending_place_approved: 'تمت الموافقة على إضافة مكان',
    user_provisioned: 'تم إنشاء حساب',
    user_updated: 'تم تحديث حساب وصلاحياته',
    user_deleted: 'تم حذف حساب',
    merchant_change_request_created: 'أرسل محل طلب تعديل',
    merchant_change_request_updated: 'حدّث محل طلب تعديل معلق',
  };
  return labels[action] ?? action;
}

function formatDate(value: string) {
  return formatCairoDateTime(value);
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
      <UserCog className="mx-auto mb-2 size-7" />
      {text}
    </div>
  );
}
