async function authMiddleware(context) {
    const { request, env, next, data } = context;
    const url = new URL(request.url);

    const unprotectedRoutes = ['/api/register', '/api/login'];
    if (unprotectedRoutes.includes(url.pathname)) {
        return next();
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid Authorization header' }), {
            status: 401, headers: { 'Content-Type': 'application/json' }
        });
    }

    const token = authHeader.split(' ')[1];
    
    // --- 这是修改的核心部分 ---
    // 现在我们去 sessions 表里真实地查询 token
    const sessionQuery = 'SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?';
    const now = Date.now();
    const session = await env.DB.prepare(sessionQuery).bind(token, now).first();
    
    if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), { 
            status: 401, headers: { 'Content-Type': 'application/json' } 
        });
    }

    // 将真实的 userId 注入到上下文中
    data.userId = session.user_id;
    data.token = token;

    return next();
}

export const onRequest = [authMiddleware];