// v2: Fixed SQLITE_ERROR on HAVING clause

async function handlePost(context) {
    const { request, env, data } = context;
    const { userId } = data;
    const { debtorId, amount, payment_date } = await request.json();

    if (!debtorId || !amount || !payment_date || amount <= 0) {
        return new Response(JSON.stringify({ error: 'debtorId, a positive amount, and payment_date are required.' }), { status: 400 });
    }

    // --- 【核心修改】修正 SQL 查询 ---
    const unpadiItemsQuery = `
        SELECT 
            di.id,
            di.total_amount,
            COALESCE((SELECT SUM(pa.amount_allocated) FROM payment_allocations pa WHERE pa.debt_item_id = di.id), 0) as amount_paid
        FROM debt_items di
        WHERE di.debtor_id = ? 
        AND (di.total_amount - COALESCE((SELECT SUM(pa.amount_allocated) FROM payment_allocations pa WHERE pa.debt_item_id = di.id), 0)) > 0.001
        ORDER BY di.transaction_date ASC;
    `;
    
    const unpaidItemsResult = await env.DB.prepare(unpadiItemsQuery).bind(debtorId).all();
    const unpaidItems = unpaidItemsResult.results || [];
    
    let remainingAmountToAllocate = amount;
    const paymentId = crypto.randomUUID();
    const allocationInserts = [];
    const now = Date.now();

    for (const item of unpaidItems) {
        if (remainingAmountToAllocate <= 0.001) break;

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
        if (context.request.method === 'POST') {
            return await handlePost(context);
        }
        return new Response('Method Not Allowed', { status: 405 });
    } catch (error) {
        console.error('Payment Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}