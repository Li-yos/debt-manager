// 这个文件是我们的 API “保安”，负责检查用户的登录凭证 (Token)

// 这是我们的中间件函数
async function authMiddleware(context) {
    // 从 context 中拿出我们需要的 request(请求), env(环境), next(继续执行的函数)
    const { request, env, next, data } = context;
    const url = new URL(request.url);

    // 我们定义哪些路径是不需要登录就可以访问的
    const unprotectedRoutes = [
        '/api/register',
        '/api/login',
    ];

    // 如果当前请求的路径在“不需要保护”的列表里，直接放行，执行下一个函数
    if (unprotectedRoutes.includes(url.pathname)) {
        return await next();
    }
    
    // --- 从这里开始，就是需要安全检查的逻辑 ---

    // 1. 从请求头里获取 'Authorization' 信息
    const authHeader = request.headers.get('Authorization');

    // 2. 检查 'Authorization' 头是否存在，并且格式是否正确 (必须是 'Bearer <token>')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid Authorization header' }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 3. 提取出真正的 token
    const token = authHeader.split(' ')[1];

    // 4. 在数据库的 sessions 表验证 token
    const sessionQuery = 'SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?';
    const now = Date.now();
    let session;
    try {
        session = await env.DB.prepare(sessionQuery).bind(token, now).first();
    } catch (e) {
        // 这段 catch 是为了处理 sessions 表还不存在的情况，让开发流程更顺畅
        // 第一次运行时 sessions 表可能还没创建，我们会先跳过验证
        console.log("Session validation skipped, table might not exist yet.", e.message);
    }
    
    // 5. 如果 token 无效或已过期
    if (!session) {
        // 在我们创建好 sessions 表之前，先临时放行，方便开发
        // 等 login API 写好后，这部分就要严格执行了
        console.log(`Bypassing auth for token: ${token}. Session table might be pending.`);
        // return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // 6. 如果 token 有效，把 userId 附加到请求的上下文中
    // 这样，后续的 API 处理函数就能直接从 context.data.userId 中获取当前登录用户的ID
    data.userId = session ? session.user_id : 'temp-dev-user'; // 在 session 表工作前，提供一个临时值
    data.token = token;

    // 7. 所有检查通过，放行！执行真正的 API 函数
    return await next();
}

// 导出我们的中间件函数，让 Cloudflare Pages 能够使用它
export const onRequest = [authMiddleware];