document.addEventListener('DOMContentLoaded', () => {
    // ---- 1. MENU & MODALS QUẢN LÝ ----
    const menuBtn = document.getElementById('menu-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const modalModel = document.getElementById('modal-model');
    const modalEmail = document.getElementById('modal-email');
    const modalHistory = document.getElementById('modal-history'); // Thêm modal lịch sử

    menuBtn.addEventListener('click', (e) => { dropdownMenu.classList.toggle('show'); e.stopPropagation(); });
    document.addEventListener('click', (e) => {
        if (!menuBtn.contains(e.target) && !dropdownMenu.contains(e.target)) dropdownMenu.classList.remove('show');
    });

    document.getElementById('opt-theme').addEventListener('click', (e) => {
        e.preventDefault(); document.body.classList.toggle('dark-theme'); dropdownMenu.classList.remove('show');
        chrome.storage.local.set({ isDarkMode: document.body.classList.contains('dark-theme') });
    });
    
    document.getElementById('opt-model').addEventListener('click', (e) => {
        e.preventDefault(); modalModel.classList.remove('hidden'); dropdownMenu.classList.remove('show');
    });
    
    document.getElementById('opt-account').addEventListener('click', (e) => {
        e.preventDefault(); modalEmail.classList.remove('hidden'); dropdownMenu.classList.remove('show');
    });

    // XỬ LÝ NÚT LỊCH SỬ
    document.getElementById('opt-history').addEventListener('click', (e) => {
        e.preventDefault(); 
        loadHistoryUI(); // Gọi hàm hiển thị lịch sử
        modalHistory.classList.remove('hidden'); 
        dropdownMenu.classList.remove('show');
    });

    // Xử lý đóng tất cả Modal
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => { 
            modalModel.classList.add('hidden'); 
            modalEmail.classList.add('hidden'); 
            modalHistory.classList.add('hidden');
        });
    });

    // Xử lý Xóa lịch sử
    document.getElementById('clear-history-btn').addEventListener('click', () => {
        if(confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử quét?")) {
            chrome.storage.local.set({ scanHistory: [] }, () => {
                loadHistoryUI();
            });
        }
    });

    document.getElementById('save-model-btn').addEventListener('click', () => {
        chrome.storage.local.set({ aiModel: document.getElementById('model-select').value }, () => { modalModel.classList.add('hidden'); });
    });
    document.getElementById('save-email-btn').addEventListener('click', () => {
        chrome.storage.local.set({ userEmail: document.getElementById('email-input').value }, () => { modalEmail.classList.add('hidden'); });
    });

    // Nạp dữ liệu cấu hình khi mở
    chrome.storage.local.get(['isDarkMode', 'aiModel', 'userEmail'], (data) => {
        if (data.isDarkMode) document.body.classList.add('dark-theme');
        if (data.aiModel) document.getElementById('model-select').value = data.aiModel;
        if (data.userEmail) document.getElementById('email-input').value = data.userEmail;
    });

    // ---- HÀM HỖ TRỢ LƯU VÀ HIỂN THỊ LỊCH SỬ ----
    function saveToHistory(targetName, resultData) {
        // Lấy lịch sử cũ ra, mặc định là mảng rỗng nếu chưa có
        chrome.storage.local.get({ scanHistory: [] }, (data) => {
            let history = data.scanHistory;
            const newItem = {
                target: targetName,
                time: new Date().toLocaleString('vi-VN'),
                is_defaced: resultData.is_defaced,
                confidence: resultData.confidence
            };
            history.unshift(newItem); // Đẩy mục mới lên đầu
            if (history.length > 20) history.pop(); // Chỉ giữ lại 20 mục gần nhất cho nhẹ máy
            
            chrome.storage.local.set({ scanHistory: history });
        });
    }

    function loadHistoryUI() {
        const historyList = document.getElementById('history-list');
        chrome.storage.local.get({ scanHistory: [] }, (data) => {
            const history = data.scanHistory;
            historyList.innerHTML = '';
            
            if (history.length === 0) {
                historyList.innerHTML = '<p style="text-align:center; color:gray; padding: 20px;">Chưa có lịch sử quét nào.</p>';
                return;
            }

            history.forEach(item => {
                const statusClass = item.is_defaced ? 'danger' : 'safe';
                const statusText = item.is_defaced ? '🚨 Đã bị Deface' : '✅ An Toàn';
                
                historyList.innerHTML += `
                    <div class="history-item">
                        <div class="hist-target">${item.target}</div>
                        <div class="hist-time">${item.time}</div>
                        <div class="hist-result ${statusClass}">${statusText} (${item.confidence}%)</div>
                    </div>
                `;
            });
        });
    }

    // ---- 2. LOGIC GỌI API BACKEND ----
    const resultBox = document.getElementById('result-box');
    const resultText = document.getElementById('result-text');

    function showResult(message, type) {
        resultBox.classList.remove('hidden');
        resultBox.className = `result-box result-${type}`;
        resultText.innerText = message;
    }

    async function sendToBackend(payload) {
        showResult('⏳ Đang phân tích, vui lòng chờ...', 'loading');
        
        try {
            const response = await fetch('http://127.0.0.1:8000/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.error) {
                showResult(`❌ Lỗi: ${result.error}`, 'danger');
                return;
            }

            if (result.is_defaced) {
                showResult(`🚨 CẢNH BÁO: Bị Deface!\nĐộ tin cậy: ${result.confidence}%`, 'danger');
            } else {
                showResult(`✅ Trang web An Toàn!\nĐộ tin cậy: ${result.confidence}%`, 'safe');
            }

            // GHI LẠI VÀO LỊCH SỬ SAU KHI QUÉT XONG
            const targetName = payload.type === 'url' ? payload.data : "Tab hiện tại";
            saveToHistory(targetName, result);

        } catch (error) {
            showResult('❌ Lỗi kết nối tới Server Backend (127.0.0.1:8000)', 'danger');
        }
    }

    // NÚT 1: CHỤP MÀN HÌNH TAB HIỆN TẠI
    document.getElementById('scan-tab-btn').addEventListener('click', () => {
        chrome.storage.local.get(['aiModel', 'userEmail'], (data) => {
            const currentModel = data.aiModel || 'EfficientNet';
            const email = data.userEmail || '';

            chrome.tabs.captureVisibleTab(null, {format: 'png'}, (dataUrl) => {
                if(chrome.runtime.lastError) {
                    showResult("❌ Không thể chụp tab này (Lỗi quyền).", "danger");
                    return;
                }
                const payload = { type: 'image', data: dataUrl, model_name: currentModel, email: email };
                sendToBackend(payload);
            });
        });
    });

    // NÚT 2: QUÉT URL
    document.getElementById('scan-url-btn').addEventListener('click', () => {
        const urlValue = document.getElementById('url-input').value.trim();
        if (!urlValue) {
            alert("Vui lòng nhập URL cần quét!");
            return;
        }

        chrome.storage.local.get(['aiModel', 'userEmail'], (data) => {
            const currentModel = data.aiModel || 'EfficientNet';
            const email = data.userEmail || '';

            const payload = { type: 'url', data: urlValue, model_name: currentModel, email: email };
            sendToBackend(payload);
        });
    });
});