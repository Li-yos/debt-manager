async function handleDelete(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    const itemId = params.catchall[0];
    if (!itemId) return new Response(JSON.stringify({ error: 'Item ID is missing' }), { status: 400 });

    // 安全第一：先验证这个 item 确实属于当前用户
    const checkOwnerQuery = `SELECT id FROM debt_items WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);`;
    const item = await env.DB.prepare(checkOwnerQuery).bind(itemId, userId).first();
    if (!item) {
        return new Response(JSON.stringify({ error: 'Item not found or you do not have permission to delete it.' }), { status: 404 });
    }
    
    // 找出所有与这个 item 相关的还款分配记录
    const allocationsQuery = `SELECT payment_id, amount_allocated FROM payment_allocations WHERE debt_item_id = ?`;
    const allocations = await env.DB.prepare(allocationsQuery).bind(itemId).all();
    
    const batch = [];
    
    // 对于每一笔还款，我们需要检查这笔还款是否还分配给了其他 item
    for (const alloc of allocations.results) {
        const otherAllocsQuery = `SELECT COUNT(*) as count FROM payment_allocations WHERE payment_id = ? AND debt_item_id != ?`;
        const { count } = await env.DB.prepare(otherAllocsQuery).bind(alloc.payment_id, itemId).first();
        
        // 如果这笔还款没有分配给任何其他 item，那它就是一个“孤儿”还款了，应该被删除
        if (count === 0) {
            batch.push(env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(alloc.payment_id));
        }
    }
    
    // 最后，删除 debt_item 本身（相关的 allocations 会被级联删除）
    batch.push(env.DB.prepare('DELETE FROM debt_items WHERE id = ?').bind(itemId));
    
    // 使用事务执行所有删除操作
    await env.DB.batch(batch);

    return new Response(null, { status: 204 });
}