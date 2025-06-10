// 这个文件现在只处理 /api/debtors/* (对单个实体的操作)

async function handlePut(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    const debtorId = params.catchall[0];
    if (!debtorId) return new Response(JSON.stringify({ error: 'Debtor ID is missing' }), { status: 400 });
    const { name, contact_info } = await request.json();
    if (!name) return new Response(JSON.stringify({ error: 'Debtor name is required' }), { status: 400 });
    const now = Date.now();
    const updateDebtorQuery = 'UPDATE debtors SET name = ?, contact_info = ?, updated_at = ? WHERE id = ? AND user_id = ?';
    const { meta } = await env.DB.prepare(updateDebtorQuery).bind(name, contact_info || null, now, debtorId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 404 });
    return new Response(JSON.stringify({ message: 'Debtor updated' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function handleDelete(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    const debtorId = params.catchall[0];
    if (!debtorId) return new Response(JSON.stringify({ error: 'Debtor ID is missing' }), { status: 400 });
    const deleteDebtorQuery = 'DELETE FROM debtors WHERE id = ? AND user_id = ?';
    const { meta } = await env.DB.prepare(deleteDebtorQuery).bind(debtorId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 404 });
    return new Response(null, { status: 204 });
}

export async function onRequest(context) {
    try {
        switch (context.request.method) {
            case 'PUT':
                return await handlePut(context);
            case 'DELETE':
                return await handleDelete(context);
            default:
                return new Response('Method Not Allowed', { status: 405 });
        }
    } catch (error) {
        if (error.message?.includes('UNIQUE constraint failed')) {
            return new Response(JSON.stringify({ error: 'A debtor with this name already exists.' }), { status: 409, headers: { 'Content-Type': 'application/json' }});
        }
        console.error('An error occurred:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
}