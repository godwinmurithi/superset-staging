FROM apache/superset:latest

USER root
RUN . /app/.venv/bin/activate && uv pip install psycopg2-binary "fastmcp>=3.1.0,<4.0" playwright
# Phase 5: thumbnails/screenshots (superset/utils/webdriver.py always uses
# playwright.chromium regardless of WEBDRIVER_TYPE). `install-deps` needs
# apt/root, which a Docker build step already has -- no host sudo needed,
# unlike the earlier ad-hoc attempt to run this directly on the host.
RUN . /app/.venv/bin/activate && playwright install --with-deps chromium

# Phase 8: the base apache/superset:latest image ships its own prebuilt
# frontend, with react-dnd still in it. This overlays the real production
# build (`npm run build`, verified clean, 2 warnings both pre-existing
# bundle-size advisories) from the forked frontend source
# (~/projects/superset-frontend-src, branch feat/phase8-react-dnd-to-dndkit)
# -- same output path the base image's own build step writes to, so nothing
# else about asset serving changes. `frontend_assets/` is gitignored here
# (99MB of build output, regenerable, doesn't belong in this small config
# repo) -- copy a fresh build there before rebuilding this image.
COPY frontend_assets/ /app/superset/static/assets/

USER superset
