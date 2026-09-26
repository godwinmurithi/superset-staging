FROM apache/superset:latest

USER root
RUN . /app/.venv/bin/activate && uv pip install psycopg2-binary "fastmcp>=3.1.0,<4.0" playwright
# Phase 5: thumbnails/screenshots (superset/utils/webdriver.py always uses
# playwright.chromium regardless of WEBDRIVER_TYPE). `install-deps` needs
# apt/root, which a Docker build step already has -- no host sudo needed,
# unlike the earlier ad-hoc attempt to run this directly on the host.
RUN . /app/.venv/bin/activate && playwright install --with-deps chromium
USER superset
