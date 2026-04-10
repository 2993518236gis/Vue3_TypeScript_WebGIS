CREATE DATABASE IF NOT EXISTS vue3_auth DEFAULT CHARSET utf8mb4;

USE vue3_auth;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初始账号：admin / admin123（bcryptjs hash，cost=10）
INSERT IGNORE INTO users (username, password)
VALUES ('admin', '$2a$10$PrAJjuJxwvmQNb5yaVlxw.7McjV6V6mrasF2S9uNHPvjjFCFdKxpu');
