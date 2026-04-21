document.addEventListener('DOMContentLoaded', () => {
    // 1. Khôi phục cài đặt khi mở Popup
    chrome.storage.local.get(['theme', 'email'], (result) => {
        if (result.theme === 'dark') {
            document.body.classList.add('dark-mode');
            document.getElementById('toggle-theme').checked = true;
        }
        if (result.email) {
            document.getElementById('input-email').value = result.email;
        }
    });

    // 2. Chuyển đổi Dark/Light Mode
    document.getElementById('toggle-theme').addEventListener('change', (e) => {
        document.body.className = e.target.checked ? 'dark-mode' : 'light-mode';
    });

    // 3. Nút Lưu cài đặt
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const theme = document.getElementById('toggle-theme').checked ? 'dark' : 'light';
        const email = document.getElementById('input-email').value;
        chrome.storage.local.set({ theme, email }, () => {
            alert('Đã lưu cấu hình!');
        });
    });

    // 4. Chụp ảnh màn hình & Gửi API
    document.getElementById('btn-capture').addEventListener('click', () => {
        const statusEl = document.getElementById('status-text');
        document.getElementById('result-box').classList.remove('hidden');
        statusEl.innerText = "Đang chụp ảnh màn hình...";
        statusEl.style.color = "inherit"; // Reset màu chữ

        chrome.tabs.captureVisibleTab(null, {format: 'png'}, (imageUri) => {
            statusEl.innerText = "Đang gửi ảnh sang Backend phân tích...";
            sendToBackend({ type: 'image', data: imageUri });
        });
    });

    // 5. Kiểm tra qua URL
    document.getElementById('btn-check-url').addEventListener('click', () => {
        const url = document.getElementById('input-url').value;
        if (!url) {
            alert("Vui lòng nhập URL cần kiểm tra!");
            return;
        }
        
        const statusEl = document.getElementById('status-text');
        document.getElementById('result-box').classList.remove('hidden');
        statusEl.innerText = "Đang gửi URL sang Backend...";
        statusEl.style.color = "inherit";
        sendToBackend({ type: 'url', data: url });
    });
});

// Hàm giao tiếp với Backend
function sendToBackend(payload) {
    chrome.storage.local.get(['email'], (settings) => {
        const backendUrl = "http://127.0.0.1:8000/detect"; 
        
        // Đóng gói dữ liệu gửi đi
        const requestData = {
            type: payload.type,
            data: payload.data,
            model_name: "default", // Vì dùng 1 model nên gán mặc định
            email: settings.email || ''
        };

        fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) throw new Error("Lỗi mạng từ server");
            return response.json();
        })
        .then(data => {
            const statusEl = document.getElementById('status-text');
            
            if (data.error) {
                statusEl.innerText = `Lỗi: ${data.error}`;
                statusEl.style.color = "red";
                return;
            }

            if (data.is_defaced) {
                statusEl.innerText = `🚨 PHÁT HIỆN DEFACE! (Độ tin cậy: ${data.confidence}%)`;
                statusEl.style.color = "#dc3545"; // Đỏ
            } else {
                statusEl.innerText = `✅ Trang an toàn (Độ tin cậy: ${data.confidence}%)`;
                statusEl.style.color = "#28a745"; // Xanh lá
            }
        })
        .catch(err => {
            const statusEl = document.getElementById('status-text');
            statusEl.innerText = "Mất kết nối tới Backend (127.0.0.1:8000)";
            statusEl.style.color = "red";
            console.error("Fetch Error:", err);
        });
    });
}