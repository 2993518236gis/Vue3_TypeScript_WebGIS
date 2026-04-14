/**
 * MCP 代理服务 —— Mapbox POI 搜索
 *
 * 功能链路：
 *   用户自然语言问题
 *     → Ollama (qwen2.5) 提取 { location, poiType }
 *     → Mapbox Geocoding API 把 location 转经纬度
 *     → Mapbox Search API (geocoding v5) 按 proximity 搜 POI
 *     → 返回 POI 列表给前端
 *
 * 启动: cd server && npx ts-node-dev --respawn src/mcp-server.ts
 */

import express, { Request, Response } from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN || ''

// ============================================================
// 1. Ollama 意图提取  — 从自然语言中提取 location + poiType
// ============================================================
interface ParsedIntent {
  location: string   // 例如 "深圳盛港国际科技园"
  poiType: string    // 例如 "咖啡店"
  poiKeyword: string // 英文搜索关键词, 例如 "coffee"
}

async function extractIntent(question: string): Promise<ParsedIntent> {
  const systemPrompt = `你是一个地理信息意图提取助手。用户会用自然语言询问某个地点附近的 POI。
你需要从问题中提取：
1. location: 用户询问的中心地点名称（中文）
2. poiType: 用户想查找的 POI 类型（中文）
3. poiKeyword: 对应的英文搜索关键词（供 Mapbox API 使用）

只返回 JSON，不要返回其它内容。示例：
输入: "深圳盛港国际科技园附近有什么咖啡店？"
输出: {"location":"深圳盛港国际科技园","poiType":"咖啡店","poiKeyword":"coffee"}

输入: "北京王府井附近的餐厅"
输出: {"location":"北京王府井","poiType":"餐厅","poiKeyword":"restaurant"}

输入: "上海外滩附近有药店吗"
输出: {"location":"上海外滩","poiType":"药店","poiKeyword":"pharmacy"}`

  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        stream: false,
        format: 'json',
      }),
    })
    const data = await res.json() as { message?: { content?: string } }
    const raw = data.message?.content ?? '{}'
    // 从返回内容中提取 JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('AI 未返回有效 JSON')
    const parsed = JSON.parse(jsonMatch[0]) as ParsedIntent
    if (!parsed.location) throw new Error('未提取到地点')
    // 默认值
    parsed.poiType    = parsed.poiType    || '地点'
    parsed.poiKeyword = parsed.poiKeyword || 'place'
    return parsed
  } catch (err) {
    console.error('[extractIntent] Ollama 调用失败，使用正则回退:', err)
    return regexFallback(question)
  }
}

/** 当 Ollama 不可用时的正则回退方案 */
function regexFallback(question: string): ParsedIntent {
  // "XX附近有什么YY" / "XX附近的YY"
  const m = question.match(/(.+?)附近.{0,4}([\u4e00-\u9fa5]{1,6})[？?]?$/)
  if (m) {
    const poiType = m[2]
    const keywordMap: Record<string, string> = {
      '咖啡': 'coffee', '咖啡店': 'coffee', '咖啡馆': 'coffee',
      '餐厅': 'restaurant', '饭店': 'restaurant', '美食': 'restaurant',
      '酒店': 'hotel', '宾馆': 'hotel', '住宿': 'hotel',
      '超市': 'supermarket', '便利店': 'convenience store',
      '药店': 'pharmacy', '医院': 'hospital',
      '学校': 'school', '公园': 'park', '银行': 'bank',
      '地铁站': 'metro station', '加油站': 'gas station',
      '停车场': 'parking', '书店': 'bookstore',
    }
    return {
      location: m[1].trim(),
      poiType,
      poiKeyword: keywordMap[poiType] || poiType,
    }
  }
  return { location: question, poiType: '地点', poiKeyword: 'place' }
}

// ============================================================
// 2. Mapbox Geocoding — 地点名称 → 经纬度
// ============================================================
interface GeocodingResult {
  lng: number
  lat: number
  placeName: string
}

async function geocodeLocation(location: string): Promise<GeocodingResult> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json`
    + `?access_token=${MAPBOX_TOKEN}&language=zh&limit=1&types=poi,address,place,locality,neighborhood`
  const res = await fetch(url)
  const data = await res.json() as {
    features?: { center: [number, number]; place_name: string }[]
  }
  if (!data.features?.length) {
    throw new Error(`无法定位 "${location}"，请尝试更精确的地点描述`)
  }
  const f = data.features[0]
  return { lng: f.center[0], lat: f.center[1], placeName: f.place_name }
}

// ============================================================
// 3. Mapbox POI Search — 在坐标附近搜 POI
// ============================================================
interface POIResult {
  name: string
  address: string
  lng: number
  lat: number
  category: string
  distance?: number // 米
}

async function searchPOI(
  keyword: string,
  lng: number,
  lat: number,
  limit = 10
): Promise<POIResult[]> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(keyword)}.json`
    + `?access_token=${MAPBOX_TOKEN}`
    + `&proximity=${lng},${lat}`
    + `&language=zh`
    + `&types=poi`
    + `&limit=${limit}`
  const res = await fetch(url)
  const data = await res.json() as {
    features?: {
      text: string
      place_name: string
      center: [number, number]
      properties?: { category?: string }
    }[]
  }
  if (!data.features?.length) return []

  return data.features.map(f => {
    const poiLng = f.center[0]
    const poiLat = f.center[1]
    // Haversine 距离（米）
    const R = 6371000
    const dLat = (poiLat - lat) * Math.PI / 180
    const dLng = (poiLng - lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat * Math.PI / 180) * Math.cos(poiLat * Math.PI / 180)
      * Math.sin(dLng / 2) ** 2
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return {
      name: f.text,
      address: f.place_name,
      lng: poiLng,
      lat: poiLat,
      category: f.properties?.category ?? '',
      distance: Math.round(dist),
    }
  })
}

// ============================================================
// 4. 主路由  POST /api/poi-search
// ============================================================
app.post('/api/poi-search', async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string }
  if (!question?.trim()) {
    res.status(400).json({ success: false, message: '请输入问题' })
    return
  }

  try {
    // Step 1: AI 意图提取
    const intent = await extractIntent(question)
    console.log('[MCP] 意图提取:', intent)

    // Step 2: Geocoding
    const geo = await geocodeLocation(intent.location)
    console.log('[MCP] 地理编码:', geo)

    // Step 3: POI Search
    const pois = await searchPOI(intent.poiKeyword, geo.lng, geo.lat)
    console.log(`[MCP] 找到 ${pois.length} 个 POI`)

    // Step 4: 构造回复
    let reply = `📍 已定位「${intent.location}」(${geo.lng.toFixed(4)}, ${geo.lat.toFixed(4)})\n`
    if (pois.length === 0) {
      reply += `\n😕 附近未找到「${intent.poiType}」相关的地点`
    } else {
      reply += `\n☕ 附近找到 ${pois.length} 个「${intent.poiType}」：\n`
      pois.forEach((p, i) => {
        const dist = p.distance! >= 1000
          ? `${(p.distance! / 1000).toFixed(1)}km`
          : `${p.distance}m`
        reply += `\n${i + 1}. ${p.name}  (${dist})\n   ${p.address}`
      })
    }

    res.json({
      success: true,
      intent,
      center: { lng: geo.lng, lat: geo.lat, placeName: geo.placeName },
      pois,
      reply,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '搜索失败'
    console.error('[MCP] 错误:', msg)
    res.status(500).json({ success: false, message: msg })
  }
})

// ============================================================
// 5. 深圳学校数据  GET /api/schools
//    优先读取爬取生成的 JSON (public/shenzhen-schools.json)
//    若不存在则返回内置兜底数据
//    数据来源: https://www.sz.gov.cn/school/
//    爬取命令: cd server && npm run crawl
// ============================================================
import * as fs from 'fs'
import * as path from 'path'

interface SchoolItem {
  name: string
  lng: number
  lat: number
  type: 'primary' | 'middle'
  district?: string
  address: string
  nature?: string
  category?: string
}

/** 尝试从文件加载爬取数据 */
function loadCrawledSchools(): SchoolItem[] | null {
  const filePath = path.resolve(__dirname, '../../public/shenzhen-schools.json')
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw) as SchoolItem[]
      if (data.length > 0) {
        console.log(`[Schools] 从 ${filePath} 加载了 ${data.length} 所学校`)
        return data
      }
    }
  } catch (err) {
    console.warn('[Schools] 加载爬取数据失败:', err)
  }
  return null
}

/** 内置兜底数据（部分学校） */
const BUILTIN_SCHOOLS: SchoolItem[] = [
  // ==================== 福田区 ====================
  // 小学
  { name: '深圳实验学校小学部', lng: 114.0589, lat: 22.5413, type: 'primary', address: '福田区百花二路' },
  { name: '荔园小学', lng: 114.0551, lat: 22.5362, type: 'primary', address: '福田区百花一路' },
  { name: '园岭小学', lng: 114.0680, lat: 22.5480, type: 'primary', address: '福田区园岭新村' },
  { name: '福田小学', lng: 114.0510, lat: 22.5230, type: 'primary', address: '福田区福强路' },
  { name: '翠竹外国语实验学校', lng: 114.0620, lat: 22.5440, type: 'primary', address: '福田区翠竹路' },
  { name: '百花小学', lng: 114.0560, lat: 22.5390, type: 'primary', address: '福田区百花五路' },
  { name: '南园小学', lng: 114.0710, lat: 22.5320, type: 'primary', address: '福田区松岭路' },
  { name: '华富小学', lng: 114.0430, lat: 22.5370, type: 'primary', address: '福田区华富路' },
  { name: '众孚小学', lng: 114.0780, lat: 22.5280, type: 'primary', address: '福田区福民路' },
  { name: '天健小学', lng: 114.0490, lat: 22.5310, type: 'primary', address: '福田区天健花园' },
  { name: '梅山小学', lng: 114.0535, lat: 22.5465, type: 'primary', address: '福田区梅林路' },
  { name: '下沙小学', lng: 114.0280, lat: 22.5190, type: 'primary', address: '福田区下沙村' },
  { name: '福南小学', lng: 114.0610, lat: 22.5245, type: 'primary', address: '福田区福南路' },
  { name: '岗厦小学', lng: 114.0690, lat: 22.5340, type: 'primary', address: '福田区岗厦村' },
  // 初中
  { name: '深圳实验学校中学部', lng: 114.0615, lat: 22.5452, type: 'middle', address: '福田区百花六路' },
  { name: '深圳高级中学初中部', lng: 114.0280, lat: 22.5320, type: 'middle', address: '福田区农林路' },
  { name: '福田区外国语学校', lng: 114.0390, lat: 22.5280, type: 'middle', address: '福田区景田北路' },
  { name: '红岭中学园岭校区', lng: 114.0710, lat: 22.5510, type: 'middle', address: '福田区园岭九街' },
  { name: '北环中学', lng: 114.0470, lat: 22.5530, type: 'middle', address: '福田区北环大道' },
  { name: '莲花中学', lng: 114.0540, lat: 22.5480, type: 'middle', address: '福田区莲花路' },
  { name: '石厦学校', lng: 114.0420, lat: 22.5245, type: 'middle', address: '福田区石厦北二街' },
  { name: '上步中学', lng: 114.0780, lat: 22.5395, type: 'middle', address: '福田区上步路' },
  { name: '梅林中学', lng: 114.0510, lat: 22.5550, type: 'middle', address: '福田区梅华路' },
  { name: '侨香外国语学校', lng: 114.0335, lat: 22.5440, type: 'middle', address: '福田区侨香路' },

  // ==================== 南山区 ====================
  // 小学
  { name: '南山实验学校南头小学', lng: 113.9280, lat: 22.5340, type: 'primary', address: '南山区南头街道' },
  { name: '育才一小', lng: 113.9370, lat: 22.5120, type: 'primary', address: '南山区蛇口育才路' },
  { name: '育才二小', lng: 113.9320, lat: 22.5090, type: 'primary', address: '南山区蛇口工业八路' },
  { name: '南山外国语学校科苑小学', lng: 113.9550, lat: 22.5380, type: 'primary', address: '南山区科苑路' },
  { name: '海滨实验小学', lng: 113.9410, lat: 22.5070, type: 'primary', address: '南山区工业七路' },
  { name: '学府小学', lng: 113.9400, lat: 22.5350, type: 'primary', address: '南山区学府路' },
  { name: '深圳大学附属小学', lng: 113.9380, lat: 22.5420, type: 'primary', address: '南山区深大北门' },
  { name: '前海小学', lng: 113.9050, lat: 22.5340, type: 'primary', address: '南山区前海路' },
  { name: '南头城小学', lng: 113.9220, lat: 22.5380, type: 'primary', address: '南山区南头古城' },
  { name: '南油小学', lng: 113.9450, lat: 22.5220, type: 'primary', address: '南山区南油大道' },
  { name: '蛇口学校小学部', lng: 113.9290, lat: 22.4850, type: 'primary', address: '南山区蛇口' },
  { name: '后海小学', lng: 113.9490, lat: 22.5170, type: 'primary', address: '南山区后海大道' },
  { name: '西丽小学', lng: 113.9470, lat: 22.5770, type: 'primary', address: '南山区西丽镇' },
  // 初中
  { name: '育才中学', lng: 113.9360, lat: 22.5100, type: 'middle', address: '南山区蛇口工业六路' },
  { name: '南山实验学校麒麟中学', lng: 113.9430, lat: 22.5350, type: 'middle', address: '南山区南光路' },
  { name: '南山外国语学校滨海中学', lng: 113.9610, lat: 22.5260, type: 'middle', address: '南山区滨海大道' },
  { name: '蛇口育才教育集团太子湾学校', lng: 113.9230, lat: 22.4890, type: 'middle', address: '南山区蛇口太子湾' },
  { name: '南头中学', lng: 113.9260, lat: 22.5330, type: 'middle', address: '南山区深南大道' },
  { name: '前海学校', lng: 113.9090, lat: 22.5370, type: 'middle', address: '南山区前海花园' },
  { name: '北师大南山附属学校', lng: 113.9510, lat: 22.5390, type: 'middle', address: '南山区科技南路' },
  { name: '南山第二外国语学校', lng: 113.9570, lat: 22.5450, type: 'middle', address: '南山区海德一道' },
  { name: '桃源中学', lng: 113.9500, lat: 22.5700, type: 'middle', address: '南山区龙珠大道' },
  { name: '西丽第二中学', lng: 113.9530, lat: 22.5810, type: 'middle', address: '南山区西丽' },

  // ==================== 罗湖区 ====================
  // 小学
  { name: '深圳小学', lng: 114.1210, lat: 22.5480, type: 'primary', address: '罗湖区人民北路' },
  { name: '翠竹小学', lng: 114.1180, lat: 22.5560, type: 'primary', address: '罗湖区翠竹路' },
  { name: '螺岭外国语实验学校', lng: 114.1290, lat: 22.5510, type: 'primary', address: '罗湖区凤凰路' },
  { name: '洪湖小学', lng: 114.1150, lat: 22.5640, type: 'primary', address: '罗湖区洪湖路' },
  { name: '布心小学', lng: 114.1440, lat: 22.5650, type: 'primary', address: '罗湖区布心路' },
  { name: '东晓小学', lng: 114.1380, lat: 22.5610, type: 'primary', address: '罗湖区东晓路' },
  { name: '锦田小学', lng: 114.1120, lat: 22.5510, type: 'primary', address: '罗湖区贝丽路' },
  { name: '笋岗小学', lng: 114.1050, lat: 22.5590, type: 'primary', address: '罗湖区笋岗路' },
  { name: '水库小学', lng: 114.1450, lat: 22.5720, type: 'primary', address: '罗湖区太安路' },
  { name: '碧波小学', lng: 114.1370, lat: 22.5540, type: 'primary', address: '罗湖区沿河北路' },
  // 初中
  { name: '深圳中学初中部', lng: 114.1260, lat: 22.5550, type: 'middle', address: '罗湖区贝丽北路' },
  { name: '翠园中学初中部', lng: 114.1340, lat: 22.5570, type: 'middle', address: '罗湖区东门北路' },
  { name: '罗湖外语学校', lng: 114.1490, lat: 22.5680, type: 'middle', address: '罗湖区布心路' },
  { name: '桂园中学', lng: 114.1190, lat: 22.5530, type: 'middle', address: '罗湖区桂园路' },
  { name: '笋岗中学', lng: 114.1060, lat: 22.5620, type: 'middle', address: '罗湖区笋岗路' },
  { name: '松泉中学', lng: 114.1410, lat: 22.5610, type: 'middle', address: '罗湖区太白路' },
  { name: '文锦中学', lng: 114.1200, lat: 22.5445, type: 'middle', address: '罗湖区文锦中路' },
  { name: '东湖中学', lng: 114.1530, lat: 22.5580, type: 'middle', address: '罗湖区东湖路' },

  // ==================== 宝安区 ====================
  // 小学
  { name: '宝安中学附属小学', lng: 113.8910, lat: 22.5560, type: 'primary', address: '宝安区新安街道' },
  { name: '宝民小学', lng: 113.8830, lat: 22.5530, type: 'primary', address: '宝安区宝民路' },
  { name: '新安中学外国语学校', lng: 113.8870, lat: 22.5510, type: 'primary', address: '宝安区新安四路' },
  { name: '弘雅小学', lng: 113.8900, lat: 22.5640, type: 'primary', address: '宝安区弘雅路' },
  { name: '西乡小学', lng: 113.8620, lat: 22.5650, type: 'primary', address: '宝安区西乡街道' },
  { name: '固戍小学', lng: 113.8440, lat: 22.5580, type: 'primary', address: '宝安区固戍路' },
  { name: '沙井中心小学', lng: 113.8210, lat: 22.5880, type: 'primary', address: '宝安区沙井街道' },
  { name: '松岗第一小学', lng: 113.8340, lat: 22.6380, type: 'primary', address: '宝安区松岗街道' },
  { name: '福永小学', lng: 113.8280, lat: 22.5710, type: 'primary', address: '宝安区福永街道' },
  { name: '石岩小学', lng: 113.8960, lat: 22.6130, type: 'primary', address: '宝安区石岩街道' },
  { name: '航城学校', lng: 113.8370, lat: 22.5560, type: 'primary', address: '宝安区航城街道' },
  { name: '黄田小学', lng: 113.8250, lat: 22.5650, type: 'primary', address: '宝安区黄田路' },
  // 初中
  { name: '宝安中学', lng: 113.8880, lat: 22.5550, type: 'middle', address: '宝安区洪浪北路' },
  { name: '新安中学', lng: 113.8920, lat: 22.5590, type: 'middle', address: '宝安区新安三路' },
  { name: '海湾中学', lng: 113.8780, lat: 22.5620, type: 'middle', address: '宝安区新安街道' },
  { name: '文汇学校', lng: 113.8710, lat: 22.5600, type: 'middle', address: '宝安区西乡路' },
  { name: '松岗中学', lng: 113.8350, lat: 22.6420, type: 'middle', address: '宝安区松岗街道' },
  { name: '沙井中学', lng: 113.8190, lat: 22.5910, type: 'middle', address: '宝安区沙井街道' },

  // ==================== 龙岗区 ====================
  // 小学
  { name: '龙岗中心小学', lng: 114.2510, lat: 22.7230, type: 'primary', address: '龙岗区龙岗街道' },
  { name: '龙城小学', lng: 114.2380, lat: 22.7180, type: 'primary', address: '龙岗区龙城街道' },
  { name: '清林小学', lng: 114.2350, lat: 22.7250, type: 'primary', address: '龙岗区龙城街道' },
  { name: '依山郡小学', lng: 114.2210, lat: 22.7130, type: 'primary', address: '龙岗区中心城' },
  { name: '布吉中心小学', lng: 114.1230, lat: 22.5940, type: 'primary', address: '龙岗区布吉街道' },
  { name: '坂田小学', lng: 114.0710, lat: 22.6170, type: 'primary', address: '龙岗区坂田街道' },
  { name: '平湖中心小学', lng: 114.1580, lat: 22.6480, type: 'primary', address: '龙岗区平湖街道' },
  { name: '横岗中心小学', lng: 114.1960, lat: 22.6570, type: 'primary', address: '龙岗区横岗街道' },
  { name: '南湾学校小学部', lng: 114.1380, lat: 22.5970, type: 'primary', address: '龙岗区南湾街道' },
  { name: '吉祥小学', lng: 114.1220, lat: 22.5890, type: 'primary', address: '龙岗区布吉街道' },
  // 初中
  { name: '龙城初级中学', lng: 114.2420, lat: 22.7200, type: 'middle', address: '龙岗区龙城街道' },
  { name: '新梓学校', lng: 114.2480, lat: 22.7150, type: 'middle', address: '龙岗区龙岗街道' },
  { name: '布吉中学', lng: 114.1250, lat: 22.5980, type: 'middle', address: '龙岗区布吉街道' },
  { name: '坂田中学', lng: 114.0750, lat: 22.6200, type: 'middle', address: '龙岗区坂田街道' },
  { name: '平湖中学', lng: 114.1620, lat: 22.6510, type: 'middle', address: '龙岗区平湖街道' },
  { name: '横岗中学', lng: 114.1990, lat: 22.6600, type: 'middle', address: '龙岗区横岗街道' },
  { name: '南联学校', lng: 114.2460, lat: 22.7100, type: 'middle', address: '龙岗区南联路' },
  { name: '兰著学校', lng: 114.2310, lat: 22.7190, type: 'middle', address: '龙岗区龙城街道' },

  // ==================== 龙华区 ====================
  // 小学
  { name: '龙华中心小学', lng: 114.0370, lat: 22.6540, type: 'primary', address: '龙华区龙华街道' },
  { name: '民治小学', lng: 114.0340, lat: 22.6270, type: 'primary', address: '龙华区民治街道' },
  { name: '龙华实验学校', lng: 114.0420, lat: 22.6490, type: 'primary', address: '龙华区龙华路' },
  { name: '书香小学', lng: 114.0300, lat: 22.6440, type: 'primary', address: '龙华区大浪街道' },
  { name: '玉龙学校小学部', lng: 114.0480, lat: 22.6580, type: 'primary', address: '龙华区观澜街道' },
  { name: '高峰学校', lng: 114.0260, lat: 22.6350, type: 'primary', address: '龙华区民治街道' },
  { name: '上芬小学', lng: 114.0330, lat: 22.6600, type: 'primary', address: '龙华区上芬路' },
  { name: '观澜中心小学', lng: 114.0710, lat: 22.6860, type: 'primary', address: '龙华区观澜街道' },
  { name: '大浪实验学校', lng: 114.0200, lat: 22.6540, type: 'primary', address: '龙华区大浪街道' },
  // 初中
  { name: '龙华中学', lng: 114.0400, lat: 22.6570, type: 'middle', address: '龙华区龙华街道' },
  { name: '民治中学', lng: 114.0360, lat: 22.6300, type: 'middle', address: '龙华区民治街道' },
  { name: '观澜中学', lng: 114.0740, lat: 22.6890, type: 'middle', address: '龙华区观澜街道' },
  { name: '新华中学', lng: 114.0430, lat: 22.6510, type: 'middle', address: '龙华区龙华街道' },
  { name: '潜龙学校', lng: 114.0290, lat: 22.6400, type: 'middle', address: '龙华区民治街道' },
  { name: '大浪实验学校初中部', lng: 114.0190, lat: 22.6530, type: 'middle', address: '龙华区大浪街道' },

  // ==================== 光明区 ====================
  // 小学
  { name: '光明小学', lng: 113.9350, lat: 22.7480, type: 'primary', address: '光明区光明街道' },
  { name: '实验学校', lng: 113.9270, lat: 22.7450, type: 'primary', address: '光明区光明大道' },
  { name: '公明第一小学', lng: 113.8980, lat: 22.7410, type: 'primary', address: '光明区公明街道' },
  { name: '公明第二小学', lng: 113.9020, lat: 22.7370, type: 'primary', address: '光明区公明街道' },
  { name: '马田小学', lng: 113.9110, lat: 22.7260, type: 'primary', address: '光明区马田街道' },
  { name: '玉律小学', lng: 113.9180, lat: 22.7330, type: 'primary', address: '光明区玉塘街道' },
  { name: '凤凰小学', lng: 113.9350, lat: 22.7560, type: 'primary', address: '光明区凤凰街道' },
  // 初中
  { name: '光明中学', lng: 113.9320, lat: 22.7510, type: 'middle', address: '光明区光明街道' },
  { name: '公明中学', lng: 113.8950, lat: 22.7430, type: 'middle', address: '光明区公明街道' },
  { name: '长圳学校', lng: 113.9130, lat: 22.7290, type: 'middle', address: '光明区马田街道' },
  { name: '凤凰学校', lng: 113.9380, lat: 22.7580, type: 'middle', address: '光明区凤凰街道' },

  // ==================== 坪山区 ====================
  // 小学
  { name: '坪山实验学校小学部', lng: 114.3460, lat: 22.6920, type: 'primary', address: '坪山区坪山街道' },
  { name: '坪山中心小学', lng: 114.3380, lat: 22.6880, type: 'primary', address: '坪山区坪山街道' },
  { name: '坑梓中心小学', lng: 114.3720, lat: 22.7020, type: 'primary', address: '坪山区坑梓街道' },
  { name: '碧岭小学', lng: 114.3560, lat: 22.6840, type: 'primary', address: '坪山区碧岭路' },
  { name: '汤坑小学', lng: 114.3510, lat: 22.6960, type: 'primary', address: '坪山区汤坑路' },
  { name: '六联小学', lng: 114.3420, lat: 22.6840, type: 'primary', address: '坪山区六联路' },
  // 初中
  { name: '坪山中学', lng: 114.3490, lat: 22.6950, type: 'middle', address: '坪山区坪山街道' },
  { name: '坑梓中学', lng: 114.3750, lat: 22.7050, type: 'middle', address: '坪山区坑梓街道' },
  { name: '光祖中学', lng: 114.3390, lat: 22.6870, type: 'middle', address: '坪山区坪山路' },

  // ==================== 盐田区 ====================
  // 小学
  { name: '盐田区外国语小学', lng: 114.2340, lat: 22.5550, type: 'primary', address: '盐田区盐田路' },
  { name: '田心小学', lng: 114.2280, lat: 22.5590, type: 'primary', address: '盐田区田心路' },
  { name: '海涛小学', lng: 114.2410, lat: 22.5530, type: 'primary', address: '盐田区海涛路' },
  { name: '田东小学', lng: 114.2470, lat: 22.5560, type: 'primary', address: '盐田区田东路' },
  { name: '梅沙小学', lng: 114.2720, lat: 22.5590, type: 'primary', address: '盐田区大梅沙' },
  { name: '盐港小学', lng: 114.2520, lat: 22.5540, type: 'primary', address: '盐田区盐港路' },
  // 初中
  { name: '盐田实验学校', lng: 114.2360, lat: 22.5580, type: 'middle', address: '盐田区盐田街道' },
  { name: '田东中学', lng: 114.2490, lat: 22.5580, type: 'middle', address: '盐田区田东路' },
  { name: '盐田外国语学校', lng: 114.2310, lat: 22.5560, type: 'middle', address: '盐田区盐田路' },

  // ==================== 大鹏新区 ====================
  // 小学
  { name: '大鹏中心小学', lng: 114.4810, lat: 22.5910, type: 'primary', address: '大鹏新区大鹏街道' },
  { name: '葵涌中心小学', lng: 114.4050, lat: 22.6340, type: 'primary', address: '大鹏新区葵涌街道' },
  { name: '葵涌第二小学', lng: 114.4110, lat: 22.6310, type: 'primary', address: '大鹏新区葵涌街道' },
  { name: '南澳中心小学', lng: 114.5100, lat: 22.5350, type: 'primary', address: '大鹏新区南澳街道' },
  // 初中
  { name: '大鹏中学', lng: 114.4830, lat: 22.5940, type: 'middle', address: '大鹏新区大鹏街道' },
  { name: '葵涌中学', lng: 114.4080, lat: 22.6370, type: 'middle', address: '大鹏新区葵涌街道' },
  { name: '亚迪学校', lng: 114.4130, lat: 22.6290, type: 'middle', address: '大鹏新区葵涌街道' },
]

// 加载学校数据：优先爬取文件 → 兜底内置数据
const SHENZHEN_SCHOOLS: SchoolItem[] = loadCrawledSchools() ?? BUILTIN_SCHOOLS

app.get('/api/schools', (_req: Request, res: Response) => {
  // 每次请求尝试热加载最新爬取数据
  const fresh = loadCrawledSchools()
  const data = fresh ?? SHENZHEN_SCHOOLS
  res.json({ success: true, total: data.length, schools: data })
})

// ============================================================
// 健康检查
// ============================================================
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mapbox-mcp-proxy' })
})

// ============================================================
// 启动
// ============================================================
const PORT = 3002
app.listen(PORT, () => {
  console.log(`\n🚀 Mapbox MCP 代理服务运行在 http://localhost:${PORT}`)
  console.log(`   POST /api/poi-search  { question: "深圳盛港国际科技园附近有什么咖啡店？" }`)
  console.log(`   GET  /api/schools     深圳小学初中学校数据`)
  console.log(`   GET  /api/health\n`)
})
