import { createServer } from 'vite'

const server = await createServer({
  root: import.meta.dirname,
  server: { port: 5173, host: true },
})
await server.listen()
server.printUrls()
