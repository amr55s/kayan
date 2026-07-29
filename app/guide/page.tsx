import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Bike,
  Building2,
  CheckCircle2,
  Heart,
  Images,
  MapPin,
  MessageCircle,
  Search,
  Share2,
  Store,
  UserRound,
} from 'lucide-react';
import { PublicPageHeader } from '@/components/layout/PublicPageHeader';
import { GuideAnalytics } from '@/components/marketing/GuideAnalytics';

export const metadata: Metadata = {
  title: 'طريقة استخدام كيان سيتي سبوت',
  description: 'شرح استخدام دليل كيان للسكان والمحلات وكباتن التوصيل.',
};

const residentSteps = [
  { icon: Search, title: 'ابحث أو اختر تصنيفًا', text: 'اكتب اسم المكان أو الخدمة أو تصفح المطاعم والمحلات والخدمات.' },
  { icon: Images, title: 'افتح البطاقة', text: 'شاهد الصور كاملة والوصف والجروب والعنوان والخريطة عند توفرها.' },
  { icon: MessageCircle, title: 'تواصل مباشرة', text: 'اتصل أو افتح WhatsApp من داخل البطاقة بدون وسيط أو عمولة.' },
  { icon: Heart, title: 'احفظ وساعد غيرك', text: 'أضف للمفضلة، رشّح المكان، أو شارك رابطه مع جيرانك.' },
];

function StepCard({ icon: Icon, title, text, index }: {
  icon: typeof Search;
  title: string;
  text: string;
  index: number;
}) {
  return (
    <article className="rounded-3xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-zinc-950 text-white">
          <Icon className="size-5" />
        </span>
        <bdi className="text-sm font-black text-zinc-300">{String(index).padStart(2, '0')}</bdi>
      </div>
      <h3 className="mt-4 font-black">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-zinc-600">{text}</p>
    </article>
  );
}

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <GuideAnalytics page="guide" />
      <PublicPageHeader current="guide" />
      <main id="main-content">
        <section className="border-b border-zinc-200 bg-white px-4 py-12 text-center sm:py-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2 text-xs font-black">
            <CheckCircle2 className="size-4 text-emerald-600" />
            سهل، محلي، وبدون عمولات
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">
            كل حاجة في كيان سيتي سبوت واضحة من أول ضغطة
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-600 sm:text-base">
            اختر القسم المناسب لك واعرف إزاي تبحث، تضيف نشاطك، أو تبدأ ككابتن توصيل.
          </p>
        </section>

        <div className="mx-auto max-w-7xl space-y-12 px-3 py-10 sm:px-6">
          <section aria-labelledby="residents-title">
            <div className="mb-5 flex items-center gap-3">
              <UserRound className="size-6" />
              <h2 id="residents-title" className="text-2xl font-black">للسكان والمستخدمين</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {residentSteps.map((step, index) => <StepCard key={step.title} {...step} index={index + 1} />)}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-[32px] bg-zinc-950 p-6 text-white sm:p-8">
              <Store className="size-9" />
              <h2 className="mt-5 text-2xl font-black">للمحلات والخدمات</h2>
              <ol className="mt-5 space-y-3 text-sm leading-7 text-zinc-300">
                <li>1. اضغط «انضم» ثم «طلب حساب محل أو خدمة».</li>
                <li>2. أضف الاسم والتصنيف ورقم التواصل وصورًا واضحة.</li>
                <li>3. الإدارة تراجع البيانات قبل ظهورها للعامة.</li>
                <li>4. بعد تفعيل حساب المحل يمكنك تحديث البطاقة والصور مباشرة.</li>
                <li>5. شارك رابط بطاقتك مع العملاء؛ الإضافة والتواصل بدون عمولات.</li>
              </ol>
              <Link href="/?register=place" className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-white px-5 text-sm font-black text-zinc-950">
                أضف محلك أو خدمتك
              </Link>
            </article>

            <article className="rounded-[32px] border border-zinc-200 bg-white p-6 sm:p-8">
              <Bike className="size-9" />
              <h2 className="mt-5 text-2xl font-black">لكباتن التوصيل</h2>
              <ol className="mt-5 space-y-3 text-sm leading-7 text-zinc-600">
                <li>1. اضغط «انضم» ثم «طلب حساب كابتن توصيل».</li>
                <li>2. اكتب اسمك ورقمك ونوع المركبة بدقة.</li>
                <li>3. بعد الموافقة افتح لوحة الكابتن وحدّث حالة تواجدك.</li>
                <li>4. السكان يتصلون أو يرسلون WhatsApp مباشرة من بطاقتك.</li>
                <li>5. شارك رابط بطاقتك وحدث بياناتك عند أي تغيير.</li>
              </ol>
              <Link href="/?register=driver" className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-zinc-950 px-5 text-sm font-black text-white">
                اطلب حساب كابتن
              </Link>
            </article>
          </section>

          <section id="corrections" className="rounded-[32px] border border-amber-200 bg-amber-50 p-6 sm:p-8">
            <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <h2 className="text-xl font-black">مكان ناقص أو معلومة اتغيرت؟</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-amber-950/75">
                  أضف المكان من الصفحة الرئيسية، أو افتح بطاقته واضغط اقتراح تعديل. أي تعديل من الجمهور يظل تحت المراجعة قبل النشر.
                </p>
              </div>
              <Link href="/" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-black text-white">
                <MapPin className="size-4" />
                افتح الدليل
              </Link>
            </div>
          </section>

          <section className="rounded-[32px] bg-emerald-600 p-6 text-white sm:p-8">
            <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <h2 className="text-2xl font-black">ساعدنا نوصل لكل جار</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-emerald-50">
                  نزّل بطاقة جاهزة أو شارك أحدث الأماكن والكباتن في جروب عمارتك.
                </p>
              </div>
              <Link href="/share" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-emerald-800">
                <Share2 className="size-4" />
                شارك كيان
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
