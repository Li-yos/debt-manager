async function handleDelete(context) {
    const { request, env, data, params } = context;
    const { userId } = data;
    const itemId = params.catchall[0];
    if (!itemId) return new Response(JSON.stringify({ error: 'Item ID is missing' }), { status: 400 });

    // --- 新增的安全检查 ---
    // 1. 确认这笔账确实属于该用户
    const ownershipQuery = `SELECT id FROM debt_items WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);`;
    const itemOwner = await env.DB.prepare(ownershipQuery).bind(itemId, userId).first();
    if (!itemOwner) {
        return new Response(JSON.stringify({ error: 'Item not found or you do not have permission to delete it.' }), { status: 404 });
    }
    
    // 2. 检查这笔账是否已有还款记录
    const paymentCheckQuery = `SELECT COUNT(*) as count FROM payment_allocations WHERE debt_item_id = ?;`;
    const paymentCountResult = await env.DB.prepare(paymentCheckQuery).bind(itemId).first();
    const paymentCount = paymentCountResult.count;

    if (paymentCount > 0) {
        return new Response(JSON.stringify({ error: 'Cannot delete a debt item that has associated payments. Please delete the payments first.' }), { status: 400 });
    }
    // --- 结束新增检查 ---

    // 只有在没有还款记录的情况下，才执行删除
    const deleteItemQuery = `DELETE FROM debt_items WHERE id = ?;`;
    const { meta } = await env.DB.prepare(deleteItemQuery).bind(itemId).run();

    if (meta.changes === 0) {
        // 这一步理论上不会发生，因为我们前面已经检查过了
        return new Response(JSON.stringify({ error: 'Item not found or failed to delete.' }), { status: 404 });
    }
    return new Response(null, { status: 204 });
}