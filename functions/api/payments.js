// 这个文件负责处理所有的还款操作 (GET 获取历史, POST 创建还款)

async function handleGet(context) {
    const { request, env, data } = context;
    const { userId } = data;
    const debtorId = new URL(request.url).searchParams.get('debtorId');
    if (!debtorId) {
        return new Response(JSON.stringify({ error: 'debtorId query parameter is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const checkOwnerQuery = `SELECT id FROM debtors WHERE id = ? AND user_id = ?`;
    const owner = await env.DB.prepare(checkOwnerQuery).bind(debtorId, userId).first();
    if (!owner) {
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const getPaymentsQuery = `SELECT * FROM payments WHERE debtor_id = ? ORDER BY payment_date DESC`;
    const { results } = await env.DB.prepare(getPaymentsQuery).bind(debtorId).all();
    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function handlePost(context) {
    const { request, env, data } = context;
    const { userId } = data;
    const { debtorId, amount, payment_date } = await request.json();

    if (!debtorId || !amount || !payment_date || amount <= 0) {
        return new Response(JSON.stringify({ error: 'debtorId, a positive amount, and payment_date are required.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // --- 【核心修复点】 ---
    // 将错误的 HAVING 子句修改为正确的 WHERE 子句
    const unpaidItemsQuery = `
        SELECT 
            di.id,
            di.total_amount,
            COALESCE((SELECT SUM(pa.amount_allocated) FROM payment_allocations pa WHERE pa.debt_item_id = di.id), 0) as amount_paid
        FROM debt_items di
        WHERE 
            di.debtor_id = ? AND
            (di.total_amount - COALESCE((SELECT SUM(pa.amount_allocated) FROM payment_allocations pa WHERE pa.debt_item_id = di.id), 0)) > 0.001
        ORDER BY 
            di.transaction_date ASC;
    `;
    
    const unpaidItemsResult = await env.DB.prepare(unpaidItemsQuery).bind(debtorId).all();
    const unpaidItems = unpaidItemsResult && unpaidItemsResult.results ? unpaidItemsResult.results : [];
    
    let remainingAmountToAllocate = amount;
    const paymentId = crypto.randomUUID();
    const allocationInserts = [];
    const now = Date.now();

    for (const item of unpaidItems) {
        if (remainingAmountToAllocate <= 0) break;
        const amountOwed = item.total_amount - item.amount_paid;
        const amountToAllocate = Math.min(remainingAmountToAllocate, amountOwed);
        
        allocationInserts.push(
            env.DB.prepare('INSERT INTO payment_allocations (payment_id, debt_item_id, amount_allocated) VALUES (?, ?, ?);')
                  .bind(paymentId, item.id, amountToAllocate)
        );
        remainingAmountToAllocate -= amountToAllocate;
    }

    if (allocationInserts.length === 0 && amount > 0) {
        return new Response(JSON.stringify({ error: 'No unpaid debts to apply this payment to.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const batch = [
        env.DB.prepare('INSERT INTO payments (id, user_id, debtor_id, amount, payment_date, created_at) VALUES (?, ?, ?, ?, ?, ?);')
              .bind(paymentId, userId, debtorId, amount, payment_date, now),
        ...allocationInserts
    ];
    
    await env.DB.batch(batch);

    return new Response(JSON.stringify({ message: 'Payment recorded successfully' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
    try {
        switch (context.request.method) {
            case 'GET':
                return await handleGet(context);
            case 'POST':
                return await handlePost(context);
            default:
                return new Response('Method Not Allowed', { status: 405, headers: { 'Content-Type': 'application/json' } });
        }
    } catch (error) {
        console.error('Payment API Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}