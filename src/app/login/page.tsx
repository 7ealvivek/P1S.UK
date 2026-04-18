"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Shield, Zap, Globe, Target, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

interface Stats {
  total_subdomains: number;
  total_domains: number;
  live_subdomains: number;
  total_vulnerabilities: number;
}

function AnimatedCounter({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const ref = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (target === 0) return;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    let step = 0;
    ref.current = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), target);
      setValue(current);
      if (step >= steps) clearInterval(ref.current!);
    }, duration / steps);
    return () => clearInterval(ref.current!);
  }, [target, duration]);

  return <span>{value.toLocaleString()}</span>;
}

const FEATURES = [
  {
    icon: Globe,
    title: "Continuous Subdomain Discovery",
    desc: "CT log streaming, brute-force, and passive recon — new assets found within minutes of going live.",
  },
  {
    icon: Zap,
    title: "Nuclei-Powered Vuln Scanning",
    desc: "Automated scanning with 9,000+ templates against every live host, scoped to your targets.",
  },
  {
    icon: Target,
    title: "Admin Panel & Exposure Detection",
    desc: "Real-time detection of exposed admin panels, .env files, secrets, and misconfigured endpoints.",
  },
  {
    icon: Shield,
    title: "JS Secret Extraction",
    desc: "Katana crawls every live host and extracts API keys, tokens, and credentials from JavaScript.",
  },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingFirst, setCheckingFirst] = useState(true);
  const [stats, setStats] = useState<Stats>({ total_subdomains: 0, total_domains: 0, live_subdomains: 0, total_vulnerabilities: 0 });
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const check = async () => {
      try {
        await api.getMe();
        router.push("/");
        return;
      } catch {}
      setCheckingFirst(false);
    };
    check();

    // Fetch public-ish stats — will 401 if locked, just show zeros
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((d) => {
        const s = d?.data || d;
        setStats({
          total_subdomains: s.total_subdomains || 0,
          total_domains: s.total_domains || 0,
          live_subdomains: s.live_subdomains || 0,
          total_vulnerabilities: s.total_vulnerabilities || 0,
        });
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      if (isRegister) {
        await api.register(username, password);
        toast("Account created! Welcome to P1 Warriors.", "success");
      } else {
        await api.login(username, password);
        toast("Logged in successfully.", "success");
      }
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      if (msg.includes("Registration disabled")) {
        setIsRegister(false);
        toast("User already exists. Please log in.", "info");
      } else {
        toast(msg, "error");
        if (!isRegister && msg.includes("Invalid credentials")) setIsRegister(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingFirst) return null;

  return (
    <div className="min-h-screen flex" style={{ background: "#f4f6fb", fontFamily: "'Inter', sans-serif" }}>
      {/* ── LEFT PANEL ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[58%] relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f1629 0%, #1a2744 50%, #0d2137 100%)" }}
      >
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Glow accents */}
        <div
          className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full opacity-[0.12]"
          style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)", transform: "translate(-30%, -30%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)", transform: "translate(30%, 30%)" }}
        />

        <div className="relative z-10 p-12">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
            >
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">P1 Warriors</span>
          </div>

          {/* Hero text */}
          <div className="mb-14">
            <h1
              className="text-white font-extrabold leading-[1.1] mb-5"
              style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", letterSpacing: "-0.03em" }}
            >
              Bug Bounty Recon,
              <br />
              <span style={{ color: "#60a5fa" }}>Automated at Scale.</span>
            </h1>
            <p className="text-blue-200 text-lg leading-relaxed opacity-80 max-w-md">
              Continuously monitor your attack surface, detect exposed assets, and surface critical vulnerabilities — before attackers do.
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-6 mb-14">
            {[
              { label: "Subdomains", value: stats.total_subdomains },
              { label: "Live Hosts", value: stats.live_subdomains },
              { label: "Domains", value: stats.total_domains },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-2xl p-5"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}
              >
                <div className="text-white font-bold text-3xl mb-1">
                  <AnimatedCounter target={value} />
                </div>
                <div className="text-blue-300 text-sm opacity-70">{label}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 items-start">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.25)" }}
                >
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm mb-0.5">{title}</div>
                  <div className="text-blue-200 text-sm opacity-60 leading-snug">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom badge */}
        <div className="relative z-10 px-12 pb-10">
          <div className="flex items-center gap-2 text-blue-300 text-xs opacity-50">
            <Lock className="w-3 h-3" />
            <span>Private platform · Authorized users only</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (LOGIN) ── */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: "#ffffff" }}>
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
            >
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">P1 Warriors</span>
          </div>

          <div className="mb-8">
            <h2 className="text-gray-900 font-bold text-3xl mb-2" style={{ letterSpacing: "-0.02em" }}>
              {isRegister ? "Create account" : "Welcome back"}
            </h2>
            <p className="text-gray-500 text-sm">
              {isRegister ? "Set up your admin access." : "Sign in to your recon dashboard."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                style={{
                  background: "#f8fafc",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: "10px",
                  height: "44px",
                  color: "#0f172a",
                  fontSize: "15px",
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    background: "#f8fafc",
                    border: "1.5px solid #e2e8f0",
                    borderRadius: "10px",
                    height: "44px",
                    color: "#0f172a",
                    fontSize: "15px",
                    paddingRight: "44px",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#94a3b8" }}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 font-semibold text-white rounded-xl transition-all"
              style={{
                height: "46px",
                fontSize: "15px",
                background: loading || !username || !password
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #2563eb, #4f46e5)",
                cursor: loading || !username || !password ? "not-allowed" : "pointer",
                boxShadow: loading || !username || !password ? "none" : "0 4px 16px rgba(37,99,235,0.3)",
              }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {isRegister ? "Create Account" : "Sign In"}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-sm text-gray-400 hover:text-blue-600 transition-colors"
            >
              {isRegister ? "Already have an account? Sign in" : "First time? Create an account"}
            </button>
          </div>

          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              P1 Warriors · Private Bug Bounty Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
