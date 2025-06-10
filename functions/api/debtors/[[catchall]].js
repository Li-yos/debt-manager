// 这个文件处理所有 /api/debtors/* 的请求

async function handleGet(context) {
    const { env, data } = context;
    const { userId } = data;
    const getDebtorsQuery = `
        SELECT
            d.id, d.name, d.contact_info,
            (COALESCE((SELECT SUM(di.total_amount) FROM debt_items di WHERE di.debtor_id = d.id), 0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.debtor_id = d.id), 0)) AS total_unpaid_amount
        FROM debtors d
        WHERE d.user_id = ?
        GROUP BY d.id, d.name, d.contact_info
        ORDER BY d.name;
    `;
    const { results } = await env.DB.prepare(getDebtorsQuery).bind(userId).all();
    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePost({ request, env, data }) {
    const { userId } = data;
    const { name, contact_info } = await request.json();
    if (!name) return new Response(JSON.stringify({ error: 'Debtor name is required' }), { status: 400 });
    const debtorId = crypto.randomUUID();
    const now = Date.now();
    const addDebtorQuery = 'INSERT INTO debtors (id, user_id, name, contact_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
    await env.DB.prepare(addDebtorQuery).bind(debtorId, userId, name, contact_info || null, now, now).run();
    const newDebtor = { id: debtorId, name, contact_info: contact_info || null, total_unpaid_amount: 0 };
    return new Response(JSON.stringify(newDebtor), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

async function handlePut(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    const debtorId = params.catchall[0];
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

    // --- 新增的安全检查 ---
    // 1. 计算该欠款人的未还款总额
    const unpaidQuery = `
        SELECT (COALESCE(SUM(di.total_amount), 0) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.debtor_id = ?), 0)) AS total_unpaid_amount
        FROM debt_items di
        WHERE di.debtor_id = ?;
    `;
    const unpaidResult = await env.DB.prepare(unpaidQuery).bind(debtorId, debtorId).first();
    const totalUnpaid = unpaidResult.total_unpaid_amount;

    if (totalUnpaid > 0.01) { // 使用容差
        return new Response(JSON.stringify({ error: `Cannot delete debtor with an outstanding balance of ¥${totalUnpaid.toFixed(2)}.` }), { status: 400 });
    }
    // --- 结束新增检查 ---

    // 只有在欠款已还清的情况下，才执行删除
    const deleteDebtorQuery = 'DELETE FROM debtors WHERE id = ? AND user_id = ?';
    const { meta } = await env.DB.prepare(deleteDebtorQuery).bind(debtorId, userId).run();

    if (meta.changes === 0) {
        return new Response(JSON.stringify({ error: 'Debtor not found or you do not have permission to delete it.' }), { status: 404 });
    }
    return new Response(null, { status: 204 });
}

export async function onRequest(context) {
    try {
        const hasId = context.params.catchall && context.params.catchall.length > 0;
        switch (context.request.method) {
            case 'GET': return await handleGet(context);
            case 'POST': if (hasId) return new Response('Method Not Allowed', { status: 405 }); return await handlePost(context);
            case 'PUT': if (!hasId) return new Response('Method Not Allowed', { status: 405 }); return await handlePut(context);
            case 'DELETE': if (!hasId) return new Response('Method Not Allowed', { status: 405 }); return await handleDelete(context);
            default: return new Response('Method Not Allowed', { status: 405 });
        }
    } catch (error) {
        if (error.message?.includes('UNIQUE constraint failed')) { return new Response(JSON.stringify({ error: 'A debtor with this name already exists.' }), { status: 409 }); }
        console.error('An error occurred:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}