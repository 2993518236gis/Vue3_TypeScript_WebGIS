import express, { Request, Response } from 'express'
import mysql, { RowDataPacket } from 'mysql2/promise'
import cors from 'cors'
import bcrypt from 'bcryptjs'

const app = express()
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root',      // 修改为你的 MySQL 密码
  database: 'vue3_auth',
  waitForConnections: true,
  connectionLimit: 10
})

interface UserRow extends RowDataPacket {
  id: number
  username: string
  password: string
}

app.post('/api/login', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string }
  if (!username || !password) {
    res.status(400).json({ success: false, message: '用户名和密码不能为空' })
    return
  }
  try {
    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, username, password FROM users WHERE username = ?',
      [username]
    )
    if (rows.length === 0) {
      res.status(401).json({ success: false, message: '用户名或密码错误' })
      return
    }
    const match = await bcrypt.compare(password, rows[0].password)
    if (!match) {
      res.status(401).json({ success: false, message: '用户名或密码错误' })
      return
    }
    res.json({ success: true, user: { id: rows[0].id, username: rows[0].username } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: '服务器错误' })
  }
})

app.listen(3001, () => console.log('后端服务运行在 http://localhost:3001'))
