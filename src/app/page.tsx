import Link from 'next/link';

const features = [
  {
    title: 'إدارة الخطوط',
    description: 'تابع كل الخطوط وحالتها والباقات المرتبطة بها من مكان واحد.',
    icon: (
      <path d="M8 2.75h8A2.25 2.25 0 0 1 18.25 5v14A2.25 2.25 0 0 1 16 21.25H8A2.25 2.25 0 0 1 5.75 19V5A2.25 2.25 0 0 1 8 2.75ZM9.5 18h5M9 6h6" />
    ),
  },
  {
    title: 'حسابات العملاء',
    description: 'بيانات منظمة وسهلة الوصول لكل عميل وموزع داخل شركتك.',
    icon: (
      <>
        <path d="M16 19.25v-1.5A3.75 3.75 0 0 0 12.25 14h-5.5A3.75 3.75 0 0 0 3 17.75v1.5" />
        <circle cx="9.5" cy="7.5" r="3.25" />
        <path d="M17 10.75a3 3 0 0 0 0-6M20.5 19.25v-1.5a3.5 3.5 0 0 0-2.5-3.35" />
      </>
    ),
  },
  {
    title: 'متابعة المدفوعات',
    description: 'راقب التحصيلات والالتزامات والنتائج المالية بصورة لحظية.',
    icon: (
      <>
        <rect x="2.75" y="5" width="18.5" height="14" rx="2.5" />
        <path d="M2.75 9.5h18.5M7 15h3" />
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <main className="public-shell min-h-screen overflow-hidden text-white">
      <div className="public-grid" aria-hidden="true" />
      <div className="public-orb public-orb-one" aria-hidden="true" />
      <div className="public-orb public-orb-two" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 py-5">
          <Link href="/" className="flex items-center gap-3" aria-label="فايف جي ستور - الرئيسية">
            <span className="brand-mark">5G</span>
            <span className="text-lg font-black tracking-tight sm:text-xl">فايف جي ستور</span>
          </Link>

          <Link
            href="/login"
            className="rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-bold backdrop-blur transition hover:border-white/30 hover:bg-white/15"
          >
            تسجيل الدخول
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.1fr_.9fr] lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-bold text-emerald-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
              نظام متكامل لإدارة نشاطك
            </div>

            <h1 className="text-4xl leading-[1.25] font-black tracking-tight sm:text-6xl lg:text-7xl">
              كل شغلك تحت السيطرة،
              <span className="hero-gradient block">بوضوح وسرعة.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              منصة واحدة لإدارة خطوط المحمول والعملاء والموزعين والمدفوعات، بتجربة بسيطة
              تساعدك تتخذ القرار الصح في الوقت الصح.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="primary-cta inline-flex items-center justify-center gap-3 rounded-2xl px-7 py-4 font-extrabold"
              >
                ابدأ إدارة متجرك
                <svg className="h-5 w-5 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 px-7 py-4 font-bold text-slate-200 transition hover:bg-white/8"
              >
                اكتشف المميزات
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="dashboard-preview">
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <div>
                  <p className="text-xs text-slate-400">نظرة عامة</p>
                  <p className="mt-1 font-extrabold">لوحة المتابعة</p>
                </div>
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-white/15" />
                  <span className="h-2 w-2 rounded-full bg-white/15" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5">
                <div className="preview-card">
                  <span className="preview-label">الخطوط النشطة</span>
                  <strong className="preview-number">1,284</strong>
                  <span className="preview-growth">+12.5%</span>
                </div>
                <div className="preview-card">
                  <span className="preview-label">التحصيلات</span>
                  <strong className="preview-number">92K</strong>
                  <span className="preview-growth">+8.2%</span>
                </div>
                <div className="col-span-2 rounded-2xl border border-white/8 bg-white/4 p-4">
                  <div className="mb-5 flex items-center justify-between text-xs">
                    <span className="text-slate-300">الأداء الشهري</span>
                    <span className="text-slate-500">آخر 6 شهور</span>
                  </div>
                  <div className="flex h-28 items-end gap-3" aria-hidden="true">
                    {[38, 52, 45, 68, 61, 88, 74, 96].map((height, index) => (
                      <span
                        key={height + index}
                        className="chart-bar"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-chip -right-3 -bottom-5 sm:-right-8">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">✓</span>
              <div>
                <p className="text-[10px] text-slate-400">حالة النظام</p>
                <p className="text-sm font-extrabold">كل شيء يعمل</p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="grid gap-4 border-t border-white/10 py-10 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="feature-card">
              <span className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  {feature.icon}
                </svg>
              </span>
              <div>
                <h2 className="font-extrabold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{feature.description}</p>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
