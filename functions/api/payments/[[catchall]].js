// 这个文件负责处理所有的还款操作

async function handlePost(context) {
    const { request, env, data } = context;
    const { userId } = data;
    const { debtorId, amount, payment_date } = await request.json();

    if (!debtorId || !amount || !payment_date || amount <= 0) {
        return new Response(JSON.stringify({ error: 'debtorId, a positive amount, and payment_date are required.' }), { status: 400 });
    }

    // --- 核心还款分配逻辑 ---
    // 1. 开启一个数据库事务，确保所有操作要么全部成功，要么全部失败
    // 2. 找出该欠款人所有“未还清”的欠款项，按日期从早到晚排序
    // 3. 遍历这些欠款项，逐一进行还款分配
    // 4. 将还款记录和分配记录插入数据库

    const unpadiItemsQuery = `
        SELECT 
            di.id,
            di.total_amount,
            COALESCE((SELECT SUM(pa.amount_allocated) FROM payment_allocations pa WHERE pa.debt_item_id = di.id), 0) as amount_paid
        FROM debt_items di
        WHERE di.debtor_id = ?
        HAVING (di.total_amount - amount_paid) > 0.001 -- 使用一个小的容差避免浮点数问题
        ORDER BY di.transaction_date ASC;
    `;
    
    const unpaidItems = await env.DB.prepare(unpadiItemsQuery).bind(debtorId).all();
    
    let remainingAmountToAllocate = amount;
    const paymentId = crypto.randomUUID();
    const allocationInserts = [];
    const now = Date.now();

    for (const item of unpaidItems.results) {
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
        // 这意味着用户试图为一个没有欠款的人还款，或者所有欠款都已还清
        // 我们可以选择记录这笔“预付款”，但为了简化，我们先返回一个错误
        return new Response(JSON.stringify({ error: 'No unpaid debts to apply this payment to.' }), { status: 400 });
    }

    // 使用事务来执行所有数据库写入操作
    const batch = [
        env.DB.prepare('INSERT INTO payments (id, user_id, debtor_id, amount, payment_date, created_at) VALUES (?, ?, ?, ?, ?, ?);')
              .bind(paymentId, userId, debtorId, amount, payment_date, now),
        ...allocationInserts
    ];
    
    await env.DB.batch(batch);

    return new Response(JSON.stringify({ message: 'Payment recorded successfully' }), { status: 201 });
}

export async function onRequest(context) {
    try {
        if (context.request.method === 'POST') {
            return await handlePost(context);
        }
        return new Response('Method Not Allowed', { status: 405 });
    } catch (error) {
        console.error('Payment Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}