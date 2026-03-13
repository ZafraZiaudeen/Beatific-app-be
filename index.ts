import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDatabase, disconnectDatabase } from './src/infrastructure/database/connection'
import { migrateJournals } from './src/domain/models/Journal'
import apiRouter from './src/api/index'
import { enforceMaintenanceMode } from './src/api/middleware/maintenanceMiddleware'

const app = express()

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'beatific-app-be', time: new Date().toISOString() })
})

app.use('/api/v1', enforceMaintenanceMode, apiRouter)

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  const status  = err.statusCode ?? err.status ?? 500
  const message = err.message ?? 'Internal Server Error'
  res.status(status).json({ success: false, message })
})

const port = Number(process.env.PORT ?? 3003)

async function start() {
  await connectDatabase()
  await migrateJournals()

  const server = app.listen(port, () => {
    console.log(`✓ beatific-app-be  → http://localhost:${port}`)
    console.log(`✓ API base         → http://localhost:${port}/api/v1`)
  })

  server.on('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })

  const shutdown = async () => {
    console.log('Shutting down gracefully…')
    server.close(async () => {
      await disconnectDatabase()
      process.exit(0)
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
