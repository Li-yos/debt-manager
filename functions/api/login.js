// 这个文件负责处理用户的登录请求

// 我们需要复用注册时的密码哈希函数
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return btoa(String.fromCharCode.apply(null, hashArray));
}

export async function onRequestPost({ request, env }) {
    try {
        // 1. 获取用户名和密码
        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(JSON.stringify({ error: 'Username and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. 在数据库中查找用户
        const userQuery = 'SELECT id, hashed_password FROM users WHERE username = ?';
        const user = await env.DB.prepare(userQuery).bind(username).first();

        // 3. 如果用户不存在，返回错误
        if (!user) {
            return new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        // 4. 哈希用户输入的密码，并与数据库中的哈希值进行比较
        const inputHashedPassword = await hashPassword(password);
        if (inputHashedPassword !== user.hashed_password) {
            return new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        // 5. 登录成功！创建一个新的 session 和 token
        const token = crypto.randomUUID();
        const userId = user.id;
        // 设置 token 7 天后过期 (7 days * 24 hours * 60 mins * 60 secs * 1000 ms)
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

        // 6. 将 session 存入数据库
        const sessionInsert = 'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)';
        await env.DB.prepare(sessionInsert).bind(token, userId, expiresAt).run();

        // 7. 将 token 返回给前端
        return new Response(JSON.stringify({
            message: 'Login successful',
            token: token,
            user: { id: userId, username: username }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Login Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}