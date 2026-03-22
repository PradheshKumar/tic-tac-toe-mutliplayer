FROM heroiclabs/nakama:3.22.0

# Copy the compiled JS game module into the Nakama modules directory
COPY nakama/build/ /nakama/data/modules/build/

# Railway injects DATABASE_URL as an env var — Nakama reads it via --database.address
# All other config is passed as environment variables in the Railway dashboard.
ENTRYPOINT ["/bin/sh", "-ecx", \
  "exec /nakama/nakama \
  --name nakama1 \
  --database.address ${DATABASE_URL} \
  --logger.level INFO \
  --runtime.path /nakama/data/modules/build"]
