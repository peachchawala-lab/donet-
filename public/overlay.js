// รองรับทั้งแบบมี token ใน query param (เช่น overlay.html?token=xxx) หรือแบบ default
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

const socket = io({
    query: token ? { token } : {}
});

// ระบบ Audio Context & Unlock
let audioUnlocked = false;
let audioContext = null;

function getAudioContext() {
    if (!audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            audioContext = new AudioCtx();
        }
    }
    return audioContext;
}

function unlockAudio() {
    audioUnlocked = true;
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume();
    }
    
    // ทดลองเปิดเสียงเบาๆ เพื่อปลดล็อก Autoplay Policy
    const dummyAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    dummyAudio.play().catch(() => {});

    // ซ่อนปุ่มปลดล็อก
    const prompt = document.getElementById('audioUnlockPrompt');
    if (prompt) {
        prompt.classList.add('hidden');
    }
}

// ปลดล็อกอัตโนมัติเมื่อมีการคลิกที่ใดก็ได้บนหน้าจอ
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// ฟังก์ชันสำหรับจำลองการแจ้งเตือน (Test Alert Trigger)
function triggerTestAlert() {
    unlockAudio();
    const testDonations = [
        {
            name: 'สมชาย ใจดี',
            amount: 500,
            message: 'ขอบคุณสำหรับสตรีมสนุกๆ ครับ เป็นกำลังใจให้เสมอ!',
            voice: 'th-TH'
        },
        {
            name: 'พี่เอก HEARTROCKER',
            amount: 1000,
            message: 'สู้ๆ นะครับน้อง ขอให้สตรีมปังๆ ร่ำรวยๆ ครับ',
            voice: 'th-TH'
        },
        {
            name: 'John Gamer',
            amount: 300,
            message: 'Awesome stream! Keep up the great work!',
            voice: 'en-US'
        }
    ];
    
    // สุ่มเลือก 1 ข้อความตัวอย่าง
    const sample = { ...testDonations[Math.floor(Math.random() * testDonations.length)] };
    
    let speechText = `คุณ ${sample.name} โดเนท ${sample.amount} บาท`;
    if (sample.message) {
        speechText += ` บอกว่า ${sample.message}`;
    }
    
    const lang = sample.voice === 'en-US' ? 'en' : 'th';
    const slow = sample.voice === 'th-TH-slow';
    
    // ดึงเสียงภาษาไทยแท้ๆ ผ่าน Backend Proxy
    sample.audioUrl = `/tts?text=${encodeURIComponent(speechText)}&lang=${lang}&slow=${slow}`;
    
    queue.push(sample);
    processQueue();
}

// เสียงแจ้งเตือน Chime แบบ Web Audio API (ไม่ต้องโหลดไฟล์จากภายนอก)
function playNotificationChime() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;
        
        // โน้ตที่ 1 (E5 - 659.25 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.45);

        // โน้ตที่ 2 (A5 - 880 Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.12);
        gain2.gain.setValueAtTime(0.35, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.65);
    } catch (e) {
        console.warn('[Audio] Chime error:', e);
    }
}

// ระบบสังเคราะห์เสียงสำรอง (Web Speech API) เมื่อ Google TTS ใช้งานไม่ได้
function speakWithWebSpeech(text, voiceType, onEndCallback) {
    if (!('speechSynthesis' in window)) {
        if (onEndCallback) onEndCallback();
        return;
    }

    try {
        window.speechSynthesis.cancel(); // ล้างค้างเก่า
        const utterance = new SpeechSynthesisUtterance(text);

        if (voiceType === 'en-US') {
            utterance.lang = 'en-US';
            utterance.rate = 1.0;
        } else if (voiceType === 'th-TH-slow') {
            utterance.lang = 'th-TH';
            utterance.rate = 0.85;
        } else {
            utterance.lang = 'th-TH';
            utterance.rate = 1.0;
        }

        let isFinished = false;
        const done = () => {
            if (!isFinished) {
                isFinished = true;
                if (onEndCallback) onEndCallback();
            }
        };

        utterance.onend = done;
        utterance.onerror = (err) => {
            console.warn('[TTS] Web Speech error:', err);
            done();
        };

        // กันเสียงค้าง
        setTimeout(done, 15000);

        window.speechSynthesis.speak(utterance);
    } catch (err) {
        console.warn('[TTS] Web Speech exception:', err);
        if (onEndCallback) onEndCallback();
    }
}

// คิวของรายการโดเนท
const queue = [];
let isPlaying = false;

const alertContainer = document.getElementById('alertContainer');
const donorName = document.getElementById('donorName');
const donorAmount = document.getElementById('donorAmount');
const donorMessage = document.getElementById('donorMessage');
const messageWrapper = document.getElementById('messageWrapper');

// รับ event จาก server
socket.on('connect', () => {
    console.log('[Socket] Connected to server successfully');
});

socket.on('new-donation', (data) => {
    console.log('[Socket] Received donation event:', data);
    queue.push(data);
    processQueue();
});

function processQueue() {
    if (isPlaying || queue.length === 0) return;

    isPlaying = true;
    const current = queue.shift();

    // กำหนดข้อมูลลงบนหน้าจอ
    donorName.textContent = current.name || 'ผู้ไม่ประสงค์ออกนาม';
    donorAmount.textContent = Number(current.amount).toLocaleString('th-TH');
    
    if (current.message && current.message.trim() !== '') {
        donorMessage.textContent = current.message;
        messageWrapper.style.display = 'block';
    } else {
        messageWrapper.style.display = 'none';
    }

    // แสดง Animation แจ้งเตือนขึ้นจอ
    alertContainer.classList.add('show');

    // เล่นเสียงแจ้งเตือนกระดิ่ง Chime ทันที
    playNotificationChime();

    // สร้างข้อความอ่าน TTS
    let speechText = `คุณ ${current.name || 'ผู้ไม่ประสงค์ออกนาม'} โดเนท ${current.amount} บาท`;
    if (current.message && current.message.trim() !== '') {
        speechText += ` บอกว่า ${current.message}`;
    }

    const voiceType = current.voice || 'th-TH';

    // ฟังก์ชันสำหรับปิด Alert และไปคิวถัดไป
    const finishAlert = () => {
        setTimeout(() => {
            alertContainer.classList.remove('show');
            setTimeout(() => {
                isPlaying = false;
                processQueue();
            }, 600);
        }, 2200); // แสดงข้อความค้างไว้ 2.2 วินาทีหลังจากอ่านจบ
    };

    // หน่วงเวลา 0.5 วินาทีให้เสียง Chime จบก่อนเริ่มอ่าน TTS
    setTimeout(() => {
        if (current.audioUrl) {
            const audio = new Audio(current.audioUrl);

            audio.onended = () => {
                finishAlert();
            };

            audio.onerror = (e) => {
                console.warn('[TTS] Google TTS URL failed/blocked, falling back to Web Speech API...', e);
                speakWithWebSpeech(speechText, voiceType, finishAlert);
            };

            audio.play().catch(err => {
                console.warn('[TTS] Audio play blocked/failed, falling back to Web Speech API...', err);
                speakWithWebSpeech(speechText, voiceType, finishAlert);
            });
        } else {
            speakWithWebSpeech(speechText, voiceType, finishAlert);
        }
    }, 500);
}

