document.addEventListener('DOMContentLoaded', () => {
    const btnGenerateQr = document.getElementById('btnGenerateQr');
    const form = document.getElementById('donateForm');
    const qrSection = document.getElementById('qrSection');
    const qrImage = document.getElementById('qrImage');
    const slipInput = document.getElementById('slipInput');
    const slipFileName = document.getElementById('slipFileName');
    const btnConfirm = document.getElementById('btnConfirm');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const successOverlay = document.getElementById('successOverlay');
    const btnTestVoice = document.getElementById('btnTestVoice');

    let currentSlipFile = null;

    // ทดสอบระบบเสียง
    btnTestVoice.addEventListener('click', () => {
        const voice = document.getElementById('voice').value;
        let text = 'ทดสอบระบบเสียงโดเนทครับ';
        let lang = 'th';
        let slow = false;
        
        if (voice === 'th-TH-slow') {
            slow = true;
        } else if (voice === 'en-US') {
            lang = 'en';
            text = 'Testing donation voice system';
        }

        const speakFallback = () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utter = new SpeechSynthesisUtterance(text);
                utter.lang = voice === 'en-US' ? 'en-US' : 'th-TH';
                utter.rate = slow ? 0.85 : 1.0;
                window.speechSynthesis.speak(utter);
            }
        };

        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
        const audio = new Audio(url);
        audio.playbackRate = slow ? 0.75 : 1.0;
        
        audio.play().catch(e => {
            console.warn("Google TTS blocked/failed, using Web Speech API:", e);
            speakFallback();
        });

        audio.onerror = () => {
            speakFallback();
        };
    });

    // ระบบเลือกจำนวนเงินด่วน
    const amountInput = document.getElementById('amount');
    const btnAmounts = document.querySelectorAll('.btn-amount');

    btnAmounts.forEach(btn => {
        btn.addEventListener('click', () => {
            amountInput.value = btn.dataset.val;
            btnAmounts.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    amountInput.addEventListener('input', () => {
        btnAmounts.forEach(b => {
            if(b.dataset.val === amountInput.value) b.classList.add('active');
            else b.classList.remove('active');
        });
    });

    // กดปุ่มสร้าง QR
    btnGenerateQr.addEventListener('click', async () => {
        const name = document.getElementById('name').value;
        const amount = document.getElementById('amount').value;
        const message = document.getElementById('message').value;

        if (!name || !amount) {
            alert('กรุณากรอกข้อมูลให้ครบถ้วน');
            return;
        }

        if (amount <= 0) {
            alert('ยอดเงินต้องมากกว่า 0');
            return;
        }

        // ขอ QR จาก Backend
        try {
            loadingOverlay.classList.remove('hidden');
            const res = await fetch('/generate-qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount })
            });
            const data = await res.json();

            if (res.ok) {
                qrImage.src = data.qrCode;
                form.classList.add('hidden');
                qrSection.classList.remove('hidden');
            } else {
                alert(data.error || 'เกิดข้อผิดพลาดในการสร้าง QR Code');
            }
        } catch (error) {
            console.error(error);
            alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    });

    // เลือกไฟล์สลิป
    slipInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            currentSlipFile = e.target.files[0];
            slipFileName.textContent = `ไฟล์ที่เลือก: ${currentSlipFile.name}`;
            btnConfirm.classList.remove('hidden');
        } else {
            currentSlipFile = null;
            slipFileName.textContent = '';
            btnConfirm.classList.add('hidden');
        }
    });

    // ยืนยันการโดเนท (อัปโหลดสลิป)
    btnConfirm.addEventListener('click', async () => {
        if (!currentSlipFile) return;

        const name = document.getElementById('name').value;
        const amount = document.getElementById('amount').value;
        const message = document.getElementById('message').value;
        const voice = document.getElementById('voice').value;

        const formData = new FormData();
        formData.append('slip', currentSlipFile);
        formData.append('name', name);
        formData.append('amount', amount);
        formData.append('message', message);
        formData.append('voice', voice);

        try {
            loadingOverlay.classList.remove('hidden');
            const res = await fetch('/upload-slip', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                qrSection.classList.add('hidden');
                successOverlay.classList.remove('hidden');
            } else {
                alert(data.error || 'ตรวจสลิปไม่ผ่าน กรุณาลองใหม่');
            }
        } catch (error) {
            console.error(error);
            alert('ไม่สามารถอัปโหลดได้');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    });
});
