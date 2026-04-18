"use client";
import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { AppSettings } from "@/lib/types";
import { SWEEP_INTERVALS } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import { Save, Send, Bell, BellOff, Trash2, Download, KeyRound, Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<{ status: string; uptime: number; db_size: number; version: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwShow, setPwShow] = useState(false);
  const { toast } = useToast();

  const handleChangePassword = async () => {
    if (!pwForm.current || !pwForm.next) { toast("Fill in all fields", "error"); return; }
    if (pwForm.next !== pwForm.confirm) { toast("New passwords don't match", "error"); return; }
    if (pwForm.next.length < 6) { toast("New password must be at least 6 characters", "error"); return; }
    setPwSaving(true);
    try {
      await api.fetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      });
      toast("Password changed!", "success");
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Incorrect current password", "error");
    } finally {
      setPwSaving(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, healthRes] = await Promise.all([api.getSettings(), api.getHealth()]);
        setSettings(settingsRes.data as unknown as AppSettings);
        setHealth(healthRes);
      } catch {
        toast("Failed to load settings", "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.updateSettings(settings as unknown as Record<string, unknown>);
      toast("Settings saved!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTestAlert = async (channel: string) => {
    if (!settings) return;
    try {
      // Save the relevant webhook value first so backend always uses latest input
      const webhookKey = channel === "slack" ? "slack_webhook"
        : channel === "discord" ? "discord_webhook" : null;
      const webhookValue = webhookKey ? (settings[webhookKey as keyof typeof settings] as string) : undefined;
      if (webhookValue !== undefined) {
        await api.updateSettings({ [webhookKey!]: webhookValue });
      }
      await api.testAlert(channel);
      toast(`Test ${channel} alert sent successfully!`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Test failed", "error");
    }
  };

  const update = (key: string, value: unknown) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const updateTool = (tool: string, enabled: boolean) => {
    setSettings((prev) => prev ? { ...prev, tools: { ...prev.tools, [tool]: enabled } } : prev);
  };

  if (loading || !settings) {
    return (
      <div>
        <Header title="Settings" />
        <div className="text-[var(--text-tertiary)]">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Settings"
        description="Configure monitoring, alerts, and data management"
        actions={
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        }
      />

      <div className="space-y-6 max-w-3xl">
        {/* Monitoring */}
        <Card>
          <CardHeader>
            <CardTitle>Monitoring</CardTitle>
          </CardHeader>
          <div className="space-y-6">
            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">Sweep Interval</label>
              <div className="flex flex-wrap gap-2">
                {SWEEP_INTERVALS.map((si) => (
                  <button
                    key={si.value}
                    onClick={() => update("sweep_interval", si.value)}
                    className={`px-3 py-1.5 rounded-badge text-caption font-medium transition-colors ${
                      settings.sweep_interval === si.value
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {si.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">Tools</label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(settings.tools).map(([tool, enabled]) => (
                  <label key={tool} className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-button cursor-pointer">
                    <span className="text-body text-[var(--text-primary)] capitalize">{tool}</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => updateTool(tool, e.target.checked)}
                      className="rounded"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-button">
              <div>
                <span className="text-body text-[var(--text-primary)]">CT Stream</span>
                <p className="text-caption text-[var(--text-tertiary)]">Real-time certificate transparency monitoring</p>
              </div>
              <input
                type="checkbox"
                checked={settings.ct_stream_enabled}
                onChange={(e) => update("ct_stream_enabled", e.target.checked)}
                className="rounded"
              />
            </div>

            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">Masscan Mode</label>
              <div className="flex gap-3">
                {[
                  { value: "top", label: "Top Ports", desc: "~600 critical ports" },
                  { value: "full", label: "Full Scan", desc: "0-65535 (slower)" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update("masscan_mode", opt.value)}
                    className={`flex-1 p-3 rounded-button text-left transition-colors ${
                      settings.masscan_mode === opt.value
                        ? "bg-[var(--color-accent)] bg-opacity-10 border border-[var(--color-accent)]"
                        : "bg-[var(--bg-tertiary)] border border-[var(--border-default)]"
                    }`}
                  >
                    <div className="text-body font-medium text-[var(--text-primary)]">{opt.label}</div>
                    <div className="text-caption text-[var(--text-tertiary)]">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">
                Masscan Rate: {settings.masscan_rate} pps
              </label>
              <input
                type="range"
                min={500}
                max={10000}
                step={500}
                value={settings.masscan_rate}
                onChange={(e) => update("masscan_rate", Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-caption text-[var(--text-tertiary)]">
                <span>500 pps (safe)</span>
                <span>10,000 pps (aggressive)</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Alerts</CardTitle>
              <button
                onClick={() => update("alerts_paused", !settings.alerts_paused)}
                className={`p-1 rounded transition-colors ${settings.alerts_paused ? "text-[var(--color-critical)]" : "text-[var(--color-low)]"}`}
              >
                {settings.alerts_paused ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </button>
              {settings.alerts_paused && <span className="text-caption text-[var(--color-critical)]">Paused</span>}
            </div>
          </CardHeader>
          <div className="space-y-6">
            {/* Telegram */}
            <div>
              <h4 className="text-subheading text-[var(--text-primary)] mb-3">Telegram</h4>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="text-caption text-[var(--text-tertiary)] mb-1 block">API Key</label>
                  <Input
                    type="password"
                    placeholder="Bot API Key"
                    value={settings.telegram_api_key}
                    onChange={(e) => update("telegram_api_key", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-caption text-[var(--text-tertiary)] mb-1 block">Chat ID</label>
                  <Input
                    placeholder="Chat ID"
                    value={settings.telegram_chat_id}
                    onChange={(e) => update("telegram_chat_id", e.target.value)}
                  />
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleTestAlert("telegram")}>
                <Send className="w-3.5 h-3.5" /> Send Test
              </Button>
              {" "}<Button variant="ghost" size="sm" onClick={async () => {
                try {
                  await api.fetch("/api/elite/alerts/test", { method: "POST" });
                  toast("Elite test alert sent!", "success");
                } catch { toast("Failed - check bot token & chat ID", "error"); }
              }}>
                <Send className="w-3.5 h-3.5" /> Test Elite Alert
              </Button>
            </div>

            {/* Discord */}
            <div>
              <h4 className="text-subheading text-[var(--text-primary)] mb-3">Discord</h4>
              <Input
                type="password"
                placeholder="Webhook URL"
                value={settings.discord_webhook}
                onChange={(e) => update("discord_webhook", e.target.value)}
                className="mb-2"
              />
              <Button variant="ghost" size="sm" onClick={() => handleTestAlert("discord")}>
                <Send className="w-3.5 h-3.5" /> Send Test
              </Button>
            </div>

            {/* Slack */}
            <div>
              <h4 className="text-subheading text-[var(--text-primary)] mb-3">Slack</h4>
              <Input
                type="password"
                placeholder="Webhook URL"
                value={settings.slack_webhook}
                onChange={(e) => update("slack_webhook", e.target.value)}
                className="mb-2"
              />
              <Button variant="ghost" size="sm" onClick={() => handleTestAlert("slack")}>
                <Send className="w-3.5 h-3.5" /> Send Test
              </Button>
            </div>
          </div>
        </Card>


        {/* LeakIX */}
        <Card>
          <CardHeader>
            <CardTitle>LeakIX</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">API Key</label>
              <Input
                type="password"
                placeholder="LeakIX API Key"
                value={settings.leakix_api_key || ""}
                onChange={(e) => update("leakix_api_key", e.target.value)}
              />
              <p className="text-caption text-[var(--text-tertiary)] mt-1">Used for domain leak scanning. Get one at leakix.net</p>
            </div>
            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">Poll Interval</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 3600, label: "1 hour" },
                  { value: 21600, label: "6 hours" },
                  { value: 43200, label: "12 hours" },
                  { value: 86400, label: "24 hours" },
                ].map((si) => (
                  <button
                    key={si.value}
                    onClick={() => update("leakix_poll_interval", si.value)}
                    className={`px-3 py-1.5 rounded-badge text-caption font-medium transition-colors ${
                      settings.leakix_poll_interval === si.value
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {si.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>


        {/* GitHub */}
        <Card>
          <CardHeader>
            <CardTitle>GitHub</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">Personal Access Token</label>
              <Input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={settings.github_token || ""}
                onChange={(e) => update("github_token", e.target.value)}
              />
              <p className="text-caption text-[var(--text-tertiary)] mt-1">
                Required for GitHub secret scanning via trufflehog. Needs <code>repo</code> scope.
                Get one at github.com/settings/tokens
              </p>
            </div>
          </div>
        </Card>

        {/* Shodan */}
        <Card>
          <CardHeader>
            <CardTitle>Shodan</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">API Key</label>
              <Input
                type="password"
                placeholder="Shodan API Key"
                value={settings.shodan_api_key || ""}
                onChange={(e) => update("shodan_api_key", e.target.value)}
              />
              <p className="text-caption text-[var(--text-tertiary)] mt-1">
                Used for favicon hash lookups and IP intelligence. Get one at shodan.io/account
              </p>
            </div>
          </div>
        </Card>


        {/* Anthropic (AI Hunter) */}
        <Card>
          <CardHeader>
            <CardTitle>Anthropic — AI Hunter</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">API Key</label>
              <Input
                type="password"
                placeholder="sk-ant-api03-..."
                value={settings.anthropic_api_key || ""}
                onChange={(e) => update("anthropic_api_key", e.target.value)}
              />
              <p className="text-caption text-[var(--text-tertiary)] mt-1">
                Powers the AI Hunter agent. Get one at console.anthropic.com
              </p>
            </div>
          </div>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
          </CardHeader>
          <div className="space-y-4 max-w-sm">
            <div>
              <label className="text-caption text-[var(--text-tertiary)] mb-1 block">Current Password</label>
              <div className="relative">
                <Input
                  type={pwShow ? "text" : "password"}
                  placeholder="Current password"
                  value={pwForm.current}
                  onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                />
                <button type="button" onClick={() => setPwShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  {pwShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-caption text-[var(--text-tertiary)] mb-1 block">New Password</label>
              <Input
                type={pwShow ? "text" : "password"}
                placeholder="New password"
                value={pwForm.next}
                onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-caption text-[var(--text-tertiary)] mb-1 block">Confirm New Password</label>
              <Input
                type={pwShow ? "text" : "password"}
                placeholder="Confirm new password"
                value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
              />
            </div>
            <Button onClick={handleChangePassword} disabled={pwSaving}>
              <KeyRound className="w-4 h-4" /> {pwSaving ? "Saving..." : "Change Password"}
            </Button>
          </div>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => window.open(api.getExportUrl("json"), "_blank")}>
                <Download className="w-4 h-4" /> Export Database (JSON)
              </Button>
            </div>

            <div className="pt-4 border-t border-[var(--border-default)]">
              <h4 className="text-subheading text-[var(--color-critical)] mb-2">Danger Zone</h4>
              <p className="text-caption text-[var(--text-tertiary)] mb-3">
                Type DELETE to confirm database reset
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Type DELETE"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  variant="danger"
                  disabled={deleteConfirm !== "DELETE"}
                  onClick={() => toast("Database reset not implemented in web UI for safety", "info")}
                >
                  <Trash2 className="w-4 h-4" /> Reset Database
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          {health && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-caption text-[var(--text-tertiary)] block">Version</span>
                <span className="text-body text-[var(--text-primary)]">{health.version}</span>
              </div>
              <div>
                <span className="text-caption text-[var(--text-tertiary)] block">Status</span>
                <span className="text-body text-[var(--color-low)]">{health.status}</span>
              </div>
              <div>
                <span className="text-caption text-[var(--text-tertiary)] block">Uptime</span>
                <span className="text-body text-[var(--text-primary)]">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span>
              </div>
              <div>
                <span className="text-caption text-[var(--text-tertiary)] block">Database Size</span>
                <span className="text-body text-[var(--text-primary)]">{formatBytes(health.db_size)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
