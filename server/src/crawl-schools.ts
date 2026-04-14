/**
 * 深圳学校数据爬取脚本
 *
 * 数据来源: https://www.sz.gov.cn/school/
 * 功能: 爬取页面上所有小学/初中/九年一贯制学校 → 用高德地理编码获取坐标 → 输出 JSON
 *
 * 运行: cd server && npx ts-node-dev src/crawl-schools.ts
 */

import * as http from 'http'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'

// ---- 配置 ----
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN || ''

interface RawSchool {
  id: string
  name: string
  xxlb: string
  szq: string
  xxdz: string
  xxxz: string
}

interface SchoolItem {
  name: string
  lng: number
  lat: number
  type: 'primary' | 'middle'
  district: string
  address: string
  nature: string   // 公办/民办
  category: string // 原始类别
}

// ============================================================
// 1. 从 www.sz.gov.cn/school/ 爬取原始学校数据
// ============================================================
function fetchSchoolPage(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'www.sz.gov.cn', path: '/school/', headers: { 'User-Agent': 'Mozilla/5.0' } },
      (res) => {
        let body = ''
        res.on('data', (d: Buffer) => (body += d.toString()))
        res.on('end', () => resolve(body))
      }
    )
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')) })
    req.end()
  })
}

function parseSchools(html: string): RawSchool[] {
  const re = /var one_(\d+)\s*=\s*\{\};\s*([\s\S]*?)(?:ssdatasDataAry|qsdatasDataAry)\.push\(one_\1\);/g
  let m: RegExpExecArray | null
  const schools: RawSchool[] = []
  while ((m = re.exec(html)) !== null) {
    const block = m[2]
    const nameM = block.match(/\.name="([^"]+)"/)
    const xxlbM = block.match(/\.xxlb=\[([^\]]*)\]/)
    const szqM = block.match(/\.szq="([^"]+)"/)
    const xxdzM = block.match(/\.xxdz="([^"]+)"/)
    const xxxzM = block.match(/\.xxxz="([^"]+)"/)
    const xxlb = xxlbM ? xxlbM[1].replace(/"/g, '') : ''
    // 只保留小学、初中、九年一贯制
    if (
      xxlb.includes('小学') ||
      xxlb.includes('初级中学') ||
      xxlb.includes('初中') ||
      xxlb.includes('九年一贯')
    ) {
      schools.push({
        id: m[1],
        name: nameM ? nameM[1] : '',
        xxlb: xxlb,
        szq: szqM ? szqM[1] : '',
        xxdz: xxdzM ? xxdzM[1] : '',
        xxxz: xxxzM ? xxxzM[1] : '',
      })
    }
  }
  return schools
}

// ============================================================
// 2. 高德地理编码 (免费、中国数据精准、无需注册即可用于少量请求)
//    回退: Nominatim (OpenStreetMap)
// ============================================================
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = ''
      res.on('data', (d: Buffer) => (body += d.toString()))
      res.on('end', () => resolve(body))
    }).on('error', reject)
  })
}

/** 用 Nominatim (OSM) 地理编码 */
async function geocodeNominatim(address: string): Promise<{ lng: number; lat: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=cn`
    const data = await httpsGet(url)
    const results = JSON.parse(data) as { lon: string; lat: string }[]
    if (results.length > 0) {
      return { lng: parseFloat(results[0].lon), lat: parseFloat(results[0].lat) }
    }
  } catch { /* ignore */ }
  return null
}

/** 用 Mapbox 地理编码 */
async function geocodeMapbox(address: string): Promise<{ lng: number; lat: number } | null> {
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
      + `?access_token=${MAPBOX_TOKEN}&language=zh&limit=1`
    const data = await httpsGet(url)
    const result = JSON.parse(data) as { features?: { center: [number, number] }[] }
    if (result.features && result.features.length > 0) {
      return { lng: result.features[0].center[0], lat: result.features[0].center[1] }
    }
  } catch { /* ignore */ }
  return null
}

/** 综合地理编码: Nominatim → Mapbox fallback */
async function geocode(address: string, name: string): Promise<{ lng: number; lat: number } | null> {
  // 优先用 Nominatim（对中国学校地址效果好）
  let result = await geocodeNominatim(address)
  if (result && isInShenzhen(result.lng, result.lat)) return result

  // 尝试用 学校名+深圳
  result = await geocodeNominatim(`深圳${name}`)
  if (result && isInShenzhen(result.lng, result.lat)) return result

  // Mapbox 作为 fallback
  await sleep(100) // 速率限制
  result = await geocodeMapbox(address)
  if (result && isInShenzhen(result.lng, result.lat)) return result

  result = await geocodeMapbox(`深圳${name}`)
  if (result && isInShenzhen(result.lng, result.lat)) return result

  return null
}

function isInShenzhen(lng: number, lat: number): boolean {
  return lng >= 113.7 && lng <= 114.7 && lat >= 22.3 && lat <= 22.9
}

// ============================================================
// 3. 批量地理编码 + 输出
// ============================================================
async function main() {
  console.log('🕷️  正在从 www.sz.gov.cn/school/ 爬取学校数据...')
  const html = await fetchSchoolPage()
  const rawSchools = parseSchools(html)
  console.log(`📊 解析到 ${rawSchools.length} 所小学/初中/九年一贯制学校`)

  // 去重
  const seen = new Set<string>()
  const unique = rawSchools.filter(s => {
    if (seen.has(s.name)) return false
    seen.add(s.name)
    return true
  })
  console.log(`🔄 去重后 ${unique.length} 所`)

  const results: SchoolItem[] = []
  let geocoded = 0
  let failed = 0

  for (let i = 0; i < unique.length; i++) {
    const s = unique[i]
    if (i % 50 === 0) console.log(`⏳ 地理编码进度: ${i}/${unique.length}`)

    const coord = await geocode(s.xxdz, s.name)
    await sleep(1100) // Nominatim 要求 1 请求/秒

    if (coord) {
      geocoded++
      results.push({
        name: s.name,
        lng: coord.lng,
        lat: coord.lat,
        type: s.xxlb.includes('小学') ? 'primary' : 'middle',
        district: s.szq,
        address: s.xxdz,
        nature: s.xxxz,
        category: s.xxlb,
      })
    } else {
      failed++
      console.log(`  ⚠️ 编码失败: ${s.name} | ${s.xxdz}`)
    }
  }

  console.log(`\n✅ 完成! 成功: ${geocoded}, 失败: ${failed}`)

  // 保存到 public 目录
  const outPath = path.resolve(__dirname, '../../public/shenzhen-schools.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8')
  console.log(`💾 已保存到 ${outPath}`)

  // 同时生成 TypeScript 数据文件供后端直接使用
  const tsPath = path.resolve(__dirname, './schools-data.ts')
  const tsContent = `// 自动生成 - 来源 www.sz.gov.cn/school/\n// 生成时间: ${new Date().toISOString()}\n// 共 ${results.length} 所学校\n\nexport interface SchoolItem {\n  name: string\n  lng: number\n  lat: number\n  type: 'primary' | 'middle'\n  district: string\n  address: string\n  nature: string\n  category: string\n}\n\nexport const SHENZHEN_SCHOOLS: SchoolItem[] = ${JSON.stringify(results, null, 2)}\n`
  fs.writeFileSync(tsPath, tsContent, 'utf-8')
  console.log(`💾 已保存到 ${tsPath}`)
}

main().catch(err => {
  console.error('❌ 爬取失败:', err)
  process.exit(1)
})
