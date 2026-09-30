#!/bin/sh
# Prefer a runtime password file (written by the one-time setup page) over image/build env.
set -eu
if [ -f /app/data/site-password ]; then
  SITE_PASSWORD=$(tr -d '\n\r' </app/data/site-password)
  export SITE_PASSWORD
fi
# Expose setup-token hash to Edge middleware only while the one-time file exists.
if [ -f /app/data/password-setup-token.sha256 ]; then
  SITE_PASSWORD_SETUP_TOKEN_HASH=$(tr -d '\n\r' </app/data/password-setup-token.sha256)
  export SITE_PASSWORD_SETUP_TOKEN_HASH
else
  unset SITE_PASSWORD_SETUP_TOKEN_HASH || true
fi
exec "$@"
