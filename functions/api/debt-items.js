async function verifyDebtorOwnership(env, userId, debtorId) {
    const query = 'SELECT id FROM debtors WHERE id = ? AND user_id = ?';
    const debtor = await env.DB.prepare(query).bind(debtorId, userId).first();
    return !!debtor;
}

async function handleGet({ request, env, data }) {
    const { userId } = data;
    const debtorId = new URL(request.url).searchParams.get('debtorId');
    if (!debtorId) return new Response(JSON.stringify({ error: 'debtorId query parameter is required' }), { status: 400 });
    const isOwner = await verifyDebtorOwnership(env, userId, debtorId);
    if (!isOwner) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 404 });
    const getItemsQuery = 'SELECT * FROM debt_items WHERE debtor_id = ? ORDER BY transaction_date DESC';
    const { results } = await env.DB.prepare(getItemsQuery).bind(debtorId).all();
    return new Response(JSON.stringify(results), { status: 200 });
}

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
    const newItem = { id: itemId, debtor_id: debtorId, description, quantity: q, unit_price, total_amount, status: 'unpaid', transaction_date, created_at: now };
    return new Response(JSON.stringify(newItem), { status: 201 });
}

async function handlePut({ request, env, data }) {
    const { userId } = data;
    const itemId = new URL(request.url).pathname.split('/').pop();
    if (!itemId) return new Response(JSON.stringify({ error: 'Item ID is missing' }), { status: 400 });
    const { status } = await request.json();
    if (status !== 'paid' && status !== 'unpaid') return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
    const updateItemQuery = `UPDATE debt_items SET status = ? WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);`;
    const { meta } = await env.DB.prepare(updateItemQuery).bind(status, itemId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Item not found or no permission' }), { status: 404 });
    return new Response(JSON.stringify({ message: 'Debt item updated' }), { status: 200 });
}

async function handleDelete({ request, env, data }) {
    const { userId } = data;
    const itemId = new URL(request.url).pathname.split('/').pop();
    if (!itemId) return new Response(JSON.stringify({ error: 'Item ID is missing' }), { status: 400 });
    const deleteItemQuery = `DELETE FROM debt_items WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);`;
    const { meta } = await env.DB.prepare(deleteItemQuery).bind(itemId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Item not found or no permission' }), { status: 404 });
    return new Response(null, { status: 204 });
}

// --- 唯一的导出函数，我们的“前台接待员” ---
export async function onRequest(context) {
    // 统一为所有成功的 JSON 响应添加 header
    try {
        let response;
        switch (context.request.method) {
            case 'GET':
                response = await handleGet(context);
                break;
            case 'POST':
                response = await handlePost(context);
                break;
            case 'PUT':
                response = await handlePut(context);
                break;
            case 'DELETE':
                response = await handleDelete(context);
                break;
            default:
                response = new Response('Method Not Allowed', { status: 405 });
        }
        if (response.status < 400 && response.headers.get('Content-Type') !== 'application/json') {
             response.headers.set('Content-Type', 'application/json');
        }
        return response;
    } catch (error) {
        console.error('An error occurred:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
}