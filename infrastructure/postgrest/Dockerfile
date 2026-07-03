# The upstream postgrest image is distroless: it ships only the postgrest
# binary, with no shell, wget, curl, or nc. A container healthcheck has nothing
# to run there, so the port-3000 readiness probe can never pass and the
# container is reported unhealthy forever. Copy a static busybox in to give the
# healthcheck a TCP probe against the API port.
FROM busybox:1.36.1-musl AS probe

FROM postgrest/postgrest:v12.0.2
COPY --from=probe /bin/busybox /bin/busybox
