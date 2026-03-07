import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import http from 'http'

function dynamicApiProxy() {
  let cachedPort = 8080
  let lastCheck = 0

  function getPort() {
    const now = Date.now()
    if (now - lastCheck > 2000) {
      lastCheck = now
      try {
        const cfg = JSON.parse(
          fs.readFileSync(path.resolve(__dirname, '../port.json'), 'utf-8')
        )
        if (cfg.port) cachedPort = cfg.port
      } catch {}
    }
    return cachedPort
  }

  return {
    name: 'dynamic-api-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api')) return next()

        const port = getPort()
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `127.0.0.1:${port}` },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers)
            proxyRes.pipe(res)
          }
        )

        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502)
            res.end('Backend unavailable')
          }
        })

        req.pipe(proxyReq)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dynamicApiProxy()],
})
