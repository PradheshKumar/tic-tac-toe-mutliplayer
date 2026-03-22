FROM heroiclabs/nakama:3.22.0

# Copy the compiled JS game module into the Nakama modules directory
COPY nakama/build/ /nakama/data/modules/build/

# Railway injects DATABASE_URL as: postgresql://user:pass@host:port/db
# Nakama's --database.address expects:             user:pass@host:port/db
# We strip the scheme prefix using sed, then run migrations before starting.
ENTRYPOINT ["/bin/sh", "-c", \
  "DB=$(echo $DATABASE_URL | sed 's|^postgresql://||; s|^postgres://||'); \
  echo \"Running migrations...\"; \
  /nakama/nakama migrate up --database.address $DB; \
  echo \"Starting Nakama...\"; \
  exec /nakama/nakama \
    --name nakama1 \
    --database.address $DB \
    --logger.level INFO \
    --runtime.path /nakama/data/modules/build"]
