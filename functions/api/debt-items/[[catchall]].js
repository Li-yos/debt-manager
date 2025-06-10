// 这个文件现在只处理 /api/debt-items/* (对单个实体的操作)

async function handleDelete(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    const itemId = params.catchall[0];
    if (!itemId) return new Response(JSON.stringify({ error: 'Item ID is missing' }), { status: 400 });
    const deleteItemQuery = `DELETE FROM debt_items WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);`;
    const { meta } = await env.DB.prepare(deleteItemQuery).bind(itemId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Item not found or no permission' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    return new Response(null, { status: 204 });
}

export async function onRequest(context) {
    try {
        // 这个文件现在只处理 DELETE 请求
        if (context.request.method === 'DELETE') {
            const hasId = context.params.catchall && context.params.catchall.length > 0;
            if (!hasId) return new Response('Method Not Allowed', { status: 405 });
            return await handleDelete(context);
        }
        // PUT 方法（标记已还）已被移除，还款通过 /api/payments 处理
        return new Response('Method Not Allowed', { status: 405 });
    } catch (error) {
        console.error('An error occurred:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
}