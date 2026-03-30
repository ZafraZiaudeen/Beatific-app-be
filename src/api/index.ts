import { Router } from 'express'
import authRoutes           from './routes/authRoutes'
import templateRoutes       from './routes/templateRoutes'
import stickerRoutes        from './routes/stickerRoutes'
import categoryRoutes       from './routes/categoryRoutes'
import mainCategoryRoutes   from './routes/mainCategoryRoutes'
import contentRoutes        from './routes/contentRoutes'
import permissionRoutes     from './routes/permissionRoutes'
import journalRoutes        from './routes/journalRoutes'
import calendarRoutes       from './routes/calendarRoutes'
import homeSectionRoutes    from './routes/homeSectionRoutes'
import settingsRoutes       from './routes/settingsRoutes'
import favoritesRoutes      from './routes/favoritesRoutes'

const router = Router()

router.use('/auth',             authRoutes)
router.use('/templates',        templateRoutes)      
router.use('/stickers',         stickerRoutes)        
router.use('/categories',       categoryRoutes)       
router.use('/main-categories',  mainCategoryRoutes)   
router.use('/content',          contentRoutes)        
router.use('/permissions',      permissionRoutes)      
router.use('/journals',         journalRoutes)         
router.use('/calendar',         calendarRoutes)
router.use('/home-sections',    homeSectionRoutes)   
router.use('/settings',         settingsRoutes)
router.use('/favorites',        favoritesRoutes)

export default router
