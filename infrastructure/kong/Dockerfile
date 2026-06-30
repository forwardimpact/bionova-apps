FROM kong:3.4
# DB-less declarative gateway. The compose env sets KONG_DATABASE=off and
# KONG_DECLARATIVE_CONFIG=/home/kong/kong.yml.
COPY kong.yml /home/kong/kong.yml
USER kong
