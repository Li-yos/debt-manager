// 这是我们应用的最终版核心，处理所有 dashboard 页面的交互逻辑
// v6: 重新添加并实现删除欠款人功能

document.addEventListener('DOMContentLoaded', () => {
    // --- 全局变量和元素获取 (保持不变) ---
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
    const paymentsHistoryToggle = document.getElementById('payments-history-toggle');
    const paymentsHistoryList = document.getElementById('payments-history-list');
    let selectedDebtorId = null;

    // --- 核心函数 (大部分保持不变) ---
    function showSpinner() { spinnerOverlay.classList.remove('hidden'); }
    function hideSpinner() { spinnerOverlay.classList.add('hidden'); }
    function checkAuth() { if (!token) { window.location.href = 'index.html'; } else { welcomeMessage.textContent = `欢迎, ${currentUser.username}!`; } }
    function logout() { localStorage.removeItem('authToken'); localStorage.removeItem('currentUser'); window.location.href = 'index.html'; }
    async function apiFetch(endpoint, options = {}) { const defaultHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }; options.headers = { ...defaultHeaders, ...options.headers }; const response = await fetch(`${API_BASE_URL}${endpoint}`, options); if (response.status === 401) { logout(); return; } return response; }
    
    // 【核心修改点 ①】重新渲染欠款人列表，这次包含删除按钮
    async function fetchAndRenderDebtors() {
        showSpinner();
        try {
            const response = await apiFetch('/debtors');
            if (!response.ok) return;
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
                        <button class="btn btn-tiny btn-delete-debtor" title="删除" data-debtor-id="${debtor.id}">🗑️</button>
                    </div>
                `;
                if (debtor.id === selectedDebtorId) {
                    li.classList.add('active');
                }
                debtorsList.appendChild(li);
            });
        } catch (error) { console.error('Failed to fetch debtors:', error); } finally { hideSpinner(); }
    }

    // ... (fetchAndRenderItems, handleSelectDebtor, editDebtor, fetchAndRenderPayments, recordPayment 函数保持不变) ...

    // 【核心修改点 ②】创建一个新的函数来处理删除欠kkuan人
    async function deleteDebtor(debtorId) {
        showSpinner();
        try {
            const response = await apiFetch(`/debtors/${debtorId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // 如果删除的是当前选中的，则重置右侧面板
                if (selectedDebtorId === debtorId) {
                    selectedDebtorId = null;
                    detailsView.style.display = 'none';
                    welcomeView.style.display = 'block';
                }
                await fetchAndRenderDebtors(); // 刷新列表
            } else {
                const err = await response.json();
                alert(`删除失败: ${err.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('Failed to delete debtor:', error);
        } finally {
            hideSpinner();
        }
    }


    // --- 事件监听器绑定 ---
    logoutBtn.addEventListener('click', logout);

    // 【核心修改点 ③】修改欠款人列表的点击事件，增加对删除按钮的判断
    debtorsList.addEventListener('click', (event) => {
        const target = event.target;
        const editButton = target.closest('.btn-edit');
        const deleteButton = target.closest('.btn-delete-debtor');

        if (editButton) {
            event.stopPropagation();
            const debtorId = editButton.dataset.debtorId;
            const currentName = editButton.dataset.debtorName;
            const newName = prompt('请输入新的欠款人姓名:', currentName);
            if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
                editDebtor(debtorId, newName.trim());
            }
            return;
        }

        if (deleteButton) {
            event.stopPropagation();
            if (confirm('确定要删除这位欠款人吗？\n所有相关的欠款和还款记录都将被永久删除！')) {
                const debtorId = deleteButton.dataset.debtorId;
                deleteDebtor(debtorId);
            }
            return;
        }

        const li = target.closest('li');
        if (li) {
            handleSelectDebtor(li);
        }
    });

    // ... (addDebtorForm, addItemForm, debtItemsList, repayBtn, paymentsHistoryToggle 的事件监听器保持不变) ...
    // ... (init 函数也保持不变) ...

    // --- 为了方便你完整复制，下面是所有函数的完整版 ---
    async function fetchAndRenderItems(debtorId) { showSpinner(); try { const response = await apiFetch(`/debt-items?debtorId=${debtorId}`); if (!response.ok) return; const items = await response.json(); debtItemsList.innerHTML = ''; let unpaidTotal = 0; if (items.length === 0) { debtItemsList.innerHTML = '<li>暂无欠款记录。</li>'; } else { items.forEach(item => { const amountOwed = item.total_amount - item.amount_paid; const isPaid = amountOwed < 0.01; unpaidTotal += amountOwed; const li = document.createElement('li'); li.classList.toggle('paid', isPaid); const progressPercent = isPaid ? 100 : (item.amount_paid / item.total_amount) * 100; li.innerHTML = `<div class="item-main"><div>${item.description} (¥${item.unit_price.toFixed(2)} x ${item.quantity}) = <strong>¥${item.total_amount.toFixed(2)}</strong></div><div class="item-meta">日期: ${new Date(item.transaction_date).toLocaleDateString()} | 状态: ${isPaid ? '已还清' : `还差 ¥${amountOwed.toFixed(2)}`}</div><div class="item-progress"><div class="progress-bar" style="width: ${progressPercent}%;"></div></div></div><div class="item-actions"><button class="btn btn-small btn-danger" data-item-id="${item.id}">删除</button></div>`; debtItemsList.appendChild(li); }); } totalUnpaidAmount.textContent = `当前未还总额: ¥${unpaidTotal.toFixed(2)}`; repayBtn.classList.toggle('hidden', unpaidTotal < 0.01); } catch(error) { console.error('Failed to fetch debt items:', error); } finally { hideSpinner(); } }
    function handleSelectDebtor(liElement) { if (!liElement) return; document.querySelectorAll('#debtors-list li').forEach(el => el.classList.remove('active')); liElement.classList.add('active'); selectedDebtorId = liElement.dataset.debtorId; const debtorName = liElement.querySelector('.debtor-name-text').textContent; detailsView.style.display = 'block'; welcomeView.style.display = 'none'; addItemForm.classList.remove('hidden'); currentDebtorName.textContent = `欠款人: ${debtorName}`; fetchAndRenderItems(selectedDebtorId); fetchAndRenderPayments(selectedDebtorId); }
    async function editDebtor(debtorId, newName, contactInfo = null) { showSpinner(); try { const response = await apiFetch(`/debtors/${debtorId}`, { method: 'PUT', body: JSON.stringify({ name: newName, contact_info: contactInfo }) }); if (response.ok) { await fetchAndRenderDebtors(); if (selectedDebtorId === debtorId) { currentDebtorName.textContent = `欠款人: ${newName}`; } } else { const err = await response.json(); alert(`编辑失败: ${err.error}`); } } catch(error) { console.error('Failed to edit debtor:', error); } finally { hideSpinner(); } }
    async function fetchAndRenderPayments(debtorId) { try { const response = await apiFetch(`/payments?debtorId=${debtorId}`); if (!response || !response.ok) { paymentsHistoryToggle.classList.add('hidden'); paymentsHistoryList.innerHTML = ''; return; } const payments = await response.json(); paymentsHistoryList.innerHTML = ''; if (payments.length > 0) { paymentsHistoryToggle.classList.remove('hidden'); paymentsHistoryToggle.querySelector('.toggle-icon').classList.remove('collapsed'); paymentsHistoryList.classList.remove('collapsed'); payments.forEach(payment => { const li = document.createElement('li'); li.style.backgroundColor = '#f0fdf4'; li.innerHTML = `<div class="item-main"><div>还款 <strong>¥${payment.amount.toFixed(2)}</strong></div><div class="item-meta">日期: ${new Date(payment.payment_date).toLocaleDateString()}</div></div>`; paymentsHistoryList.appendChild(li); }); } else { paymentsHistoryToggle.classList.add('hidden'); } } catch (error) { console.error('Failed to fetch payments history:', error); paymentsHistoryToggle.classList.add('hidden'); paymentsHistoryList.innerHTML = ''; } }
    async function recordPayment(debtorId, amount) { showSpinner(); try { const paymentData = { debtorId: debtorId, amount: amount, payment_date: Date.now() }; const response = await apiFetch('/payments', { method: 'POST', body: JSON.stringify(paymentData) }); if (response.ok) { await fetchAndRenderItems(selectedDebtorId); await fetchAndRenderPayments(selectedDebtorId); setTimeout(fetchAndRenderDebtors, 200); } else { const err = await response.json(); alert(`还款失败: ${err.error}`); } } catch (error) { console.error('Failed to record payment:', error); } finally { hideSpinner(); } }
    addDebtorForm.addEventListener('submit', async (e) => { e.preventDefault(); const name = newDebtorNameInput.value.trim(); if (!name) return; showSpinner(); try { const response = await apiFetch('/debtors', { method: 'POST', body: JSON.stringify({ name }) }); if (response.ok) { newDebtorNameInput.value = ''; await fetchAndRenderDebtors(); } else { const err = await response.json(); alert(`添加失败: ${err.error}`); } } catch (error) { console.error('Failed to add debtor:', error); } finally { hideSpinner(); } });
    addItemForm.addEventListener('submit', async (e) => { e.preventDefault(); if (!selectedDebtorId) { alert('请先选择一个欠款人！'); return; } const itemData = { debtorId: selectedDebtorId, description: document.getElementById('item-description').value, unit_price: parseFloat(document.getElementById('item-price').value), quantity: parseInt(document.getElementById('item-quantity').value) || 1, transaction_date: new Date(document.getElementById('item-date').value).getTime() }; showSpinner(); try { const response = await apiFetch('/debt-items', { method: 'POST', body: JSON.stringify(itemData) }); if (response.ok) { addItemForm.reset(); await fetchAndRenderItems(selectedDebtorId); await fetchAndRenderDebtors(); } else { const err = await response.json(); alert(`添加账目失败: ${err.error}`); } } catch (error) { console.error('Failed to add item:', error); } finally { hideSpinner(); } });
    debtItemsList.addEventListener('click', async (e) => { const target = e.target; if (target.classList.contains('btn-danger')) { const itemId = target.dataset.itemId; if (itemId && confirm('确定要删除这条记录吗？这会同时删除相关的还款记录。')) { showSpinner(); try { const response = await apiFetch(`/debt-items/${itemId}`, { method: 'DELETE' }); if (response.ok) { await fetchAndRenderItems(selectedDebtorId); await fetchAndRenderPayments(selectedDebtorId); await fetchAndRenderDebtors(); } } catch (error) { console.error('Failed to delete item:', error); } finally { hideSpinner(); } } } });
    repayBtn.addEventListener('click', () => { const amountStr = prompt('请输入本次还款金额:'); if (amountStr) { const amount = parseFloat(amountStr); if (!isNaN(amount) && amount > 0) { recordPayment(selectedDebtorId, amount); } else { alert('请输入有效的金额！'); } } });
    paymentsHistoryToggle.addEventListener('click', () => { const icon = paymentsHistoryToggle.querySelector('.toggle-icon'); paymentsHistoryList.classList.toggle('collapsed'); icon.classList.toggle('collapsed'); });
    function init() { checkAuth(); fetchAndRenderDebtors(); detailsView.style.display = 'none'; welcomeView.style.display = 'block'; }
    init();
});