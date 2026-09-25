FROM apache/superset:latest

USER root
RUN . /app/.venv/bin/activate && uv pip install psycopg2-binary "fastmcp>=3.1.0,<4.0"
USER superset
