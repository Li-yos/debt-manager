// 这个文件负责处理所有与“欠款人(debtors)”相关的操作

/**
 * 处理 GET 请求: 获取当前用户的所有欠款人列表，并附带他们的总欠款额。
 */
export async function onRequestGet({ env, data }) {
    try {
        // 从中间件注入的 data 对象中获取当前登录用户的 ID
        const { userId } = data;

        // 这是一个非常核心的 SQL 查询，它做了几件事：
        // 1. 从 debtors 表中选出属于当前用户的欠款人 (d.user_id = ?)。
        // 2. 使用 LEFT JOIN 关联 debt_items 表，即使某个欠款人没有任何欠款记录，也能被查出来。
        // 3. 使用 SUM 和 CASE WHEN 来只计算状态为 'unpaid' 的欠款总额。
        // 4. 使用 COALESCE 将 null (没有欠款记录的情况) 转换为 0。
        // 5. 使用 GROUP BY 按欠款人进行分组聚合。
        const getDebtorsQuery = `
            SELECT
                d.id,
                d.name,
                d.contact_info,
                COALESCE(SUM(CASE WHEN di.status = 'unpaid' THEN di.total_amount ELSE 0 END), 0) AS total_unpaid_amount
            FROM
                debtors d
            LEFT JOIN
                debt_items di ON d.id = di.debtor_id
            WHERE
                d.user_id = ?
            GROUP BY
                d.id, d.name, d.contact_info
            ORDER BY
                d.name;
        `;
        
        const { results } = await env.DB.prepare(getDebtorsQuery).bind(userId).all();
        
        return new Response(JSON.stringify(results), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Get Debtors Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

/**
 * 处理 POST 请求: 为当前用户添加一个新的欠款人。
 */
export async function onRequestPost({ request, env, data }) {
    try {
        const { userId } = data;
        const { name, contact_info } = await request.json();

        if (!name) {
            return new Response(JSON.stringify({ error: 'Debtor name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        
        const debtorId = crypto.randomUUID();
        const now = Date.now();

        const addDebtorQuery = 'INSERT INTO debtors (id, user_id, name, contact_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)';
        await env.DB.prepare(addDebtorQuery).bind(debtorId, userId, name, contact_info || null, now, now).run();

        // 返回新创建的欠款人对象，方便前端直接使用
        const newDebtor = { id: debtorId, name, contact_info: contact_info || null, total_unpaid_amount: 0 };
        return new Response(JSON.stringify(newDebtor), { status: 201, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        // 需要处理因为 UNIQUE 索引导致的同名错误
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            return new Response(JSON.stringify({ error: 'A debtor with this name already exists.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        console.error('Add Debtor Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

/**
 * 处理 PUT 请求: 更新一个已存在的欠款人信息。
 * 路径应该是 /api/debtors/:id, 但在 Pages Functions 中，我们通过解析 URL 来获取 ID。
 */
export async function onRequestPut({ request, env, data }) {
    try {
        const { userId } = data;
        const url = new URL(request.url);
        const debtorId = url.pathname.split('/').pop(); // 从 URL 末尾获取 ID
        
        if (!debtorId) {
            return new Response(JSON.stringify({ error: 'Debtor ID is missing from the URL' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        
        const { name, contact_info } = await request.json();
        if (!name) {
            return new Response(JSON.stringify({ error: 'Debtor name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        
        const now = Date.now();
        // 关键：WHERE 子句中同时检查了 id 和 user_id，确保用户只能修改自己的数据
        const updateDebtorQuery = 'UPDATE debtors SET name = ?, contact_info = ?, updated_at = ? WHERE id = ? AND user_id = ?';
        const { success, meta } = await env.DB.prepare(updateDebtorQuery).bind(name, contact_info || null, now, debtorId, userId).run();
        
        // 检查是否有行被更新
        if (meta.changes === 0) {
            return new Response(JSON.stringify({ error: 'Debtor not found or you do not have permission to edit it.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ message: 'Debtor updated successfully' }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        // 同样处理同名冲突
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            return new Response(JSON.stringify({ error: 'Another debtor with this name already exists.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        console.error('Update Debtor Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}

/**
 * 处理 DELETE 请求: 删除一个欠款人（以及他所有的欠款记录，因为数据库设置了级联删除）。
 */
export async function onRequestDelete({ request, env, data }) {
    try {
        const { userId } = data;
        const url = new URL(request.url);
        const debtorId = url.pathname.split('/').pop(); // 从 URL 末尾获取 ID

        if (!debtorId) {
            return new Response(JSON.stringify({ error: 'Debtor ID is missing from the URL' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        
        // 关键：同样用 user_id 来确保安全性
        const deleteDebtorQuery = 'DELETE FROM debtors WHERE id = ? AND user_id = ?';
        const { meta } = await env.DB.prepare(deleteDebtorQuery).bind(debtorId, userId).run();

        if (meta.changes === 0) {
            return new Response(JSON.stringify({ error: 'Debtor not found or you do not have permission to delete it.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(null, { status: 204 }); // 204 No Content 是删除成功的标准响应

    } catch (error) {
        console.error('Delete Debtor Error:', error);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}