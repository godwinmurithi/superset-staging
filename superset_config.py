import os

SQLALCHEMY_DATABASE_URI = (
    "postgresql+psycopg2://superset_app:Superset%40CTI2026"
    "@db-staging4cti:5432/cti_geonode_data?options=-csearch_path%3Dsuperset"
)

SECRET_KEY = os.environ.get("SUPERSET_SECRET_KEY")

# ── Self-registration ────────────────────────────────────────
# New sign-ups are created inactive (see custom_sm.py) since this instance
# has no SMTP server to send the normal FAB confirmation email. An admin
# must open Settings > List Users and flip "Is Active" to approve them.
# AUTH_USER_REGISTRATION_ROLE="Public" is FAB's built-in zero-permission
# role, so even if a request slipped through before being deactivated it
# couldn't do anything.
from custom_sm import CTISecurityManager  # noqa: E402

CUSTOM_SECURITY_MANAGER = CTISecurityManager
AUTH_USER_REGISTRATION = True
AUTH_USER_REGISTRATION_ROLE = "Public"

# ── Password reset requests ──────────────────────────────────
# Same no-SMTP constraint as registration: "Forgot password?" on the login
# screen posts to /reset-password-request/form, which just logs a request
# for an admin to see under Security > Password Reset Requests and resolve
# by hand (custom_views.py). Registered via FLASK_APP_MUTATOR since it's
# the documented hook point for adding custom AppBuilder views once the
# app/appbuilder are fully initialized.
from custom_views import register_custom_views  # noqa: E402

FLASK_APP_MUTATOR = register_custom_views

# The reCAPTCHA field itself was removed from the registration form
# (custom_sm.py — admin approval above is the actual spam gate). But
# Superset's own bootstrap code reads app.config["RECAPTCHA_PUBLIC_KEY"]
# unconditionally on every page load regardless of AUTH_USER_REGISTRATION,
# so the key still has to exist in config or every page (not just
# /register/) 500s with a KeyError. Empty string is fine — nothing reads
# it now that the field is gone.
RECAPTCHA_PUBLIC_KEY = ""
RECAPTCHA_PRIVATE_KEY = ""

# ── Brand & UI ──────────────────────────────────────────────
# APP_NAME deliberately says "STAGING" (unlike prod's plain "LifeData") so
# nobody mistakes this instance for the production dashboard when both are
# open in adjacent tabs.
APP_NAME = "LifeData (Staging)"
APP_ICON = "/static/assets/images/lifedata_logo.png"
APP_ICON_WIDTH = 126
FAVICONS = [{"href": "/static/assets/images/lifedata_favicon.png"}]
LOGO_TARGET_PATH = "/"
LOGO_TOOLTIP = "LifeData STAGING — Spatial Health Intelligence for Africa (sandbox, not production)"

# ── Feature Flags ───────────────────────────────────────────
FEATURE_FLAGS = {
    "ENABLE_TEMPLATE_PROCESSING": True,
    "DASHBOARD_NATIVE_FILTERS": True,
    "DASHBOARD_CROSS_FILTERS": True,
    "DASHBOARD_RBAC": True,
    "EMBEDDABLE_CHARTS": True,
    "DRILL_BY": True,
    "DRILL_TO_DETAIL": True,
    "ENABLE_JAVASCRIPT_CONTROLS": True,
}

# ── HTML Sanitization ────────────────────────────────────────
# Default schema (github hast-util-sanitize) strips <iframe> from Markdown
# dashboard components. Extend it to allow iframe embeds (e.g. the
# LifeConnect widget on the Buikwe HF dashboard) with only the attributes
# actually needed, and restrict src to https so this can't be abused for
# javascript:/data: URLs.
HTML_SANITIZATION_SCHEMA_EXTENSIONS = {
    "tagNames": ["iframe"],
    "attributes": {
        "iframe": ["src", "style", "title", "width", "height", "frameborder"],
    },
    "protocols": {
        "src": ["https"],
    },
}

# ── Chart Color Palette ─────────────────────────────────────
EXTRA_CATEGORICAL_COLOR_SCHEMES = [
    {
        "id": "lifedata",
        "description": "LifeData — CTI LifeHealth Brand Colors",
        "label": "LifeData Brand",
        "isDefault": True,
        "colors": [
            "#1E7B4D", "#E0312B", "#26A69A", "#F9A825",
            "#1565C0", "#6D4C41", "#546E7A", "#AD1457",
            "#558B2F", "#4527A0"
        ],
    }
]

# ── Global Theme (Ant Design tokens) ─────────────────────────
# This Superset build has no "CUSTOM_CSS" hook — that key doesn't exist in
# superset/config.py, so raw CSS injected under that name is silently
# dropped. Site-wide chrome (nav, buttons, links, logo) is themed through
# THEME_DEFAULT/THEME_DARK Ant Design tokens instead. THEME_DEFAULT must be
# redefined here in full (not just APP_ICON/APP_NAME) because the base
# config.py already bakes those into its own THEME_DEFAULT dict before this
# file is loaded.
#
# Brand token values pulled from the actual LifeHealth brand kit (same
# colors/fonts already used in the forms engine), not the earlier invented
# amber placeholder. APP_NAME still says "(Staging)" (title/tab text) as the
# distinguishing cue from prod now that the color palette itself matches.
THEME_DEFAULT = {
    "token": {
        "brandAppName": APP_NAME,
        "brandLogoAlt": "LifeData Staging",
        "brandLogoUrl": APP_ICON,
        "brandLogoHref": "/",
        "brandLogoHeight": "24px",
        "colorPrimary": "#339933",
        "colorLink": "#339933",
        "colorError": "#E5060F",
        "colorWarning": "#F9A825",
        "colorSuccess": "#61A229",
        "colorInfo": "#0E2B5C",
        "fontFamily": "Ubuntu, -apple-system, BlinkMacSystemFont, sans-serif",
        "fontUrls": [
            "https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&family=Rubik:wght@500;600;700&display=swap"
        ],
    },
    "algorithm": "default",
}

THEME_DARK = {
    **THEME_DEFAULT,
    "algorithm": "dark",
}


# ── Content Security Policy: allow the LifeData copilot panel ───────────────
#
# nginx injects <script src="/lifedata-ai/static/panel/panel.js"> into every
# Superset HTML response. Upstream's default script-src is
#
#     ["'self'", "'strict-dynamic'"]
#
# and under CSP Level 3 `strict-dynamic` makes the browser IGNORE host sources
# entirely — so `'self'` counts for nothing and only a script carrying the
# per-response nonce runs. An nginx sub_filter cannot know that nonce, so the
# injected tag is blocked and the panel silently never mounts: Superset looks
# completely normal, the bundle 200s if you fetch it by hand, and nothing in any
# log says why. It is worth knowing that this failure has no symptom other than
# absence.
#
# So `strict-dynamic` is removed and nothing else is. Every other directive —
# and the nonce itself, which still applies to Superset's own inline scripts —
# is inherited from upstream rather than restated, so a Superset upgrade that
# tightens some other directive is not silently reverted by this file.
#
# WHAT THIS COSTS, stated plainly rather than buried:
#   * Before: only nonce-carrying scripts execute.
#   * After:  any same-origin script executes, plus nonce-carrying ones.
# The threat it stops mattering against is an injected <script src="/…"> served
# from Superset's own origin. Reaching that already requires the ability to
# write same-origin content, which is close to game over by other means. The
# panel is same-origin by design — that is the whole point of the nginx
# injection — so there is no variant of this that keeps strict-dynamic.
import copy as _copy

from superset.config import TALISMAN_CONFIG as _UPSTREAM_TALISMAN

TALISMAN_CONFIG = _copy.deepcopy(_UPSTREAM_TALISMAN)
TALISMAN_CONFIG["content_security_policy"]["script-src"] = [
    directive
    for directive in TALISMAN_CONFIG["content_security_policy"]["script-src"]
    if directive != "'strict-dynamic'"
]

# ── Native MCP service (Superset 6.1.0, superset/mcp_service/) ──────────────
# Deliberately NOT using MCP_DEV_USERNAME (single shared user for every tool
# call -- the "service account" pattern the orchestrator's identity invariant
# forbids). JWT auth instead: the orchestrator mints a short-lived HS256 token
# with `sub` = the already-verified Superset username of the requesting user
# (see lifedata_ai/middleware.py) and sends it as a Bearer token per call, so
# every MCP tool call runs with that user's own Superset RBAC via g.user --
# same invariant the browser-session write path already holds, extended to
# the MCP tool surface.
#
# HS256 with a shared secret (not RS256/JWKS) because both parties minting
# and verifying the token are our own services on the same host -- there is
# no third-party IdP in this deployment to delegate to.
#
# NOTE: MCP tool access is governed by Superset's own RBAC (dataset/database/
# chart permissions), not by lifedata-ai's semantics/registry.yaml allowlist.
# That allowlist is NOT enforced in front of these tools -- see
# AI_NATIVE_STATUS.md ("PHI exposure gate" decision, 2026-09-25) for why and
# what that means for the 5 sensitive datasets until a production gate exists.
MCP_AUTH_ENABLED = True
MCP_JWT_ALGORITHM = "HS256"
MCP_JWT_SECRET = os.environ["MCP_JWT_SECRET"]
MCP_JWT_ISSUER = "lifedata-ai"
MCP_JWT_AUDIENCE = "superset-mcp"
# MCP_JWT_DEBUG_ERRORS deliberately left at its default (False): Superset
# 6.1.0's DetailedJWTVerifier (used when True) has a real bug -- it calls
# `self.jwt.decode(...)` but that attribute doesn't exist on JWTVerifier,
# so every token fails with a generic "Token validation failed" regardless
# of validity. Confirmed by reproducing it directly against
# DetailedJWTVerifier.load_access_token() vs. the plain JWTVerifier, which
# validates the identical token correctly. Upstream bug, not a config
# mistake -- avoid this flag until Superset fixes it.

# The shipped JWTVerifier validates tokens but never resolves the verified
# identity into g.user (default_user_resolver in mcp_config.py is unused
# dead code -- traced every call site). Without this, JWT auth only works
# inside Preset's proprietary SaaS middleware. mcp_auth_bridge.py plugs that
# gap via the supported MCP_AUTH_FACTORY extension point. See that file for
# the full explanation.
from mcp_auth_bridge import create_mcp_auth_provider  # noqa: E402

MCP_AUTH_FACTORY = create_mcp_auth_provider

