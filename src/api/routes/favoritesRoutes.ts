import { Router } from 'express'
import { requireAuth } from '../middleware/authMiddleware'
import { updateLastActive } from '../middleware/authMiddleware'
import { User } from '../../domain/models/User'
import { Template } from '../../domain/models/Template'
import { Sticker } from '../../domain/models/Sticker'
import { Content } from '../../domain/models/Content'
import { Settings } from '../../domain/models/Settings'

const router = Router()

router.get('/', requireAuth, updateLastActive, async (req, res) => {
  try {
    const user = await User.findById(req.user!.id).lean()
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const favorites = user.favorites ?? []
    if (favorites.length === 0) {
      res.json({ success: true, data: [] })
      return
    }

    const allIds = [...new Set(favorites.map(f => f.itemId))]

    const [templates, stickers, contents] = await Promise.all([
      Template.find({ _id: { $in: allIds } }).lean(),
      Sticker.find({ _id: { $in: allIds } }).lean(),
      Content.find({ _id: { $in: allIds } }).lean(),
    ])

    const itemMap: Record<string, unknown> = {}
    contents.forEach((c: any)  => { itemMap[c._id.toString()] = { ...c, itemType: c.itemType || 'content' } })
    templates.forEach((t: any) => { itemMap[t._id.toString()] = itemMap[t._id.toString()] ?? { ...t, itemType: 'template' } })
    stickers.forEach((s: any)  => { itemMap[s._id.toString()] = itemMap[s._id.toString()] ?? { ...s, itemType: 'sticker'  } })

    const populated = favorites
      .slice()
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
      .map(f => {
        const item = itemMap[f.itemId]
        if (!item) return null
        return { ...item, _favoriteAddedAt: f.addedAt }
      })
      .filter(Boolean)

    res.json({ success: true, data: populated })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/', requireAuth, updateLastActive, async (req, res) => {
  try {
    const { itemId, itemType } = req.body
    if (!itemId || !itemType) {
      res.status(400).json({ success: false, message: 'itemId and itemType are required' })
      return
    }
    if (!['template', 'sticker', 'content'].includes(itemType)) {
      res.status(400).json({ success: false, message: 'itemType must be template, sticker, or content' })
      return
    }

    const settings = await Settings.findOne().lean()
    const favoritesEnabled   = settings?.favoritesEnabled   !== false
    const maxFavoritesPerUser = settings?.maxFavoritesPerUser ?? 20

    if (!favoritesEnabled) {
      res.status(403).json({ success: false, message: 'Favorites feature is currently disabled' })
      return
    }

    const user = await User.findById(req.user!.id)
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const favorites = user.favorites ?? []

    const alreadyFavorited = favorites.some(f => f.itemId === itemId)
    if (alreadyFavorited) {
      res.status(409).json({ success: false, message: 'Item is already in favorites' })
      return
    }

    if (favorites.length >= maxFavoritesPerUser) {
      res.status(400).json({
        success: false,
        message: `You can only have up to ${maxFavoritesPerUser} favorites. Remove some to add more.`,
      })
      return
    }

    user.favorites = [...favorites, { itemId, itemType, addedAt: new Date() }]
    await user.save()

    res.json({ success: true, message: 'Added to favorites', data: { itemId, itemType } })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.delete('/:itemId', requireAuth, updateLastActive, async (req, res) => {
  try {
    const { itemId } = req.params

    const user = await User.findById(req.user!.id)
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const before = (user.favorites ?? []).length
    user.favorites = (user.favorites ?? []).filter(f => f.itemId !== itemId)

    if (user.favorites.length === before) {
      res.status(404).json({ success: false, message: 'Item not found in favorites' })
      return
    }

    await user.save()
    res.json({ success: true, message: 'Removed from favorites', data: { itemId } })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.get('/ids', requireAuth, updateLastActive, async (req, res) => {
  try {
    const user = await User.findById(req.user!.id).select('favorites').lean()
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }
    const ids = (user.favorites ?? []).map((f: any) => f.itemId)
    res.json({ success: true, data: ids })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
