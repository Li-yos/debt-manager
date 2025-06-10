async function handleGet({ env, data }) {
    const { userId } = data;
    const getDebtorsQuery = `
        SELECT
            d.id, d.name, d.contact_info,
            COALESCE(SUM(CASE WHEN di.status = 'unpaid' THEN di.total_amount ELSE 0 END), 0) AS total_unpaid_amount
        FROM debtors d
        LEFT JOIN debt_items di ON d.id = di.debtor_id
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
    return new Response(JSON.stringify(newDebtor), { status: 201 });
}

async function handlePut(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    // --- 修改点在这里 ---
    const debtorId = params.catchall ? params.catchall[0] : null; 
    if (!debtorId) return new Response(JSON.stringify({ error: 'Debtor ID is missing' }), { status: 400 });
    const { name, contact_info } = await request.json();
    if (!name) return new Response(JSON.stringify({ error: 'Debtor name is required' }), { status: 400 });
    const now = Date.now();
    const updateDebtorQuery = 'UPDATE debtors SET name = ?, contact_info = ?, updated_at = ? WHERE id = ? AND user_id = ?';
    const { meta } = await env.DB.prepare(updateDebtorQuery).bind(name, contact_info || null, now, debtorId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 404 });
    return new Response(JSON.stringify({ message: 'Debtor updated' }), { status: 200 });
}

async function handleDelete(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    // --- 修改点在这里 ---
    const debtorId = params.catchall ? params.catchall[0] : null;
    if (!debtorId) return new Response(JSON.stringify({ error: 'Debtor ID is missing' }), { status: 400 });
    const deleteDebtorQuery = 'DELETE FROM debtors WHERE id = ? AND user_id = ?';
    const { meta } = await env.DB.prepare(deleteDebtorQuery).bind(debtorId, userId).run();
    if (meta.changes === 0) return new Response(JSON.stringify({ error: 'Debtor not found or no permission' }), { status: 404 });
    return new Response(null, { status: 204 });
}

export async function onRequest(context) {
    try {
        // 对于通配符路由，没有ID的POST请求和有ID的PUT/DELETE请求路径不同
        // POST /api/debtors - catchall会是空数组或undefined
        // PUT /api/debtors/123 - catchall会是['123']
        const hasId = context.params.catchall && context.params.catchall.length > 0;

        switch (context.request.method) {
            case 'GET':
                return await handleGet(context);
            case 'POST':
                 if (hasId) return new Response('Method Not Allowed', { status: 405 });
                return await handlePost(context);
            case 'PUT':
                 if (!hasId) return new Response('Method Not Allowed', { status: 405 });
                return await handlePut(context);
            case 'DELETE':
                 if (!hasId) return new Response('Method Not Allowed', { status: 405 });
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