# Placeholder — replaced by plan-a-04 with the real Deno edge-functions image.
FROM denoland/deno:1.46.3
WORKDIR /app
EXPOSE 8000
CMD ["deno", "eval", "Deno.serve({port:8000},(r)=>new URL(r.url).pathname===\"/health\"?new Response(\"ok\"):new Response(\"not ready\",{status:503}))"]
