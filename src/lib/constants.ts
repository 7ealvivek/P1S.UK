export const NAV_ITEMS_PRIMARY = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Subdomains", href: "/subdomains", icon: "Globe" },
  { label: "JS Analysis", href: "/js-analysis", icon: "FileCode" },
  { label: "Dep Confusion", href: "/intel", icon: "Package" },
  { label: "Recon", href: "/recon", icon: "Crosshair" },
  { label: "Takeovers", href: "/takeovers", icon: "AlertTriangle" },
  { label: "AI Hunter", href: "/ai-hunter", icon: "Bug" },
  { label: "Alert Hunter", href: "/alert-hunter", icon: "Zap" },
  { label: "Settings", href: "/settings", icon: "Settings" },
] as const;

export const NAV_ITEMS_MORE = [
  { label: "Programs", href: "/programs", icon: "Target" },
  { label: "Domains", href: "/domains", icon: "Server" },
  { label: "Ports", href: "/ports", icon: "Network" },
  { label: "Tech", href: "/tech", icon: "Cpu" },
  { label: "Screenshots", href: "/screenshots", icon: "Camera" },
  { label: "Scans", href: "/scans", icon: "Radar" },
  { label: "IP Scan", href: "/ipscan", icon: "ScanSearch" },
  { label: "LeakIX", href: "/leakix", icon: "Bug" },
  { label: "CVEs", href: "/cves", icon: "ShieldAlert" },
  { label: "Changes", href: "/changes", icon: "Activity" },
  { label: "Alerts", href: "/alerts", icon: "Bell" },
] as const;

// Keep for backwards compat
export const NAV_ITEMS = [...NAV_ITEMS_PRIMARY, ...NAV_ITEMS_MORE] as const;

export const INTERESTING_TECH = new Set([
  "WordPress", "Jira", "Confluence", "Jenkins", "Grafana", "Kibana",
  "Swagger UI", "GraphQL Playground", "GraphQL", "Spring Boot Actuator",
  "phpMyAdmin", "Webmin", "Apache Tomcat Manager", "Apache Tomcat",
  "Solr", "Elasticsearch", "ArgoCD", "GitLab", "Jupyter Notebook",
  "Jupyter", "RabbitMQ Management", "RabbitMQ", "Redis Commander",
  "Mongo Express", "Adminer", "pgAdmin", "Portainer", "Kubernetes Dashboard",
]);

export const CATEGORY_LABELS: Record<string, string> = {
  cms: "CMS",
  frameworks: "Frameworks",
  servers: "Servers",
  cdn_waf: "CDN / WAF",
  databases: "Databases",
  devops: "DevOps / CI",
  javascript: "JavaScript Libraries",
  other: "Other",
};

export const SWEEP_INTERVALS = [
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
  { value: 14400, label: "4 hours" },
  { value: 21600, label: "6 hours" },
  { value: 43200, label: "12 hours" },
  { value: 86400, label: "24 hours" },
];
