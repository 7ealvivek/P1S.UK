"""P1 Warriors — Tech stack API routes."""

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.database import fetch_all
from app.models import APIResponse

router = APIRouter(prefix="/api/tech", tags=["tech"])

# Technology categorization
TECH_CATEGORIES = {
    "cms": [
        "WordPress", "Drupal", "Joomla", "Ghost", "Magento", "Shopify", "Squarespace",
        "Wix", "PrestaShop", "OpenCart", "TYPO3", "Hugo", "Gatsby",
    ],
    "frameworks": [
        "React", "Angular", "Vue.js", "Vue", "Next.js", "Nuxt.js", "Svelte", "Laravel",
        "Django", "Flask", "Rails", "Ruby on Rails", "Spring", "Spring Boot", "ASP.NET",
        "Express", "FastAPI", "Symfony", "CakePHP", "CodeIgniter", "Ember.js",
    ],
    "servers": [
        "Nginx", "Apache", "IIS", "Microsoft-IIS", "Tomcat", "Apache Tomcat", "Caddy",
        "LiteSpeed", "OpenResty", "Gunicorn", "Uvicorn", "Kestrel", "Jetty",
    ],
    "cdn_waf": [
        "Cloudflare", "Akamai", "Fastly", "AWS CloudFront", "CloudFront", "Imperva",
        "Incapsula", "Sucuri", "StackPath", "KeyCDN", "Azure CDN", "Google Cloud CDN",
    ],
    "databases": [
        "phpMyAdmin", "Adminer", "pgAdmin", "MongoDB Compass", "Redis Commander",
        "Mongo Express", "Elasticsearch", "CouchDB",
    ],
    "devops": [
        "Jenkins", "GitLab", "ArgoCD", "Grafana", "Prometheus", "Kibana", "Datadog",
        "Sentry", "Jaeger", "Traefik", "Portainer", "Rancher", "Kubernetes Dashboard",
    ],
    "javascript": [
        "jQuery", "Bootstrap", "Lodash", "Moment.js", "Axios", "Webpack", "Vite",
        "Tailwind CSS", "Material UI", "Ant Design", "Chart.js", "D3.js", "Three.js",
    ],
}

# Interesting / high-risk technologies
INTERESTING_TECH = {
    "WordPress", "Jira", "Confluence", "Jenkins", "Grafana", "Kibana",
    "Swagger UI", "GraphQL Playground", "GraphQL", "Spring Boot Actuator",
    "phpMyAdmin", "Webmin", "Apache Tomcat Manager", "Apache Tomcat",
    "Solr", "Elasticsearch", "ArgoCD", "GitLab", "Jupyter Notebook",
    "Jupyter", "RabbitMQ Management", "RabbitMQ", "Redis Commander",
    "Mongo Express", "Adminer", "pgAdmin", "Portainer", "Kubernetes Dashboard",
}


def _categorize_tech(tech_name: str) -> str:
    """Determine category for a technology."""
    for category, techs in TECH_CATEGORIES.items():
        for known in techs:
            if tech_name.lower() == known.lower() or known.lower() in tech_name.lower():
                return category
    return "other"


@router.get("/summary")
async def tech_summary(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get tech stack summary grouped by category."""
    rows = await fetch_all("""
        SELECT tech_stack FROM subdomains
        WHERE tech_stack IS NOT NULL AND tech_stack != ''
    """)

    tech_counts: dict[str, int] = {}
    for row in rows:
        for t in row["tech_stack"].split(","):
            t = t.strip()
            if t:
                tech_counts[t] = tech_counts.get(t, 0) + 1

    categories: dict[str, list] = {
        "cms": [], "frameworks": [], "servers": [], "cdn_waf": [],
        "databases": [], "devops": [], "javascript": [], "other": [],
    }

    for name, count in sorted(tech_counts.items(), key=lambda x: x[1], reverse=True):
        cat = _categorize_tech(name)
        categories[cat].append({"name": name, "count": count})

    return APIResponse(data={"categories": categories})


@router.get("/interesting")
async def interesting_tech(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get interesting/high-risk technologies found."""
    rows = await fetch_all("""
        SELECT tech_stack FROM subdomains
        WHERE tech_stack IS NOT NULL AND tech_stack != ''
    """)

    tech_counts: dict[str, int] = {}
    for row in rows:
        for t in row["tech_stack"].split(","):
            t = t.strip()
            if t:
                tech_counts[t] = tech_counts.get(t, 0) + 1

    interesting = []
    for name, count in sorted(tech_counts.items(), key=lambda x: x[1], reverse=True):
        # Check if this tech is interesting
        is_interesting = False
        for it in INTERESTING_TECH:
            if it.lower() in name.lower() or name.lower() in it.lower():
                is_interesting = True
                break
        if is_interesting:
            interesting.append({
                "name": name,
                "count": count,
                "category": _categorize_tech(name),
            })

    return APIResponse(data=interesting)


@router.get("/{tech_name}/subdomains")
async def tech_subdomains(
    tech_name: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=250),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get subdomains using a specific technology."""
    rows = await fetch_all("""
        SELECT * FROM subdomains
        WHERE tech_stack LIKE ?
        ORDER BY first_seen DESC
    """, (f"%{tech_name}%",))

    total = len(rows)
    offset = (page - 1) * per_page
    paged = rows[offset:offset + per_page]
    pages = max(1, (total + per_page - 1) // per_page)

    return APIResponse(
        data=paged,
        meta={"total": total, "page": page, "pages": pages},
    )
