// 这是我们应用的最终版核心，处理所有 dashboard 页面的交互逻辑
// v3: 实现部分还款功能

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局变量和元素获取 ---
    const token = localStorage.getItem('authToken');
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const API_BASE_URL = '/api';

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
    const repayBtn = document.getElementById('repay-btn'); // 新增的还款按钮
    const spinnerOverlay = document.getElementById('spinner-overlay');
    
    let selectedDebtorId = null;

    // --- 核心函数 (showSpinner, hideSpinner, checkAuth, logout, apiFetch 保持不变) ---
    function showSpinner() { spinnerOverlay.classList.remove('hidden'); }
    function hideSpinner() { spinnerOverlay.classList.add('hidden'); }
    function checkAuth() { if (!token) { window.location.href = 'index.html'; } else { welcomeMessage.textContent = `欢迎, ${currentUser.username}!`; } }
    function logout() { localStorage.removeItem('authToken'); localStorage.removeItem('currentUser'); window.location.href = 'index.html'; }
    async function apiFetch(endpoint, options = {}) { const defaultHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }; options.headers = { ...defaultHeaders, ...options.headers }; const response = await fetch(`${API_BASE_URL}${endpoint}`, options); if (response.status === 401) { logout(); return; } return response; }

    // 【修改】获取并渲染欠款人列表
    async function fetchAndRenderDebtors() {
        showSpinner();
        try {
            const response = await apiFetch('/debtors');
            const debtors = await response.json();
            
            debtorsList.innerHTML = '';
            debtors.forEach(debtor => {
                const li = document.createElement('li');
                li.dataset.debtorId = debtor.id;
                li.innerHTML = `
                    <span class="debtor-name-text">${debtor.name}</span>
                    <div class="debtor-actions">
                        <span class="debtor-amount">¥${debtor.total_unpaid_amount.toFixed(2)}</span>
                        <button class="btn btn-tiny btn-edit" title="编辑名称" data-debtor-id="${debtor.id}" data-debtor-name="${debtor.name}">✏️</button>
                    </div>
                `;
                if (debtor.id === selectedDebtorId) {
                    li.classList.add('active');
                }
                debtorsList.appendChild(li);
            });
        } catch (error) { console.error('Failed to fetch debtors:', error); } finally { hideSpinner(); }
    }
    
    // 【修改】获取并渲染指定欠款人的账目明细
    async function fetchAndRenderItems(debtorId) {
        showSpinner();
        try {
            const response = await apiFetch(`/debt-items?debtorId=${debtorId}`);
            const items = await response.json();
            
            debtItemsList.innerHTML = '';
            let unpaidTotal = 0;
            
            if (items.length === 0) {
                debtItemsList.innerHTML = '<li>暂无欠款记录。</li>';
            } else {
                 items.forEach(item => {
                    const amountOwed = item.total_amount - item.amount_paid;
                    const isPaid = amountOwed < 0.01; // 容差判断是否已还清
                    unpaidTotal += amountOwed;

                    const li = document.createElement('li');
                    li.classList.toggle('paid', isPaid);
                    
                    const progressPercent = isPaid ? 100 : (item.amount_paid / item.total_amount) * 100;

                    li.innerHTML = `
                        <div class="item-main">
                            <div>${item.description} (¥${item.unit_price.toFixed(2)} x ${item.quantity}) = <strong>¥${item.total_amount.toFixed(2)}</strong></div>
                            <div class="item-meta">
                                日期: ${new Date(item.transaction_date).toLocaleDateString()} | 
                                状态: ${isPaid ? '已还清' : `还差 ¥${amountOwed.toFixed(2)}`}
                            </div>
                            <div class="item-progress"><div class="progress-bar" style="width: ${progressPercent}%;"></div></div>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-small btn-danger" data-item-id="${item.id}">删除</button>
                        </div>
                    `;
                    debtItemsList.appendChild(li);
                });
            }
            totalUnpaidAmount.textContent = `当前未还总额: ¥${unpaidTotal.toFixed(2)}`;
            repayBtn.classList.toggle('hidden', unpaidTotal < 0.01);
            
        } catch(error) { console.error('Failed to fetch debt items:', error); } finally { hideSpinner(); }
    }
    
    function handleSelectDebtor(liElement) { /* ... 和之前一样 ... */ if (!liElement) return; document.querySelectorAll('#debtors-list li').forEach(el => el.classList.remove('active')); liElement.classList.add('active'); selectedDebtorId = liElement.dataset.debtorId; const debtorName = liElement.querySelector('.debtor-name-text').textContent; detailsView.style.display = 'block'; welcomeView.style.display = 'none'; addItemForm.classList.remove('hidden'); currentDebtorName.textContent = `欠款人: ${debtorName}`; fetchAndRenderItems(selectedDebtorId); }
    async function editDebtor(debtorId, newName, contactInfo = null) { /* ... 和之前一样 ... */ }

    // --- 事件监听器绑定 (logoutBtn, debtorsList, addDebtorForm, addItemForm 保持不变) ---
    logoutBtn.addEventListener('click', logout);
    debtorsList.addEventListener('click', (event) => { /* ... 和之前一样 ... */ });
    addDebtorForm.addEventListener('submit', async (e) => { /* ... 和之前一样 ... */ });
    addItemForm.addEventListener('submit', async (e) => { /* ... 和之前一样 ... */ });

    // 【修改】账目明细列表的点击事件，现在只处理删除
    debtItemsList.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('btn-danger')) {
            const itemId = target.dataset.itemId;
            if (itemId && confirm('确定要删除这条记录吗？这会同时删除相关的还款记录。')) {
                showSpinner();
                try {
                    const response = await apiFetch(`/debt-items/${itemId}`, { method: 'DELETE' });
                    if (response.ok) {
                        await fetchAndRenderItems(selectedDebtorId);
                        await fetchAndRenderDebtors();
                    }
                } catch (error) {
                    console.error('Failed to delete item:', error);
                } finally {
                    hideSpinner();
                }
            }
        }
    });
    
    // 【新增】为还款按钮绑定事件
    repayBtn.addEventListener('click', () => {
        const amountStr = prompt('请输入本次还款金额:');
        if (amountStr) {
            const amount = parseFloat(amountStr);
            if (!isNaN(amount) && amount > 0) {
                recordPayment(selectedDebtorId, amount);
            } else {
                alert('请输入有效的金额！');
            }
        }
    });

    // 【新增】记录还款的函数
    async function recordPayment(debtorId, amount) {
        showSpinner();
        try {
            const paymentData = {
                debtorId: debtorId,
                amount: amount,
                payment_date: Date.now() // 使用当前时间作为还款日期
            };
            const response = await apiFetch('/payments', {
                method: 'POST',
                body: JSON.stringify(paymentData)
            });
            if (response.ok) {
                // 还款成功后，刷新所有数据
                await fetchAndRenderItems(selectedDebtorId);

                // 延迟一小会儿再刷新左侧列表，确保数据库有足够时间更新
                setTimeout(fetchAndRenderDebtors, 200);
            } else {
                const err = await response.json();
                alert(`还款失败: ${err.error}`);
            }
        } catch (error) {
            console.error('Failed to record payment:', error);
        } finally {
            hideSpinner();
        }
    }

    // --- 初始化 (不变) ---
    function init() { checkAuth(); fetchAndRenderDebtors(); detailsView.style.display = 'none'; welcomeView.style.display = 'block'; }
    init();
});