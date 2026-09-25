"""Bridges a verified MCP JWT identity into Superset's per-tool-call g.user.

Superset 6.1.0's shipped MCP JWT auth (superset/mcp_service/mcp_config.py,
auth.py) validates the token correctly (signature, issuer, audience) but
never resolves the verified identity into g.user -- get_user_from_request()
only ever reads a g.user already set by something else (Preset's proprietary
SaaS middleware) or falls back to MCP_DEV_USERNAME, a single shared account.
default_user_resolver() in mcp_config.py is defined but never called from
anywhere in the auth path -- confirmed by tracing every call site.

It's not enough to set g.user at verification time either: mcp_auth_hook
(auth.py) deliberately pushes a *fresh* Flask app context per tool call --
documented there as a fix for a real concurrency bug (concurrent tool calls
via asyncio.create_task() used to share one g namespace and race on
g.user). A fresh app context means a fresh g, so anything set on g during
JWT verification (a separate point in the request lifecycle) is gone by the
time the tool actually runs.

Fix: carry the verified identity across in a plain contextvars.ContextVar
instead of g. Unlike Flask's g (itself contextvar-based, but reset on every
app_context() push), a ContextVar we own is untouched by that push --
Python's own semantics guarantee asyncio.create_task() copies the current
context (which is exactly why the g-sharing bug above was even possible:
contextvars, including Flask's, propagate to child tasks by default). Then
monkeypatch get_user_from_request -- the one function _setup_user_context()
actually calls on every tool invocation -- to fall back to that ContextVar
when g.user isn't set.

The monkeypatch targets our own module attribute lookup (Python resolves
`get_user_from_request()` from auth.py's module globals at call time, not a
pre-bound reference), so this doesn't touch Superset's package files on
disk. Still a patch, not pure config -- flagged here and in
AI_NATIVE_STATUS.md per hard rule 6 (isolate what can't be a plain
extension, name it clearly).

Registered via MCP_AUTH_FACTORY in superset_config.py -- a supported
Superset extension point (checked first in
superset.mcp_service.server._create_auth_provider).
"""

import logging
from contextvars import ContextVar

from fastmcp.server.auth.providers.jwt import JWTVerifier

logger = logging.getLogger(__name__)

_verified_username: ContextVar[str | None] = ContextVar(
    "mcp_verified_username", default=None
)

_patched = False


def _patch_get_user_from_request() -> None:
    """Monkeypatch auth.get_user_from_request to honor _verified_username.

    Idempotent -- safe to call every time an auth provider is constructed
    (once per MCP server process in practice).
    """
    global _patched
    if _patched:
        return

    from superset.mcp_service import auth as mcp_auth

    original = mcp_auth.get_user_from_request

    def patched_get_user_from_request():
        from flask import g

        if hasattr(g, "user") and g.user:
            return g.user

        username = _verified_username.get()
        if username:
            user = mcp_auth.load_user_with_relationships(username=username)
            if user is not None:
                return user
            logger.warning(
                "MCP JWT verified for '%s' but no matching Superset user exists",
                username,
            )

        return original()

    mcp_auth.get_user_from_request = patched_get_user_from_request
    _patched = True
    logger.info("mcp_auth_bridge: patched get_user_from_request for per-user JWT identity")


class PerUserJWTVerifier(JWTVerifier):
    """JWTVerifier that also records the token's subject for later resolution."""

    async def load_access_token(self, token: str):
        access_token = await super().load_access_token(token)
        if access_token is None:
            return None

        username = access_token.client_id
        if username:
            _verified_username.set(username)
        else:
            logger.warning("MCP JWT verified but carries no usable subject/client_id")

        return access_token


def create_mcp_auth_provider(app):
    """MCP_AUTH_FACTORY entry point -- see superset_config.py."""
    _patch_get_user_from_request()

    secret = app.config["MCP_JWT_SECRET"]
    return PerUserJWTVerifier(
        public_key=secret,
        algorithm=app.config.get("MCP_JWT_ALGORITHM", "HS256"),
        issuer=app.config.get("MCP_JWT_ISSUER"),
        audience=app.config.get("MCP_JWT_AUDIENCE"),
    )
