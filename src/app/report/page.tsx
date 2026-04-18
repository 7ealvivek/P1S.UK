"use client";
import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { FileText, Copy, Send } from "lucide-react";

const VULN_TYPES = ["XSS", "SQLi", "SSRF", "IDOR", "RCE", "Auth Bypass", "Info Disclosure", "Other"];
const SEVERITIES = [
  { value: "P1", label: "P1 — Critical" },
  { value: "P2", label: "P2 — High" },
  { value: "P3", label: "P3 — Medium" },
  { value: "P4", label: "P4 — Low" },
];

export default function ReportPage() {
  const [form, setForm] = useState({
    program: "",
    subdomain: "",
    vuln_type: "XSS",
    severity: "P2",
    description: "",
    poc: "",
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState("");
  const { toast } = useToast();

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const generate = async () => {
    if (!form.description.trim()) {
      toast("Please enter a description", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.fetch<any>("/api/elite/report/generate", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setReport((res as any).data?.report || "");
      toast("Report generated!", "success");
    } catch {
      toast("Failed to generate report", "error");
    } finally {
      setLoading(false);
    }
  };

  const copyReport = () => {
    navigator.clipboard.writeText(report);
    toast("Copied to clipboard!", "success");
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Report Generator"
        description="Generate formatted bug bounty reports ready for submission"
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
          {/* Form */}
          <div className="space-y-4">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-5 space-y-4">
              <h3 className="text-heading text-[var(--text-primary)]">Vulnerability Details</h3>

              <div>
                <label className="text-caption text-[var(--text-secondary)] mb-1.5 block">Program Name</label>
                <Input
                  placeholder="e.g. HackerOne — Shopify"
                  value={form.program}
                  onChange={(e) => update("program", e.target.value)}
                />
              </div>

              <div>
                <label className="text-caption text-[var(--text-secondary)] mb-1.5 block">Target Subdomain</label>
                <Input
                  placeholder="e.g. api.example.com"
                  value={form.subdomain}
                  onChange={(e) => update("subdomain", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-caption text-[var(--text-secondary)] mb-1.5 block">Vulnerability Type</label>
                  <select
                    value={form.vuln_type}
                    onChange={(e) => update("vuln_type", e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)]"
                  >
                    {VULN_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-caption text-[var(--text-secondary)] mb-1.5 block">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) => update("severity", e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)]"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-caption text-[var(--text-secondary)] mb-1.5 block">Description</label>
                <textarea
                  placeholder="Describe the vulnerability and its impact..."
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  rows={4}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)] resize-y"
                />
              </div>

              <div>
                <label className="text-caption text-[var(--text-secondary)] mb-1.5 block">PoC Steps</label>
                <textarea
                  placeholder={`1. Navigate to https://target.com/endpoint\n2. Send request with payload: ...\n3. Observe response...`}
                  value={form.poc}
                  onChange={(e) => update("poc", e.target.value)}
                  rows={5}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)] resize-y font-mono text-caption"
                />
              </div>

              <Button variant="primary" onClick={generate} disabled={loading} className="w-full">
                {loading ? (
                  <>Generating...</>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Report output */}
          <div className="space-y-3">
            {report ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-heading text-[var(--text-primary)] flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Generated Report
                  </h3>
                  <Button variant="ghost" size="sm" onClick={copyReport}>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
                  <pre className="p-4 text-caption text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-[70vh]">
                    {report}
                  </pre>
                </div>
              </>
            ) : (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-12 text-center">
                <FileText className="w-12 h-12 text-[var(--text-tertiary)] mx-auto mb-3" />
                <p className="text-[var(--text-secondary)]">Fill in the form and generate a report</p>
                <p className="text-caption text-[var(--text-tertiary)] mt-1">
                  The report will be formatted and ready for bug bounty submission
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
