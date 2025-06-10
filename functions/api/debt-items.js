// 这个文件负责处理所有与“具体欠账项目(debt_items)”相关的操作

/**
 * 安全校验函数: 检查一个 debtorId 是否属于当前登录的用户
 * 这是一个可复用的辅助函数，避免在每个 API 里都写一遍重复的逻辑
 * @param {object} env - Cloudflare 环境对象
 * @param {string} userId - 当前登录用户的 ID
 * @param {string} debtorId - 需要校验的欠款人 ID
 * @returns {Promise<boolean>} - 如果属于则返回 true，否则返回 false
 */
async function verifyDebtorOwnership(env, userId, debtorId) {
    const query = 'SELECT id FROM debtors WHERE id = ? AND user_id = ?';
    const debtor = await env.DB.prepare(query).bind(debtorId, userId).first();
    return !!debtor; // 将查询结果转换为布尔值
}

/**
 * 处理 GET 请求: 获取指定欠款人的所有欠账明细列表
 * URL 应该是 /api/debt-items?debtorId=<some-id>
 */
export async function onRequestGet({ request, env, data }) {
    try {
        const { userId } = data;
        const url = new URL(request.url);
        const debtorId = url.searchParams.get('debtorId'); // 从 URL 查询参数中获取 debtorId

        if (!debtorId) {
            return new Response(JSON.stringify({ error: 'debtorId query parameter is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        
        // 安全第一！先验证这个 debtorId 是否属于当前用户
        const isOwner = await verifyDebtorOwnership(env, userId, debtorId);
        if (!isOwner) {
            return new Response(JSON.stringify({ error: 'Debtor not found or you do not have permission to view these items.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // 验证通过后，再查询具体的欠款项目
        const getItemsQuery = 'SELECT * FROM debt_items WHERE debtor_id = ? ORDER BY transaction_date DESC';
        const { results } = await env.DB.prepare(getItemsQuery).bind(debtorId).all();

        return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Get Debt Items Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

/**
 * 处理 POST 请求: 为指定的欠款人添加一笔新的欠账
 */
export async function onRequestPost({ request, env, data }) {
    try {
        const { userId } = data;
        const { debtorId, description, quantity, unit_price, transaction_date } = await request.json();

        // 基础验证
        if (!debtorId || !description || !unit_price || !transaction_date) {
            return new Response(JSON.stringify({ error: 'debtorId, description, unit_price, and transaction_date are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // 安全第一！验证所有权
        const isOwner = await verifyDebtorOwnership(env, userId, debtorId);
        if (!isOwner) {
            return new Response(JSON.stringify({ error: 'Debtor not found or you do not have permission to add items for it.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        
        const itemId = crypto.randomUUID();
        const q = quantity || 1; // 如果没提供数量，默认为 1
        const total_amount = q * unit_price;
        const now = Date.now();
        
        const addItemQuery = 'INSERT INTO debt_items (id, debtor_id, description, quantity, unit_price, total_amount, transaction_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        await env.DB.prepare(addItemQuery).bind(itemId, debtorId, description, q, unit_price, total_amount, transaction_date, now).run();

        // 返回新创建的 item，方便前端更新 UI
        const newItem = { id: itemId, debtor_id: debtorId, description, quantity: q, unit_price, total_amount, status: 'unpaid', transaction_date, created_at: now };
        return new Response(JSON.stringify(newItem), { status: 201, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Add Debt Item Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}


/**
 * 处理 PUT 请求: 更新一笔欠账的状态（例如，标记为已还）
 * 路径应该是 /api/debt-items/:itemId
 */
export async function onRequestPut({ request, env, data }) {
    try {
        const { userId } = data;
        const url = new URL(request.url);
        const itemId = url.pathname.split('/').pop();

        if (!itemId) {
            return new Response(JSON.stringify({ error: 'Item ID is missing from the URL' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const { status } = await request.json();
        if (status !== 'paid' && status !== 'unpaid') {
            return new Response(JSON.stringify({ error: 'Invalid status. Must be "paid" or "unpaid".' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // 黄金安全法则！使用 JOIN 进行跨表验证，确保用户只能修改自己的账目
        const updateItemQuery = `
            UPDATE debt_items
            SET status = ?
            WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);
        `;
        const { meta } = await env.DB.prepare(updateItemQuery).bind(status, itemId, userId).run();
        
        if (meta.changes === 0) {
            return new Response(JSON.stringify({ error: 'Item not found or you do not have permission to edit it.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ message: 'Debt item updated successfully' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Update Debt Item Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

/**
 * 处理 DELETE 请求: 删除一笔具体的欠账记录
 * 路径应该是 /api/debt-items/:itemId
 */
export async function onRequestDelete({ request, env, data }) {
    try {
        const { userId } = data;
        const url = new URL(request.url);
        const itemId = url.pathname.split('/').pop();

        if (!itemId) {
            return new Response(JSON.stringify({ error: 'Item ID is missing from the URL' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        
        // 同样使用 JOIN 进行跨表安全验证
        const deleteItemQuery = `
            DELETE FROM debt_items
            WHERE id = ? AND debtor_id IN (SELECT id FROM debtors WHERE user_id = ?);
        `;
        const { meta } = await env.DB.prepare(deleteItemQuery).bind(itemId, userId).run();

        if (meta.changes === 0) {
            return new Response(JSON.stringify({ error: 'Item not found or you do not have permission to delete it.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
        
        return new Response(null, { status: 204 }); // 204 No Content

    } catch (error) {
        console.error('Delete Debt Item Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}