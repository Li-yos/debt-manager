// v4: Final version with robust event handling

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局变量和元素获取 (这部分不变) ---
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
    const repayBtn = document.getElementById('repay-btn');
    const spinnerOverlay = document.getElementById('spinner-overlay');
    
    let selectedDebtorId = null;

    // --- 核心函数 (showSpinner, hideSpinner, checkAuth, logout, apiFetch 不变) ---
    function showSpinner() { spinnerOverlay.classList.remove('hidden'); }
    function hideSpinner() { spinnerOverlay.classList.add('hidden'); }
    function checkAuth() { if (!token) { window.location.href = 'index.html'; } else { welcomeMessage.textContent = `欢迎, ${currentUser.username}!`; } }
    function logout() { localStorage.removeItem('authToken'); localStorage.removeItem('currentUser'); window.location.href = 'index.html'; }
    async function apiFetch(endpoint, options = {}) { /* ... 和之前一样，省略 ... */ const defaultHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }; options.headers = { ...defaultHeaders, ...options.headers }; const response = await fetch(`${API_BASE_URL}${endpoint}`, options); if (response.status === 401) { logout(); return Promise.reject(new Error('Unauthorized')); } return response; }

    // --- 数据获取与渲染函数 (fetchAndRenderDebtors, fetchAndRenderItems 不变) ---
    async function fetchAndRenderDebtors() { /* ... 和之前一样，省略 ... */ }
    async function fetchAndRenderItems(debtorId) { /* ... 和之前一样，省略 ... */ }

    // --- 为了方便你复制，这里是完整的渲染函数 ---
    async function fetchAndRenderDebtors() {
        showSpinner();
        try {
            const response = await apiFetch('/debtors');
            const debtors = await response.json();
            debtorsList.innerHTML = '';
            debtors.forEach(debtor => {
                const li = document.createElement('li');
                li.dataset.debtorId = debtor.id;
                li.innerHTML = `<span class="debtor-name-text">${debtor.name}</span><div class="debtor-actions"><span class="debtor-amount">¥${debtor.total_unpaid_amount.toFixed(2)}</span><button class="btn btn-tiny btn-edit" title="编辑名称" data-debtor-id="${debtor.id}" data-debtor-name="${debtor.name}">✏️</button></div>`;
                if (debtor.id === selectedDebtorId) { li.classList.add('active'); }
                debtorsList.appendChild(li);
            });
        } catch (error) { console.error('Failed to fetch debtors:', error); } finally { hideSpinner(); }
    }
    async function fetchAndRenderItems(debtorId) {
        showSpinner();
        try {
            const response = await apiFetch(`/debt-items?debtorId=${debtorId}`);
            if (!response) return;
            const items = await response.json();
            debtItemsList.innerHTML = '';
            let unpaidTotal = 0;
            if (items.length === 0) {
                debtItemsList.innerHTML = '<li>暂无欠款记录。</li>';
            } else {
                 items.forEach(item => {
                    const amountOwed = item.total_amount - item.amount_paid;
                    const isPaid = amountOwed < 0.01;
                    if (!isPaid) { unpaidTotal += amountOwed; }
                    const li = document.createElement('li');
                    li.classList.toggle('paid', isPaid);
                    const progressPercent = isPaid ? 100 : (item.amount_paid / item.total_amount) * 100;
                    li.innerHTML = `<div class="item-main"><div>${item.description} (¥${item.unit_price.toFixed(2)} x ${item.quantity}) = <strong>¥${item.total_amount.toFixed(2)}</strong></div><div class="item-meta">日期: ${new Date(item.transaction_date).toLocaleDateString()} | 状态: ${isPaid ? '已还清' : `还差 ¥${amountOwed.toFixed(2)}`}</div><div class="item-progress"><div class="progress-bar" style="width: ${progressPercent}%;"></div></div></div><div class="item-actions"><button class="btn btn-small btn-danger" data-item-id="${item.id}">删除</button></div>`;
                    debtItemsList.appendChild(li);
                });
            }
            totalUnpaidAmount.textContent = `当前未还总额: ¥${unpaidTotal.toFixed(2)}`;
            repayBtn.classList.toggle('hidden', unpaidTotal < 0.01);
        } catch(error) { console.error('Failed to fetch debt items:', error); } finally { hideSpinner(); }
    }
    
    // --- 【核心修改】事件处理逻辑 ---

    // 编辑欠款人名称
    async function handleEditDebtor(debtorId, currentName) {
        const newName = prompt('请输入新的欠款人姓名:', currentName);
        if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
            showSpinner();
            try {
                const response = await apiFetch(`/debtors/${debtorId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name: newName.trim() })
                });
                if (response && response.ok) {
                    await fetchAndRenderDebtors();
                    if (selectedDebtorId === debtorId) {
                        currentDebtorName.textContent = `欠款人: ${newName.trim()}`;
                    }
                } else {
                    const err = await response.json();
                    alert(`编辑失败: ${err.error}`);
                }
            } catch (error) { console.error('Failed to edit debtor:', error); } finally { hideSpinner(); }
        }
    }

    // 选择欠款人
    function handleSelectDebtor(liElement) {
        document.querySelectorAll('#debtors-list li').forEach(el => el.classList.remove('active'));
        liElement.classList.add('active');
        selectedDebtorId = liElement.dataset.debtorId;
        const debtorName = liElement.querySelector('.debtor-name-text').textContent;
        detailsView.style.display = 'block';
        welcomeView.style.display = 'none';
        addItemForm.classList.remove('hidden');
        currentDebtorName.textContent = `欠款人: ${debtorName}`;
        fetchAndRenderItems(selectedDebtorId);
    }

    // 统一的欠款人列表点击处理器
    debtorsList.addEventListener('click', (event) => {
        const target = event.target;
        const editButton = target.closest('.btn-edit');
        if (editButton) {
            event.stopPropagation();
            handleEditDebtor(editButton.dataset.debtorId, editButton.dataset.debtorName);
            return;
        }
        const li = target.closest('li');
        if (li) {
            handleSelectDebtor(li);
        }
    });

    // 记录一笔还款
    async function handleRepay() {
        const amountStr = prompt('请输入本次还款金额:');
        if (amountStr) {
            const amount = parseFloat(amountStr);
            if (!isNaN(amount) && amount > 0) {
                showSpinner();
                try {
                    const response = await apiFetch('/payments', {
                        method: 'POST',
                        body: JSON.stringify({ debtorId: selectedDebtorId, amount, payment_date: Date.now() })
                    });
                    if (response && response.ok) {
                        await fetchAndRenderItems(selectedDebtorId);
                        setTimeout(fetchAndRenderDebtors, 200);
                    } else {
                        const err = await response.json();
                        alert(`还款失败: ${err.error}`);
                    }
                } catch (error) { console.error('Failed to record payment:', error); } finally { hideSpinner(); }
            } else {
                alert('请输入有效的金额！');
            }
        }
    }
    repayBtn.addEventListener('click', handleRepay);


    // 添加新欠款人
    addDebtorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = newDebtorNameInput.value.trim();
        if (!name) return;
        showSpinner();
        try {
            const response = await apiFetch('/debtors', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            if (response && response.ok) {
                newDebtorNameInput.value = '';
                await fetchAndRenderDebtors();
            } else {
                const err = await response.json();
                alert(`添加失败: ${err.error}`);
            }
        } catch (error) { console.error('Failed to add debtor:', error); } finally { hideSpinner(); }
    });
    
    // 添加新账目
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedDebtorId) return;
        const itemData = {
            debtorId: selectedDebtorId,
            description: document.getElementById('item-description').value,
            unit_price: parseFloat(document.getElementById('item-price').value),
            quantity: parseInt(document.getElementById('item-quantity').value) || 1,
            transaction_date: new Date(document.getElementById('item-date').value).getTime()
        };
        showSpinner();
        try {
            const response = await apiFetch('/debt-items', {
                method: 'POST',
                body: JSON.stringify(itemData)
            });
            if (response && response.ok) {
                addItemForm.reset();
                await fetchAndRenderItems(selectedDebtorId);
                await fetchAndRenderDebtors();
            } else {
                const err = await response.json();
                alert(`添加账目失败: ${err.error}`);
            }
        } catch (error) { console.error('Failed to add item:', error); } finally { hideSpinner(); }
    });

    // 删除账目
    debtItemsList.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.classList.contains('btn-danger')) {
            const itemId = target.dataset.itemId;
            if (itemId && confirm('确定要删除这条记录吗？这会同时删除相关的还款记录。')) {
                showSpinner();
                try {
                    const response = await apiFetch(`/debt-items/${itemId}`, { method: 'DELETE' });
                    if (response && response.ok) {
                        await fetchAndRenderItems(selectedDebtorId);
                        await fetchAndRenderDebtors();
                    }
                } catch (error) { console.error('Failed to delete item:', error); } finally { hideSpinner(); }
            }
        }
    });

    // --- 初始化 (不变) ---
    function init() { checkAuth(); fetchAndRenderDebtors(); detailsView.style.display = 'none'; welcomeView.style.display = 'block'; }
    init();
});