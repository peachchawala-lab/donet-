const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const generatePayload = require('promptpay-qr');
const qrcode = require('qrcode');
const googleTTS = require('google-tts-api');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const https = require('https');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// ป้องกันคนยิง Request รัวๆ (Rate Limiting)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 นาที
    max: 100, // จำกัด 100 requests ต่อ 1 IP 
    message: { error: 'ส่งคำขอมากเกินไป กรุณารอสักครู่' }
});

app.use(cors());
// ระบบป้องกัน HTTP headers (Security)
app.use(helmet({
    contentSecurityPolicy: false, // ปิดไว้เพื่อให้ดึง Font/API ภายนอกได้
    crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' })); // ป้องกัน Payload ใหญ่เกิน
app.use(express.static(path.join(__dirname, 'public')));

// เส้นทางสำหรับเช็คสถานะและปลุกเซิร์ฟเวอร์
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});
// ==========================================
// CONFIGURATION
// ==========================================
// แก้ไขหมายเลข PromptPay ตรงนี้ (หรือตั้งค่าผ่าน Environment Variables บน Cloud)
const PROMPTPAY_ID = process.env.PROMPTPAY_ID || '0828683379';
const PORT = process.env.PORT || 3000;

// ตั้งค่า Multer สำหรับอัปโหลดไฟล์จำลอง (เก็บไว้ใน memory ไม่บันทึกลงเครื่องเพื่อความเร็ว)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ==========================================
// API ROUTES
// ==========================================

// 1. API สร้าง QR Code
app.post('/generate-qr', apiLimiter, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'ยอดเงินไม่ถูกต้อง' });
        }

        const payload = generatePayload(PROMPTPAY_ID, { amount: parseFloat(amount) });
        const qrImageBase64 = await qrcode.toDataURL(payload, {
            color: { dark: '#000000', light: '#ffffff' }
        });

        res.json({ qrCode: qrImageBase64 });
    } catch (error) {
        console.error('Error generating QR:', error);
        res.status(500).json({ error: 'สร้าง QR Code ล้มเหลว' });
    }
});

// 3. API สำหรับสตรีมเสียง TTS โดยตรงผ่านเซิร์ฟเวอร์ (แก้ปัญหา Google บล็อกบราวเซอร์)
app.get('/tts', async (req, res) => {
    try {
        const text = req.query.text || '';
        const lang = req.query.lang || 'th';
        const slow = req.query.slow === 'true';

        if (!text) {
            return res.status(400).send('No text provided');
        }

        const base64Audio = await googleTTS.getAudioBase64(text, {
            lang: lang,
            slow: slow,
            timeout: 10000,
        });

        const buffer = Buffer.from(base64Audio, 'base64');
        res.set({
            'Content-Type': 'audio/mp3',
            'Content-Length': buffer.length,
            'Cache-Control': 'public, max-age=3600'
        });
        res.send(buffer);
    } catch (error) {
        console.error('Error generating TTS audio:', error);
        res.status(500).json({ error: 'TTS generation failed' });
    }
});

// 2. API อัปโหลดสลิปและประมวลผลเสียง
app.post('/upload-slip', apiLimiter, upload.single('slip'), async (req, res) => {
    try {
        // ระบบกำจัด HTML Tags เบื้องต้นป้องกัน XSS (Cross-Site Scripting)
        const sanitize = (str) => str ? String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;').trim() : '';

        // ดึงข้อมูลฟอร์ม
        const name = sanitize(req.body.name) || 'ผู้ไม่ประสงค์ออกนาม';
        const amount = req.body.amount || 0;
        const message = sanitize(req.body.message) || '';
        const voice = req.body.voice || 'th-TH'; // รับค่า voice จากหน้าเว็บ

        // จำลองการตรวจสลิป (ในระบบจริงต้องเรียก API ตรวจสลิปที่นี่)
        const isSlipValid = true;

        if (!isSlipValid) {
            return res.status(400).json({ error: 'สลิปไม่ถูกต้อง' });
        }

        // ข้อความที่จะให้บอทอ่าน (เช่น "คุณสมชาย โดเนท 50 บาท บอกว่า สู้ๆครับ")
        let textToSpeech = `คุณ ${name} โดเนท ${amount} บาท`;
        if (message) {
            textToSpeech += ` บอกว่า ${message}`;
        }

        let lang = 'th';
        let slow = false;

        if (voice === 'th-TH-slow') {
            slow = true;
        } else if (voice === 'en-US') {
            lang = 'en';
        }

        // ดึงเสียง Base64 จาก Google TTS ผ่าน Backend Server โดยตรง
        let audioUrl = `/tts?text=${encodeURIComponent(textToSpeech)}&lang=${lang}&slow=${slow}`;
        try {
            const base64Audio = await googleTTS.getAudioBase64(textToSpeech, {
                lang: lang,
                slow: slow,
                timeout: 10000,
            });
            audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        } catch (ttsErr) {
            console.warn('Direct base64 TTS failed, falling back to /tts stream:', ttsErr.message);
        }

        // ส่งข้อมูลให้ Overlay ผ่าน Socket.io
        io.emit('new-donation', {
            name,
            amount,
            message,
            audioUrl,
            voice
        });

        res.json({ success: true, message: 'โดเนทสำเร็จ' });
    } catch (error) {
        console.error('Error processing donation:', error);
        res.status(500).json({ error: 'ประมวลผลล้มเหลว' });
    }
});

// ==========================================
// WEBSOCKET & SERVER START
// ==========================================
io.on('connection', (socket) => {
    console.log(`[Socket] Overlay connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`[Socket] Overlay disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`OBS Overlay URL: http://localhost:${PORT}/overlay.html`);

    // ระบบป้องกันเว็บหลับ (Self-ping) สำหรับ Render ฟรี ทุกๆ 14 นาที
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        const client = url.startsWith('https') ? https : http;
        client.get(`${url}/ping`, (resp) => {
            console.log(`[Keep-Alive] Pinged ${url} - Status: ${resp.statusCode}`);
        }).on('error', (err) => {
            console.error('[Keep-Alive] Error:', err.message);
        });
    }, 14 * 60 * 1000);
});
