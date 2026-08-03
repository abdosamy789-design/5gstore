'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';

const LoginPageComponent: React.FC = () => {
    const { login, isLoading } = useApi();
    const { translations } = useLanguage();
    const router = useRouter();
    
    const [activeTab, setActiveTab] = useState<'admin' | 'agent'>('admin');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        const loginPassword = activeTab === 'admin' ? password : undefined;
        const user = await login(username, loginPassword);
        
        if (user) {
            if (user.role === 'admin') {
                router.push('/companies');
            } else {
                router.push('/dashboard');
            }
        } else {
            setError(translations.loginError);
        }
    };

    return (
        <main className="public-shell relative min-h-screen overflow-hidden text-white">
            <div className="public-grid" aria-hidden="true" />
            <div className="public-orb public-orb-one" aria-hidden="true" />
            <div className="public-orb public-orb-two" aria-hidden="true" />

            <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_30rem] lg:px-12">
                <section className="hidden max-w-2xl lg:block">
                    <Link href="/" className="mb-16 inline-flex items-center gap-3">
                        <span className="brand-mark">5G</span>
                        <span className="text-xl font-black">فايف جي ستور</span>
                    </Link>

                    <p className="mb-4 text-sm font-extrabold tracking-wide text-blue-300">
                        إدارة أذكى، نتائج أوضح
                    </p>
                    <h1 className="text-5xl leading-[1.25] font-black">
                        ارجع لمركز تحكمك
                        <span className="hero-gradient block">وكمّل من مكانك.</span>
                    </h1>
                    <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
                        سجّل دخولك للوصول إلى العملاء والخطوط والتقارير المالية ومتابعة كل تفاصيل نشاطك.
                    </p>

                    <div className="mt-12 grid max-w-lg grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-white/8 bg-white/4 p-5">
                            <svg className="mb-4 h-6 w-6 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                                <path d="m9 12 2 2 4-4" />
                            </svg>
                            <p className="font-extrabold">دخول آمن</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">حماية وصولك وبيانات شركتك.</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/4 p-5">
                            <svg className="mb-4 h-6 w-6 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M3 3v18h18" />
                                <path d="m7 15 4-4 3 3 5-7" />
                            </svg>
                            <p className="font-extrabold">بيانات لحظية</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">كل الأرقام المهمة أمامك فورًا.</p>
                        </div>
                    </div>
                </section>

                <section className="login-panel mx-auto w-full max-w-md rounded-[2rem] p-5 sm:p-8">
                    <div className="mb-8 flex items-center justify-between lg:hidden">
                        <Link href="/" className="flex items-center gap-3">
                            <span className="brand-mark">5G</span>
                            <span className="font-black">فايف جي ستور</span>
                        </Link>
                    </div>

                    <div className="mb-7">
                        <p className="text-sm font-bold text-blue-300">أهلًا بك من جديد</p>
                        <h2 className="mt-2 text-3xl font-black">تسجيل الدخول</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                            اختر نوع الحساب وأدخل بياناتك للمتابعة.
                        </p>
                    </div>

                    <div className="mb-7 grid grid-cols-2 rounded-xl border border-white/8 bg-black/15 p-1">
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('admin');
                                setError('');
                            }}
                            className={`rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${
                                activeTab === 'admin'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            مدير النظام
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('agent');
                                setError('');
                            }}
                            className={`rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${
                                activeTab === 'agent'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            موظف
                        </button>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label htmlFor="username" className="mb-2 block text-sm font-bold text-slate-200">
                                {translations.username}
                            </label>
                            <div className="relative">
                                <svg className="absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <circle cx="12" cy="8" r="4" />
                                    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
                                </svg>
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    className="login-input pr-12"
                                    placeholder="اكتب اسم المستخدم"
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>

                        {activeTab === 'admin' && (
                            <div>
                                <label htmlFor="password" className="mb-2 block text-sm font-bold text-slate-200">
                                    {translations.password}
                                </label>
                                <div className="relative">
                                    <svg className="absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                        <rect x="4" y="10" width="16" height="11" rx="2" />
                                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                                    </svg>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className="login-input px-12"
                                        placeholder="اكتب كلمة المرور"
                                        autoComplete="current-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((current) => !current)}
                                        className="absolute top-1/2 left-3 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
                                        aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                    >
                                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                                            <circle cx="12" cy="12" r="2.5" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div role="alert" className="rounded-xl border border-red-400/15 bg-red-400/8 px-4 py-3 text-center text-sm font-bold text-red-300">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="primary-cta flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 font-extrabold disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    جاري الدخول...
                                </>
                            ) : (
                                <>
                                    دخول إلى لوحة التحكم
                                    <svg className="h-5 w-5 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="m9 18 6-6-6-6" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                        </svg>
                        اتصال آمن ومحمي
                    </div>
                </section>
            </div>
        </main>
    );
};

export default function LoginPage() {
    return <LoginPageComponent />;
}
