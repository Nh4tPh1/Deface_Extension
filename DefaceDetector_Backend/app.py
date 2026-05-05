import nest_asyncio
from fastapi import FastAPI
from pydantic import BaseModel
import tensorflow as tf   # <--- Động cơ Keras 3 (Cho MobileNet, ResNet)
import tf_keras           # <--- Động cơ Keras 2 (Cho EfficientNet)
import numpy as np
import base64
from io import BytesIO
from PIL import Image
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import requests
import urllib3
from playwright.async_api import async_playwright
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import gc 
from starlette.concurrency import run_in_threadpool 

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import sys
import asyncio
import traceback

# Thêm đoạn này để sửa lỗi Playwright bị treo ngầm trên Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = "nhatphivo781@gmail.com" 
SENDER_PASSWORD = "oavu cbps vvga npcg"

nest_asyncio.apply()
app = FastAPI()

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# ==========================================
# KHAI BÁO MODEL BẰNG FILE .KERAS GỐC VÀ ĐỊNH DANH PHIÊN BẢN
# ==========================================
AVAILABLE_MODELS = {
    "EfficientNet": {
        "path": "models/efficientnet_defacement_model.keras", 
        "engine": "keras2" # EfficientNet sử dụng keras2
    },
    "ResNet50": {
        "path": "models/ResNet50_defacement_model.keras", 
        "engine": "keras3" # ResNet và MobileNet xài bản mới
    },    
    "MobileNet_BaseLine": {
        "path": "models/mobileNetv3_baseline_defacement_model.keras", 
        "engine": "keras3"
    },
    "MobileNet_Finetuning": {
        "path": "models/mobileNetv3_finetuning_defacement_model.keras", 
        "engine": "keras3"
    }
}

loaded_model_data = {"name": None, "model": None}

def get_ai_model(model_name):
    if model_name not in AVAILABLE_MODELS:
        raise ValueError(f"Model '{model_name}' chưa được khai báo!")
    
    if loaded_model_data["name"] != model_name:
        print(f"\n🧹 Đang dọn dẹp RAM để chuyển sang {model_name}...")
        loaded_model_data["model"] = None 
        
        # Dọn rác cho cả 2 engine để tránh rò rỉ RAM
        tf.keras.backend.clear_session() 
        tf_keras.backend.clear_session()
        gc.collect()      
        
        model_info = AVAILABLE_MODELS[model_name]
        engine_type = model_info["engine"]
        
        print(f"⏳ Đang nạp model {model_name} bằng {engine_type.upper()} Engine...")
        
        # THUẬT TOÁN ĐỊNH TUYẾN (ROUTER) ĐỘNG CƠ THÔNG MINH
        if engine_type == "keras2":
            loaded_model_data["model"] = tf_keras.models.load_model(model_info["path"], compile=False)
        else:
            loaded_model_data["model"] = tf.keras.models.load_model(model_info["path"], compile=False)
            
        loaded_model_data["name"] = model_name
        print(f"✅ Đã tải xong {model_name}!")
        
    return loaded_model_data["model"]

class DetectionRequest(BaseModel):
    type: str; data: str; model_name: str; email: str

def send_email_alert(target_email, source, confidence):
    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL; msg['To'] = target_email
        msg['Subject'] = f"🚨 CẢNH BÁO BẢO MẬT: Phát hiện tấn công Deface!"
        body = f"Nguồn: {source}\nMức độ nguy hiểm: {confidence}%\nVui lòng kiểm tra ngay!"
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls(); server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.sendmail(SENDER_EMAIL, target_email, msg.as_string()); server.quit()
    except Exception as e: pass

def process_image(img):
    img = img.convert('RGB')
    img_resized = img.resize((224, 224))
    img_array = np.array(img_resized, dtype=np.float32)
    return np.expand_dims(img_array, axis=0)

def process_base64_image(base64_str):
    return process_image(Image.open(BytesIO(base64.b64decode(base64_str.split(',')[1]))))

def process_bytes_image(image_bytes):
    return process_image(Image.open(BytesIO(image_bytes)))

async def capture_screenshot_from_url(url: str):
    # 1. Đổi http thành https (Nhiều web hiện nay chặn hoặc lỗi nếu truy cập bằng HTTP cũ)
    if not url.startswith("http://") and not url.startswith("https://"): 
        url = "https://" + url 
        
    # Check nếu là link ảnh trực tiếp
    try:
        resp = requests.get(url, verify=False, timeout=5)
        if 'image' in resp.headers.get('Content-Type', '').lower(): 
            return resp.content
    except Exception as e: 
        print(f"⚠️ Lỗi Requests (bỏ qua): {e}")

    # Khởi chạy Playwright
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            
            # 2. THÊM USER-AGENT: Cực kỳ quan trọng để lừa các hệ thống chống bot như Cloudflare
            context = await browser.new_context(
                ignore_https_errors=True,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            await page.set_viewport_size({"width": 1366, "height": 768})
            
            try: 
                # 3. Đổi "load" thành "domcontentloaded" để không bị kẹt vì web load quảng cáo/video quá lâu
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            except Exception as e: 
                print(f"⚠️ Cảnh báo lúc tải trang {url}: {e}")
                
            await page.wait_for_timeout(3000) # Đợi 3s cho web render giao diện
            screenshot_bytes = await page.screenshot()
            await browser.close()
            return screenshot_bytes
            
    except Exception as e: 
        print("\n" + "="*50)
        print("❌ LỖI NGHIÊM TRỌNG KHI CHỤP ẢNH WEB:")
        traceback.print_exc()  # In ra nguyên nhân lỗi để dễ debug
        print("="*50 + "\n")
        return None

@app.post("/detect")
async def detect_deface(request: DetectionRequest):
    try:
        source_name = "Ảnh chụp trực tiếp"
        try: current_model = await run_in_threadpool(get_ai_model, request.model_name)
        except ValueError as ve: return {"error": str(ve)}
            
        if request.type == 'image': img_tensor = process_base64_image(request.data)
        elif request.type == 'url':
            source_name = request.data
            screenshot_bytes = await capture_screenshot_from_url(source_name)
            if not screenshot_bytes: return {"error": "Lỗi kết nối!"}
            img_tensor = process_bytes_image(screenshot_bytes)
        else: return {"error": "Loại request không hợp lệ!"}

        # Inference chạy mượt trên cả 2 Engine
        prediction = await run_in_threadpool(current_model.predict, img_tensor, verbose=0)
        deface_prob = float(prediction[0][1]) 
        is_defaced = bool(deface_prob > 0.65)
        conf = round(deface_prob * 100 if is_defaced else (1 - deface_prob) * 100, 2)
        
        if is_defaced and request.email:
            await run_in_threadpool(send_email_alert, request.email, source_name, conf)
        
        return {"is_defaced": is_defaced, "confidence": conf, "message": "Hoàn tất"}
    except Exception as e: return {"error": f"Lỗi server: {str(e)}"}

if __name__ == "__main__":
    print("\n" + "="*50)
    print("🚀 ĐANG KHỞI ĐỘNG BACKEND SERVER TẠI HTTP://127.0.0.1:8000")
    print("⏹️ Nhấn nút 'Interrupt' (hoặc bấm 0, 0) nếu muốn tắt server.")
    print("="*50 + "\n")
    
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")