// 这个文件负责处理新用户的注册请求

/**
 * 一个安全的哈希函数，用于处理用户密码。
 * 它使用 Web Crypto API，这是在 Workers 环境中进行加密操作的标准方式。
 * @param {string} password - 用户输入的明文密码.
 * @returns {Promise<string>} - 返回哈希后的密码 (Base64格式).
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    // 使用 SHA-256 算法，足够安全
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    // 将 ArrayBuffer 转换为 Base64 字符串以便存储
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));
    return hashBase64;
}

/**
 * onRequestPost 函数专门处理 POST 方法的请求
 * @param {object} context - 由 Cloudflare 提供的上下文对象
 * @param {Request} context.request - HTTP 请求对象
 * @param {object} context.env - 环境变量，我们的数据库绑定 (env.DB)就在这里
 */
export async function onRequestPost({ request, env }) {
    try {
        // 1. 从请求体中解析出 JSON 数据
        const { username, password } = await request.json();

        // 2. 基础验证：确保用户名和密码不为空
        if (!username || !password) {
            return new Response(JSON.stringify({ error: 'Username and password are required' }), {
                status: 400, // 400 Bad Request
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 3. 检查用户名是否已经被注册
        const checkUserSql = 'SELECT id FROM users WHERE username = ?';
        const existingUser = await env.DB.prepare(checkUserSql).bind(username).first();
        
        if (existingUser) {
            return new Response(JSON.stringify({ error: 'Username already exists' }), {
                status: 409, // 409 Conflict
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 4. 对密码进行哈希处理，【绝不】存储明文密码！
        const hashedPassword = await hashPassword(password);

        // 5. 生成一个唯一的用户 ID (UUID)
        const userId = crypto.randomUUID();
        const createdAt = Date.now(); // 记录当前时间戳

        // 6. 将新用户信息插入到 `users` 表中
        const insertUserSql = 'INSERT INTO users (id, username, hashed_password, created_at) VALUES (?, ?, ?, ?)';
        const { success } = await env.DB.prepare(insertUserSql)
                                       .bind(userId, username, hashedPassword, createdAt)
                                       .run();

        // 7. 检查插入操作是否成功
        if (!success) {
            throw new Error('Failed to register user in the database.');
        }

        // 8. 返回成功的响应
        return new Response(JSON.stringify({ message: 'User registered successfully' }), {
            status: 201, // 201 Created
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        // 捕获所有可能发生的错误（如JSON解析失败、数据库操作失败等）
        console.error('Registration Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
            status: 500, // 500 Internal Server Error
            headers: { 'Content-Type': 'application/json' },
        });
    }
}