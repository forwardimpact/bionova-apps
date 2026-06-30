# Placeholder — replaced by plan-a-07 with the real Next.js standalone build.
FROM node:20-bookworm-slim
WORKDIR /app
EXPOSE 3000
CMD ["node", "-e", "require('http').createServer((req,res)=>res.end(req.url==='/api/health'?'ok':'not ready')).listen(3000)"]
