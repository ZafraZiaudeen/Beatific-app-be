import { Router } from 'express'
import { Permission } from '../../domain/models/Permission'
import { MainCategory } from '../../domain/models/MainCategory'
import { Category } from '../../domain/models/Category'
import { Content } from '../../domain/models/Content'

const router = Router()

function toContentSummary(item: any) {
  const pages = Array.isArray(item?.pages) ? item.pages : []
  const firstPage = pages[0] ?? null

  return {
    _id: item._id,
    name: item.name,
    description: item.description,
    itemType: item.itemType,
    category: item.category,
    subcategory: item.subcategory,
    tags: item.tags ?? [],
    svgContent: item.svgContent,
    coverImageUrl: item.coverImageUrl,
    isPublished: item.isPublished,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    pageCount: pages.length,
    coverBackground: firstPage?.background,
  }
}

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

    const allAllowedCatSlugs: string[] = []
    const allAllowedItemIds: string[] = []
    for (const { categories, items } of permMap.values()) {
      allAllowedCatSlugs.push(...categories)
      allAllowedItemIds.push(...items)
    }

    const [mainCats, allCategories] = await Promise.all([
      MainCategory.find({ slug: { $in: enabledSlugs } })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      Category.find({
        itemType: { $in: enabledSlugs },
        slug: { $in: allAllowedCatSlugs },
      })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
    ])

    const catsByItemType = new Map<string, typeof allCategories>()
    for (const cat of allCategories) {
      const key = cat.itemType as string
      if (!catsByItemType.has(key)) catsByItemType.set(key, [])
      catsByItemType.get(key)!.push(cat)
    }

    interface SectionDraft {
      mc: typeof mainCats[0]
      cat: typeof allCategories[0]
    }
    const drafts: SectionDraft[] = []
    const contentOrConditions: any[] = []

    for (const mc of mainCats) {
      const perm = permMap.get(mc.slug)
      if (!perm) continue
      const cats = catsByItemType.get(mc.slug) ?? []
      const { items: allowedItemIds } = perm

      for (const cat of cats) {
        drafts.push({ mc, cat })

        if (allowedItemIds.length > 0) {
          contentOrConditions.push({
            _id: { $in: allowedItemIds },
            itemType: mc.slug,
            category: cat.slug,
            isPublished: true,
          })
        } else {
          contentOrConditions.push({
            itemType: mc.slug,
            category: cat.slug,
            isPublished: true,
          })
        }
      }
    }

    if (drafts.length === 0) {
      res.json({ success: true, data: [] })
      return
    }

    const allContent = await Content.find(
      contentOrConditions.length === 1
        ? contentOrConditions[0]
        : { $or: contentOrConditions }
    )
      .sort({ createdAt: -1 })
      .lean()

    const contentMap = new Map<string, typeof allContent>()
    for (const item of allContent) {
      const key = `${item.itemType}::${item.category}`
      if (!contentMap.has(key)) contentMap.set(key, [])
      contentMap.get(key)!.push(item)
    }

    const sections: any[] = []
    for (const { mc, cat } of drafts) {
      const perm = permMap.get(mc.slug)
      const allowedItemIds = perm?.items ?? []
      const key = `${mc.slug}::${cat.slug}`
      let items = contentMap.get(key) ?? []

      if (allowedItemIds.length > 0) {
        const idSet = new Set(allowedItemIds)
        items = items.filter((c) => idSet.has(String(c._id)))
      } else {
        items = items.slice(0, 20)
      }

      if (items.length > 0) {
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
          content: items.map(toContentSummary),
        })
      }
    }

    res.json({ success: true, data: sections })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
})

export default router
