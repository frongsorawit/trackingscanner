// script.js
// URL ของ Google Apps Script Web App ของคุณ
// **สำคัญมาก: คุณจะต้องเปลี่ยนค่านี้เป็น URL ที่ได้จากการ Deploy Google Apps Script ในขั้นตอนถัดไป**
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbZJ2lfNEA4u7QE5BtPJgm2BobSYBuCU34QKQTJBZ1-2vNXWu4UFv1AZ1dzNMaQC1E/exec';

// Elements ในหน้าเว็บ
const scanButton = document.getElementById('scanButton');
const videoElement = document.getElementById('video');
const scanMessage = document.getElementById('scan-message');
const trackingNumberInput = document.getElementById('trackingNumber');
const checkButton = document.getElementById('checkButton');
const resultContainer = document.getElementById('resultContainer');
const resultText = document.getElementById('resultText');
const loadingIndicator = document.getElementById('loadingIndicator');
const customAlert = document.getElementById('customAlert');
const alertTitle = document.getElementById('alertTitle');
const alertMessage = document.getElementById('alertMessage');
const alertCloseButton = document.getElementById('alertCloseButton');

let codeReader; // ตัวแปรสำหรับ ZXing-JS
let currentStream; // ตัวแปรสำหรับเก็บ MediaStream ของกล้อง

// ฟังก์ชันสำหรับแสดง Custom Alert
function showAlert(title, message) {
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    customAlert.classList.remove('hidden');
}

// Event Listener สำหรับปิด Custom Alert
alertCloseButton.addEventListener('click', () => {
    customAlert.classList.add('hidden');
});

// ฟังก์ชันสำหรับแสดง/ซ่อน Loading Indicator
function showLoading(isLoading) {
    if (isLoading) {
        loadingIndicator.classList.remove('hidden');
        resultContainer.classList.add('hidden'); // ซ่อนผลลัพธ์เก่า
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

// ฟังก์ชันสำหรับตรวจสอบเลขพัสดุ
async function checkTrackingNumber(number) {
    if (!number) {
        showAlert('ข้อผิดพลาด', 'กรุณาป้อนเลขพัสดุ');
        return;
    }

    showLoading(true); // แสดง loading

    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors', // สำคัญสำหรับ CORS
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `trackingNumber=${encodeURIComponent(number)}`
        });

        // ตรวจสอบว่า response เป็น JSON หรือไม่
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            displayResult(number, data.isBlacklisted);
        } else {
            // ถ้าไม่ใช่ JSON อาจเป็นข้อความธรรมดาหรือ HTML (เช่น error page)
            const text = await response.text();
            console.error('Server response was not JSON:', text);
            showAlert('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบ URL ของ Google Apps Script และการตั้งค่า CORS');
            displayResult(number, false, 'error'); // แสดงผลเป็นปลอดภัยชั่วคราว หรือจัดการข้อผิดพลาด
        }

    } catch (error) {
        console.error('Error checking tracking number:', error);
        showAlert('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการตรวจสอบ กรุณาลองใหม่อีกครั้ง');
        displayResult(number, false, 'error'); // แสดงผลเป็นปลอดภัยชั่วคราว หรือจัดการข้อผิดพลาด
    } finally {
        showLoading(false); // ซ่อน loading
    }
}

// ฟังก์ชันสำหรับแสดงผลลัพธ์
function displayResult(number, isBlacklisted, statusType = 'normal') {
    resultContainer.classList.remove('hidden', 'result-safe', 'result-blacklist');
    resultText.innerHTML = `เลขพัสดุ: <span class="font-bold">${number}</span><br>`;

    if (statusType === 'error') {
        resultText.innerHTML += `<span class="text-gray-600">เกิดข้อผิดพลาดในการตรวจสอบ</span>`;
        resultContainer.classList.add('bg-gray-200', 'text-gray-800');
    } else if (isBlacklisted) {
        resultText.innerHTML += `<span class="text-red-600 font-bold">⚠️ อยู่ใน Blacklist!</span>`;
        resultContainer.classList.add('result-blacklist');
    } else {
        resultText.innerHTML += `<span class="text-green-600 font-bold">✅ ปลอดภัย</span>`;
        resultContainer.classList.add('result-safe');
    }
}

// Event Listener สำหรับปุ่ม "ตรวจสอบ" (ป้อนด้วยตนเอง)
checkButton.addEventListener('click', () => {
    const number = trackingNumberInput.value.trim();
    checkTrackingNumber(number);
});

// Event Listener สำหรับปุ่ม "สแกนบาร์โค้ด"
scanButton.addEventListener('click', async () => {
    if (!codeReader) {
        codeReader = new ZXing.BrowserMultiFormatReader();
    }

    // ถ้ากล้องกำลังทำงานอยู่ ให้หยุดก่อน
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        videoElement.classList.add('hidden');
        scanMessage.classList.add('hidden');
        scanButton.textContent = 'สแกนบาร์โค้ด';
        scanButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        scanButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        currentStream = null;
        codeReader.reset(); // รีเซ็ตตัวอ่านโค้ด
        return; // ออกจากฟังก์ชัน
    }

    try {
        // ขอสิทธิ์เข้าถึงกล้อง
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); // ใช้กล้องหลัง
        currentStream = stream; // เก็บ stream ไว้เพื่อหยุดภายหลัง
        videoElement.srcObject = stream;
        videoElement.classList.remove('hidden');
        scanMessage.classList.remove('hidden');
        scanMessage.textContent = 'กำลังโหลดกล้อง...';
        scanButton.textContent = 'หยุดสแกน';
        scanButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        scanButton.classList.add('bg-red-600', 'hover:bg-red-700');


        // เริ่มต้นการสแกน
        codeReader.decodeFromStream(stream, videoElement, (result, err) => {
            if (result) {
                console.log('Barcode scanned:', result.text);
                trackingNumberInput.value = result.text; // ใส่เลขที่สแกนได้ลงในช่องกรอก
                checkTrackingNumber(result.text); // ตรวจสอบทันที
                // หยุดกล้องหลังจากสแกนได้
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    videoElement.classList.add('hidden');
                    scanMessage.classList.add('hidden');
                    scanButton.textContent = 'สแกนบาร์โค้ด';
                    scanButton.classList.remove('bg-red-600', 'hover:bg-red-700');
                    scanButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
                    currentStream = null;
                    codeReader.reset();
                }
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error('Error during scan:', err);
                scanMessage.textContent = 'เกิดข้อผิดพลาดในการสแกน';
            }
        });
        scanMessage.textContent = 'เล็งกล้องไปที่บาร์โค้ด...';

    } catch (err) {
        console.error('Error accessing camera:', err);
        showAlert('ข้อผิดพลาด', 'ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการเข้าถึงกล้องในเบราว์เซอร์ของคุณ หรือเบราว์เซอร์ของคุณอาจไม่รองรับ');
        videoElement.classList.add('hidden');
        scanMessage.classList.add('hidden');
        scanButton.textContent = 'สแกนบาร์โค้ด';
        scanButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        scanButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (codeReader) {
            codeReader.reset();
        }
    }
});

// ตรวจสอบว่าเบราว์เซอร์รองรับ MediaDevices API หรือไม่
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    scanButton.disabled = true;
    scanButton.textContent = 'เบราว์เซอร์ไม่รองรับการสแกน';
    scanButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
    scanButton.classList.add('bg-gray-400', 'cursor-not-allowed');
    showAlert('แจ้งเตือน', 'เบราว์เซอร์ของคุณไม่รองรับการเข้าถึงกล้องเพื่อสแกนบาร์โค้ด คุณยังสามารถป้อนเลขพัสดุด้วยตนเองได้');
}
