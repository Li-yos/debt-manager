// 这个文件处理所有与认证相关的客户端逻辑

// API 的基础 URL，方便管理
const API_BASE_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    // 根据页面上存在的表单来决定绑定哪个事件
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const errorMessageElement = document.getElementById('error-message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // 阻止表单默认的提交行为
            const username = loginForm.username.value;
            const password = loginForm.password.value;
            
            // 清空之前的错误信息
            errorMessageElement.textContent = '';

            try {
                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    // 登录成功！
                    // 将 token 存储到浏览器的 localStorage 中，以便后续的 API 请求使用
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('currentUser', JSON.stringify(data.user));
                    
                    // 跳转到主操作台页面
                    window.location.href = 'dashboard.html';
                } else {
                    // 显示错误信息
                    errorMessageElement.textContent = data.error || '登录失败，请重试。';
                }
            } catch (error) {
                console.error('Login request failed:', error);
                errorMessageElement.textContent = '网络错误，请检查您的连接。';
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = registerForm.username.value;
            const password = registerForm.password.value;
            errorMessageElement.textContent = '';

            try {
                const response = await fetch(`${API_BASE_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();
                
                if (response.ok) {
                    // 注册成功！
                    alert('注册成功！现在您可以登录了。');
                    // 跳转到登录页面
                    window.location.href = 'index.html';
                } else {
                    errorMessageElement.textContent = data.error || '注册失败，请重试。';
                }
            } catch (error) {
                console.error('Registration request failed:', error);
                errorMessageElement.textContent = '网络错误，请检查您的连接。';
            }
        });
    }
});