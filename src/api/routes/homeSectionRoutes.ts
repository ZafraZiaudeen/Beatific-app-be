import { Router } from 'express'
import { Permission } from '../../domain/models/Permission'
import { MainCategory } from '../../domain/models/MainCategory'
import { Category } from '../../domain/models/Category'
import { Content } from '../../domain/models/Content'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const perms = await Permission.find({ scope: 'home-section', enabled: true }).lean()
    if (perms.length === 0) {
      res.json({ success: true, data: [] })
      return
    }

    const permMap = new Map<string, { categories: string[]; items: string[] }>()
    for (const p of perms) {
      const cats = p.allowedCategories ?? []
      const items = p.allowedItems ?? []
      if (cats.length > 0) permMap.set(p.targetType, { categories: cats, items })
    }

    if (permMap.size === 0) {
      res.json({ success: true, data: [] })
      return
    }

    const enabledSlugs = [...permMap.keys()]
    const mainCats = await MainCategory.find({ slug: { $in: enabledSlugs } })
      .sort({ order: 1, createdAt: 1 })
      .lean()

    const allAllowedItemIds: string[] = []
    for (const { items } of permMap.values()) {
      allAllowedItemIds.push(...items)
    }

    const sections: any[] = []

    for (const mc of mainCats) {
      const perm = permMap.get(mc.slug)
      if (!perm) continue
      const { categories: allowedCatSlugs, items: allowedItemIds } = perm

      const categories = await Category.find({
        itemType: mc.slug,
        slug: { $in: allowedCatSlugs },
      })
        .sort({ order: 1, createdAt: 1 })
        .lean()

      for (const cat of categories) {
        const catItemIds = allowedItemIds.length > 0
          ? allowedItemIds 
          : []

        let content
        if (catItemIds.length > 0) {
          content = await Content.find({
            _id: { $in: catItemIds },
            itemType: mc.slug,
            category: cat.slug,
            isPublished: true,
          } as any)
            .sort({ createdAt: -1 })
            .lean()
        } else {
          content = await Content.find({
            itemType: mc.slug,
            category: cat.slug,
            isPublished: true,
          })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean()
        }

        if (content.length > 0) {
          sections.push({
            mainCategory: {
              _id: mc._id,
              name: mc.name,
              slug: mc.slug,
              icon: mc.icon,
              color: mc.color,
            },
            category: {
              _id: cat._id,
              name: cat.name,
              slug: cat.slug,
              color: cat.color,
            },
            content,
          })
        }
      }
    }

    res.json({ success: true, data: sections })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
