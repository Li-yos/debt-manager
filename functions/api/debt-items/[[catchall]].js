// --- 省略 verifyDebtorOwnership 和 handleGet/Post/Delete 函数 ---

// 【核心修改】handleGet 现在需要计算已还金额
async function handleGet({ request, env, data }) {
    const { userId } = data;
    const debtorId = new URL(request.url).searchParams.get('debtorId');
    if (!debtorId) return new Response(JSON.stringify({ error: 'debtorId query parameter is required' }), { status: 400 });
    const isOwner = await verifyDebtorOwnership(env, userId, debtorId);
    if (!isOwner) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 404 });
    
    // 这个 SQL 查询现在会计算每个 debt_item 的已还款总额
    const getItemsQuery = `
        SELECT 
            di.*,
            COALESCE((SELECT SUM(pa.amount_allocated) FROM payment_allocations pa WHERE pa.debt_item_id = di.id), 0) as amount_paid
        FROM debt_items di
        WHERE di.debtor_id = ?
        ORDER BY di.transaction_date DESC;
    `;
    const { results } = await env.DB.prepare(getItemsQuery).bind(debtorId).all();
    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// 【移除】handlePut 函数，因为我们不再通过这个 API 更新状态

// ... (此处省略 verifyDebtorOwnership, handlePost, handleDelete，它们和之前的版本几乎一样)
// --- START: 完整的辅助函数和 handlePost/Delete ---
async function verifyDebtorOwnership(env, userId, debtorId) { const query = 'SELECT id FROM debtors WHERE id = ? AND user_id = ?'; const debtor = await env.DB.prepare(query).bind(debtorId, userId).first(); return !!debtor; }
async function handlePost({ request, env, data }) { const { userId } = data; const { debtorId, description, quantity, unit_price, transaction_date } = await request.json(); if (!debtorId || !description || !unit_price || !transaction_date) return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 }); const isOwner = await verifyDebtorOwnership(env, userId, debtorId); if (!isOwner) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 403 }); const itemId = crypto.randomUUID(); const q = quantity || 1; const total_amount = q * unit_price; const now = Date.now(); const addItemQuery = 'INSERT INTO debt_items (id, debtor_id, description, quantity, unit_price, total_amount, transaction_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'; await env.DB.prepare(addItemQuery).bind(itemId, debtorId, description, q, unit_price, total_amount, transaction_date, now).run(); const newItem = { id: itemId, debtor_id: debtorId, description, quantity: q, unit_price, total_amount, transaction_date, created_at: now, amount_paid: 0 }; return new Response(JSON.stringify(newItem), { status: 201 });}
async function handleDelete(context) { const { request, env, data, params } = context; const { userId } = data; const itemId = params.catchall[0]; if (!itemId) return new Response(JSON.stringify({ error: 'Item ID is missing' }), { status: 400 }); const deleteItemQuery = `DELETE FROM debt_items WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);`; const { meta } = await env.DB.prepare(deleteItemQuery).bind(itemId, userId).run(); if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Item not found or no permission' }), { status: 404 }); return new Response(null, { status: 204 });}
// --- END: 完整的辅助函数和 handlePost/Delete ---

export async function onRequest(context) {
    // 【核心修改】路由逻辑现在只处理 GET 和 DELETE
    try {
        if (context.request.method === 'GET') {
            return await handleGet(context);
        }
        if (context.request.method === 'DELETE') {
            const hasId = context.params.catchall && context.params.catchall.length > 0;
            if (!hasId) return new Response('Method Not Allowed', { status: 405 });
            return await handleDelete(context);
        }
        return new Response('Method Not Allowed', { status: 405 });
    } catch (error) {
        console.error('An error occurred:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' }});
    }
}

// 我们把 POST 逻辑也从这个文件中移除了，因为它在 debt-items.js 中处理