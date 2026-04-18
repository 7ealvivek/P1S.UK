"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Plus, Pencil, Trash2, ExternalLink, DollarSign, ClipboardList } from "lucide-react";

type Severity = "P1" | "P2" | "P3" | "P4";
type Status = "new" | "reported" | "triaged" | "accepted" | "paid" | "rejected" | "duplicate";

interface Finding {
  id: number;
  title: string;
  target: string;
  program: string;
  bug_type: string;
  severity: Severity;
  status: Status;
  cvss: number | null;
  bounty: number | null;
  notes: string | null;
  poc: string | null;
  reported_at: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  total_bounty: number;
}

const SEVERITY_VARIANT: Record<Severity, string> = {
  P1: "critical", P2: "high", P3: "medium", P4: "low",
};

const STATUS_VARIANT: Record<Status, string> = {
  new: "info", reported: "accent", triaged: "medium", accepted: "low",
  paid: "low", rejected: "default", duplicate: "default",
};

const BUG_TYPES = [
  "SSRF", "RCE", "SQLi", "XSS", "IDOR", "Auth Bypass", "Privilege Escalation",
  "Information Disclosure", "Open Redirect", "CSRF", "XXE", "Path Traversal",
  "Broken Access Control", "Business Logic", "API Vulnerability", "Other",
];

const EMPTY: Partial<Finding> = {
  title: "", target: "", program: "", bug_type: "SSRF", severity: "P1",
  status: "new", cvss: null, bounty: null, notes: "", poc: "", reported_at: "",
};

export default function FindingsPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Finding | null>(null);
  const [form, setForm] = useState<Partial<Finding>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (severityFilter) params.severity = severityFilter;
      if (statusFilter) params.status = statusFilter;
      const [fRes, sRes] = await Promise.all([
        api.fetch<any>("/api/findings?" + new URLSearchParams(params)),
        api.fetch<any>("/api/findings/stats"),
      ]);
      setFindings((fRes as any).data || []);
      setStats((sRes as any).data as Stats);
    } finally {
      setLoading(false);
    }
  }, [search, severityFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (f: Finding) => { setEditing(f); setForm({ ...f }); setModalOpen(true); };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.fetch<any>(`/api/findings/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast("Finding updated", "success");
      } else {
        await api.fetch<any>("/api/findings", { method: "POST", body: JSON.stringify(form) });
        toast("Finding added", "success");
      }
      setModalOpen(false);
      load();
    } catch {
      toast("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this finding?")) return;
    await api.fetch<any>(`/api/findings/${id}`, { method: "DELETE" });
    toast("Deleted", "success");
    load();
  };

  const field = (k: keyof Finding) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="flex flex-col h-full">
      <Header title="Findings Tracker" description="Manual bug bounty report management" />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Total</div>
            </div>
            {(["P1","P2","P3","P4"] as Severity[]).map(s => (
              <div key={s} className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
                <div className={`text-2xl font-bold text-[var(--color-${SEVERITY_VARIANT[s]})]`}>{stats.by_severity[s] || 0}</div>
                <div className="text-caption text-[var(--text-tertiary)]">{s}</div>
              </div>
            ))}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center col-span-2 md:col-span-1">
              <div className="text-2xl font-bold text-[var(--color-low)]">${(stats.total_bounty || 0).toLocaleString()}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Total Bounty</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="w-52" />
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-secondary)]">
              <option value="">All Severities</option>
              {["P1","P2","P3","P4"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-secondary)]">
              <option value="">All Statuses</option>
              {["new","reported","triaged","accepted","paid","rejected","duplicate"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <Button onClick={openNew} variant="primary" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Finding
          </Button>
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)]">
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Title</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Program</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Type</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Severity</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Status</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Bounty</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Reported</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
              ) : findings.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No findings yet. Add your first bug.
                </td></tr>
              ) : findings.map(f => (
                <tr key={f.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--text-primary)]">{f.title}</div>
                    <div className="text-caption text-[var(--text-tertiary)]">{f.target}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{f.program}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{f.bug_type}</td>
                  <td className="px-4 py-3">
                    <Badge variant={SEVERITY_VARIANT[f.severity] as any}>{f.severity}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[f.status] as any}>{f.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-low)]">
                    {f.bounty ? `$${f.bounty.toLocaleString()}` : "-"}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-tertiary)] text-caption">
                    {f.reported_at ? new Date(f.reported_at).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {f.poc && (
                        <a href={f.poc} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)]">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => openEdit(f)}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(f.id)}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-critical)]">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? "Edit Finding" : "Add Finding"}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Title *</label>
              <Input value={form.title || ""} onChange={field("title")} placeholder="SSRF in payment endpoint" />
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Target</label>
              <Input value={form.target || ""} onChange={field("target")} placeholder="api.example.com" />
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Program</label>
              <Input value={form.program || ""} onChange={field("program")} placeholder="HackerOne / Bugcrowd" />
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Bug Type</label>
              <select value={form.bug_type || "SSRF"} onChange={field("bug_type")}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)]">
                {BUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Severity</label>
              <select value={form.severity || "P1"} onChange={field("severity")}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)]">
                {["P1","P2","P3","P4"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Status</label>
              <select value={form.status || "new"} onChange={field("status")}
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)]">
                {["new","reported","triaged","accepted","paid","rejected","duplicate"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">CVSS Score</label>
              <Input type="number" value={form.cvss ?? ""} onChange={field("cvss")} placeholder="9.8" />
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Bounty ($)</label>
              <Input type="number" value={form.bounty ?? ""} onChange={field("bounty")} placeholder="5000" />
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Reported At</label>
              <Input type="date" value={form.reported_at || ""} onChange={field("reported_at")} />
            </div>
            <div>
              <label className="block text-caption text-[var(--text-secondary)] mb-1">PoC URL</label>
              <Input value={form.poc || ""} onChange={field("poc")} placeholder="https://hackerone.com/reports/..." />
            </div>
            <div className="md:col-span-2">
              <label className="block text-caption text-[var(--text-secondary)] mb-1">Notes</label>
              <textarea value={form.notes || ""} onChange={field("notes")}
                rows={3} placeholder="Impact, steps to reproduce..."
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)] resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : editing ? "Update" : "Add Finding"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
