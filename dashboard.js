// 这是我们应用的核心，处理所有 dashboard 页面的交互逻辑
// v2: 集成了加载动画和编辑欠款人功能

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
    
    // 加载动画元素
    const spinnerOverlay = document.getElementById('spinner-overlay');
    
    // 用于存储当前选择的欠款人ID
    let selectedDebtorId = null;

    // --- 核心函数 ---

    // 显示/隐藏加载动画的辅助函数
    function showSpinner() {
        spinnerOverlay.classList.remove('hidden');
    }
    function hideSpinner() {
        spinnerOverlay.classList.add('hidden');
    }

    // 检查用户是否登录
    function checkAuth() {
        if (!token) {
            window.location.href = 'index.html';
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
        if (response.status === 401) {
            logout(); // 如果 token 失效，自动退出登录
            return;
        }
        return response;
    }

    // 获取并渲染欠款人列表
    async function fetchAndRenderDebtors() {
        showSpinner();
        try {
            const response = await apiFetch('/debtors');
            const debtors = await response.json();
            
            debtorsList.innerHTML = '';
            debtors.forEach(debtor => {
                const li = document.createElement('li');
                li.dataset.debtorId = debtor.id;
                
                // 【修改点】添加了编辑按钮和新的 class
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
        } catch (error) {
            console.error('Failed to fetch debtors:', error);
        } finally {
            hideSpinner();
        }
    }
    
    // 获取并渲染指定欠款人的账目明细
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
        } finally {
            hideSpinner();
        }
    }
    
    // 处理选择欠款人的逻辑
    function handleSelectDebtor(liElement) {
        if (!liElement) return;

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
    
    // 【新增】处理编辑欠款人名称的函数
    async function editDebtor(debtorId, newName, contactInfo = null) {
        showSpinner();
        try {
            const response = await apiFetch(`/debtors/${debtorId}`, {
                method: 'PUT',
                body: JSON.stringify({ name: newName, contact_info: contactInfo })
            });
            if (response.ok) {
                await fetchAndRenderDebtors();
                if (selectedDebtorId === debtorId) {
                    currentDebtorName.textContent = `欠款人: ${newName}`;
                }
            } else {
                const err = await response.json();
                alert(`编辑失败: ${err.error}`);
            }
        } catch(error) {
            console.error('Failed to edit debtor:', error);
        } finally {
            hideSpinner();
        }
    }


    // --- 事件监听器绑定 ---

    logoutBtn.addEventListener('click', logout);

    // 【修改点】欠款人列表的点击事件，现在可以区分点击的是名称还是编辑按钮
    debtorsList.addEventListener('click', (event) => {
        const target = event.target;
        const editButton = target.closest('.btn-edit');
        
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

        const li = target.closest('li');
        if (li) {
            handleSelectDebtor(li);
        }
    });

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
            if (response.ok) {
                newDebtorNameInput.value = '';
                await fetchAndRenderDebtors();
            } else {
                const err = await response.json();
                alert(`添加失败: ${err.error}`);
            }
        } catch (error) {
            console.error('Failed to add debtor:', error);
        } finally {
            hideSpinner();
        }
    });
    
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
            transaction_date: new Date(document.getElementById('item-date').value).getTime()
        };
        showSpinner();
        try {
            const response = await apiFetch('/debt-items', {
                method: 'POST',
                body: JSON.stringify(itemData)
            });
            if (response.ok) {
                addItemForm.reset();
                await fetchAndRenderItems(selectedDebtorId);
                await fetchAndRenderDebtors();
            } else {
                const err = await response.json();
                alert(`添加账目失败: ${err.error}`);
            }
        } catch (error) {
            console.error('Failed to add item:', error);
        } finally {
            hideSpinner();
        }
    });

    debtItemsList.addEventListener('click', async (e) => {
        const target = e.target;
        const itemId = target.dataset.itemId;
        if (!itemId) return;
        
        showSpinner(); // 开始操作前显示加载
        try {
            if (target.classList.contains('btn-success')) {
                const response = await apiFetch(`/debt-items/${itemId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: 'paid' })
                });
                if (response.ok) {
                    await fetchAndRenderItems(selectedDebtorId);
                    await fetchAndRenderDebtors();
                }
            }
    
            if (target.classList.contains('btn-danger')) {
                if (confirm('确定要删除这条记录吗？')) {
                    const response = await apiFetch(`/debt-items/${itemId}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        await fetchAndRenderItems(selectedDebtorId);
                        await fetchAndRenderDebtors();
                    }
                }
            }
        } catch (error) {
            console.error('Failed to process item action:', error);
        } finally {
            // 如果用户点了删除但又点了取消，也需要隐藏加载动画
            // 但为简化，我们统一在最后隐藏
            hideSpinner();
        }
    });

    // --- 初始化 ---
    function init() {
        checkAuth();
        fetchAndRenderDebtors();
        detailsView.style.display = 'none';
        welcomeView.style.display = 'block';
    }

    init();
});