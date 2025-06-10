async function verifyDebtorOwnership(env, userId, debtorId) { const query = 'SELECT id FROM debtors WHERE id = ? AND user_id = ?'; const debtor = await env.DB.prepare(query).bind(debtorId, userId).first(); return !!debtor; }

async function handleGet({ request, env, data }) {
    const { userId } = data;
    const debtorId = new URL(request.url).searchParams.get('debtorId');
    if (!debtorId) return new Response(JSON.stringify({ error: 'debtorId query parameter is required' }), { status: 400 });
    const isOwner = await verifyDebtorOwnership(env, userId, debtorId);
    if (!isOwner) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 404 });
    const getItemsQuery = `SELECT di.*, COALESCE((SELECT SUM(pa.amount_allocated) FROM payment_allocations pa WHERE pa.debt_item_id = di.id), 0) as amount_paid FROM debt_items di WHERE di.debtor_id = ? ORDER BY di.transaction_date DESC;`;
    const { results } = await env.DB.prepare(getItemsQuery).bind(debtorId).all();
    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// 注意：POST /api/debt-items 不应该被这个文件处理，但为了容错，我们把它加回来
async function handlePost({ request, env, data }) {
    const { userId } = data;
    const { debtorId, description, quantity, unit_price, transaction_date } = await request.json();
    if (!debtorId || !description || !unit_price || !transaction_date) return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    const isOwner = await verifyDebtorOwnership(env, userId, debtorId);
    if (!isOwner) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 403 });
    const itemId = crypto.randomUUID();
    const q = quantity || 1;
    const total_amount = q * unit_price;
    const now = Date.now();
    const addItemQuery = 'INSERT INTO debt_items (id, debtor_id, description, quantity, unit_price, total_amount, transaction_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    await env.DB.prepare(addItemQuery).bind(itemId, debtorId, description, q, unit_price, total_amount, transaction_date, now).run();
    const newItem = { id: itemId, debtor_id: debtorId, description, quantity: q, unit_price, total_amount, transaction_date, created_at: now, amount_paid: 0 };
    return new Response(JSON.stringify(newItem), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

async function handleDelete(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    const itemId = params.catchall[0];
    if (!itemId) return new Response(JSON.stringify({ error: 'Item ID is missing' }), { status: 400 });
    const deleteItemQuery = `DELETE FROM debt_items WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);`;
    const { meta } = await env.DB.prepare(deleteItemQuery).bind(itemId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Item not found or no permission' }), { status: 404 });
    return new Response(null, { status: 204 });
}

export async function onRequest(context) {
    try {
        const hasId = context.params.catchall && context.params.catchall.length > 0;
        // 特殊处理 GET，因为它不使用路径参数
        if (context.request.method === 'GET') {
            return await handleGet(context);
        }
        
        switch (context.request.method) {
            // POST 请求应该没有ID
            case 'POST':
                if (hasId) return new Response('Method Not Allowed', { status: 405 });
                return await handlePost(context);
            // DELETE 请求必须有ID
            case 'DELETE':
                if (!hasId) return new Response('Method Not Allowed', { status: 405 });
                return await handleDelete(context);
            default:
                return new Response('Method Not Allowed', { status: 405 });
        }
    } catch (error) {
        console.error('An error occurred:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}