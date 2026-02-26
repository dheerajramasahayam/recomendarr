#!/bin/sh
# Fix permissions for the data directory where the SQLite database lives
# This ensures that regardless of how the Docker volume is mounted, the node process can write to it
chown -R nextjs:nodejs /app/data

# Drop privileges and execute the original command as the nextjs user
exec su-exec nextjs "$@"
