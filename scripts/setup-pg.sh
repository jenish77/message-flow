#!/bin/bash
set -e

# Update postgresql.conf to listen on all interfaces
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /etc/postgresql/18/main/postgresql.conf

# Allow connections from any host in pg_hba.conf
echo "host all all 0.0.0.0/0 trust" >> /etc/postgresql/18/main/pg_hba.conf
echo "host all all ::/0 trust" >> /etc/postgresql/18/main/pg_hba.conf

# Start PostgreSQL service
service postgresql start

# Configure user and database
su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\""
su - postgres -c "psql -c \"SELECT 1 FROM pg_database WHERE datname = 'messageflow_db'\" | grep -q 1 || psql -c \"CREATE DATABASE messageflow_db;\""

echo "PostgreSQL setup complete and running."
