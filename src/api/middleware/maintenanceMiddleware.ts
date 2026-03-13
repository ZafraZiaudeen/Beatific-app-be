import type { Request, Response, NextFunction } from 'express'
import { Settings } from '../../domain/models/Settings'

const BYPASS_PATHS = new Set(['/settings/public'])

export async function enforceMaintenanceMode(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method === 'OPTIONS' || BYPASS_PATHS.has(req.path)) {
    next()
    return
  }

  try {
    const settings = await Settings.findOne().select('maintenanceMode maintenanceMessage')
    if (settings?.maintenanceMode) {
      res.status(503).json({
        success: false,
        code: 'MAINTENANCE_MODE',
        message: settings.maintenanceMessage || 'We are currently down for maintenance. Please check back shortly.',
      })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}