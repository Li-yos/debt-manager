// 这是我们应用的核心，处理所有 dashboard 页面的交互逻辑

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局变量和元素获取 ---
    const token = localStorage.getItem('authToken');
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const API_BASE_URL = '/api';

    // 获取页面上的各个元素
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutBtn = document.getElementById('logout-btn');
    const debtorsList = document.getElementById('debtors-list');
    const addDebtorForm = document.getElementById('add-debtor-form');
    const newDebtorNameInput = document.getElementById('new-debtor-name');

    const detailsView = document.getElementById('details-view');
    const welcomeView = document.getElementById('welcome-view');
    const currentDebtorName = document.getElementById('current-debtor-name');
    const totalUnpaidAmount = document.getElementById('total-unpaid-amount');
    const debtItemsList = document.getElementById('debt-items-list');
    const addItemForm = document.getElementById('add-item-form');
    
    // 用于存储当前选择的欠款人ID
    let selectedDebtorId = null;

    // --- 核心函数 ---

    // 检查用户是否登录
    function checkAuth() {
        if (!token) {
            window.location.href = 'index.html'; // 如果没有 token，直接踢回登录页
        } else {
            welcomeMessage.textContent = `欢迎, ${currentUser.username}!`;
        }
    }

    // 退出登录
    function logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }

    // 封装的 fetch 函数，自动添加认证头
    async function apiFetch(endpoint, options = {}) {
        const defaultHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        options.headers = { ...defaultHeaders, ...options.headers };

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        if (response.status === 401) { // 如果 token 过期或无效
            logout();
            return;
        }
        return response;
    }

    // 获取并渲染欠款人列表
    async function fetchAndRenderDebtors() {
        try {
            const response = await apiFetch('/debtors');
            const debtors = await response.json();
            
            debtorsList.innerHTML = ''; // 清空旧列表
            debtors.forEach(debtor => {
                const li = document.createElement('li');
                li.dataset.debtorId = debtor.id;
                li.dataset.debtorName = debtor.name;
                li.innerHTML = `
                    <span>${debtor.name}</span>
                    <span class="debtor-amount">¥${debtor.total_unpaid_amount.toFixed(2)}</span>
                `;
                // 如果是当前选中的 debtor，添加 active 样式
                if (debtor.id === selectedDebtorId) {
                    li.classList.add('active');
                }
                debtorsList.appendChild(li);
            });
        } catch (error) {
            console.error('Failed to fetch debtors:', error);
        }
    }
    
    // 获取并渲染指定欠款人的账目明细
    async function fetchAndRenderItems(debtorId) {
        try {
            const response = await apiFetch(`/debt-items?debtorId=${debtorId}`);
            const items = await response.json();
            
            debtItemsList.innerHTML = ''; // 清空旧列表
            let unpaidTotal = 0;
            
            if (items.length === 0) {
                debtItemsList.innerHTML = '<li>暂无欠款记录。</li>';
            } else {
                 items.forEach(item => {
                    const li = document.createElement('li');
                    li.classList.toggle('paid', item.status === 'paid');
                    
                    if (item.status === 'unpaid') {
                        unpaidTotal += item.total_amount;
                    }

                    li.innerHTML = `
                        <div class="item-main">
                            <div>${item.description} (¥${item.unit_price.toFixed(2)} x ${item.quantity}) = <strong>¥${item.total_amount.toFixed(2)}</strong></div>
                            <div class="item-meta">日期: ${new Date(item.transaction_date).toLocaleDateString()}</div>
                        </div>
                        <div class="item-actions">
                            ${item.status === 'unpaid' ? `<button class="btn btn-small btn-success" data-item-id="${item.id}">标记为已还</button>` : ''}
                            <button class="btn btn-small btn-danger" data-item-id="${item.id}">删除</button>
                        </div>
                    `;
                    debtItemsList.appendChild(li);
                });
            }
            totalUnpaidAmount.textContent = `当前未还总额: ¥${unpaidTotal.toFixed(2)}`;
            
        } catch(error) {
            console.error('Failed to fetch debt items:', error);
        }
    }
    
    // 处理选择欠款人的逻辑
    function handleSelectDebtor(event) {
        const li = event.target.closest('li');
        if (!li) return;

        // 移除其他 li 的 active 样式
        document.querySelectorAll('#debtors-list li').forEach(el => el.classList.remove('active'));
        // 为当前点击的 li 添加 active 样式
        li.classList.add('active');
        
        selectedDebtorId = li.dataset.debtorId;
        const debtorName = li.dataset.debtorName;

        // 显示明细面板，隐藏欢迎面板
        detailsView.style.display = 'block';
        welcomeView.style.display = 'none';
        addItemForm.classList.remove('hidden');

        currentDebtorName.textContent = `欠款人: ${debtorName}`;
        fetchAndRenderItems(selectedDebtorId);
    }

    // --- 事件监听器绑定 ---

    // 退出登录按钮
    logoutBtn.addEventListener('click', logout);

    // 欠款人列表点击事件 (事件委托)
    debtorsList.addEventListener('click', handleSelectDebtor);

    // 添加新欠款人表单
    addDebtorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = newDebtorNameInput.value.trim();
        if (!name) return;

        try {
            const response = await apiFetch('/debtors', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            if (response.ok) {
                newDebtorNameInput.value = ''; // 清空输入框
                await fetchAndRenderDebtors(); // 重新加载列表
            } else {
                const err = await response.json();
                alert(`添加失败: ${err.error}`);
            }
        } catch (error) {
            console.error('Failed to add debtor:', error);
        }
    });
    
    // 添加新账目表单
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedDebtorId) {
            alert('请先选择一个欠款人！');
            return;
        }

        const itemData = {
            debtorId: selectedDebtorId,
            description: document.getElementById('item-description').value,
            unit_price: parseFloat(document.getElementById('item-price').value),
            quantity: parseInt(document.getElementById('item-quantity').value) || 1,
            // 将 YYYY-MM-DD 格式的日期转换为 Unix 时间戳 (毫秒)
            transaction_date: new Date(document.getElementById('item-date').value).getTime()
        };

        try {
            const response = await apiFetch('/debt-items', {
                method: 'POST',
                body: JSON.stringify(itemData)
            });
            if (response.ok) {
                addItemForm.reset(); // 清空表单
                await fetchAndRenderItems(selectedDebtorId); // 刷新明细列表
                await fetchAndRenderDebtors(); // 刷新总额
            } else {
                const err = await response.json();
                alert(`添加账目失败: ${err.error}`);
            }
        } catch (error) {
            console.error('Failed to add item:', error);
        }
    });

    // 账目明细列表的点击事件 (用于处理“标记为已还”和“删除”按钮)
    debtItemsList.addEventListener('click', async (e) => {
        const target = e.target;
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        // 如果点击的是“标记为已还”按钮
        if (target.classList.contains('btn-success')) {
            try {
                const response = await apiFetch(`/debt-items/${itemId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: 'paid' })
                });
                if (response.ok) {
                    await fetchAndRenderItems(selectedDebtorId); // 刷新明细列表
                    await fetchAndRenderDebtors(); // 刷新总额
                }
            } catch (error) {
                console.error('Failed to update item status:', error);
            }
        }

        // 如果点击的是“删除”按钮
        if (target.classList.contains('btn-danger')) {
            if (confirm('确定要删除这条记录吗？')) {
                try {
                    const response = await apiFetch(`/debt-items/${itemId}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        await fetchAndRenderItems(selectedDebtorId); // 刷新明细列表
                        await fetchAndRenderDebtors(); // 刷新总额
                    }
                } catch (error) {
                    console.error('Failed to delete item:', error);
                }
            }
        }
    });

    // --- 初始化 ---
    function init() {
        checkAuth();
        fetchAndRenderDebtors();
        detailsView.style.display = 'none'; // 初始隐藏明细面板
        welcomeView.style.display = 'block';// 初始显示欢迎面板
    }

    init();
});