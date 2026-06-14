const socket = io();

// ระบบ Queue
const queue = [];
let isPlaying = false;

const alertContainer = document.getElementById('alertContainer');
const donorName = document.getElementById('donorName');
const donorAmount = document.getElementById('donorAmount');
const donorMessage = document.getElementById('donorMessage');

// รับ event จาก server
socket.on('new-donation', (data) => {
    console.log('Received new donation:', data);
    queue.push(data);
    processQueue();
});

function processQueue() {
    if (isPlaying || queue.length === 0) return;

    isPlaying = true;
    const currentDonation = queue.shift();

    // กำหนดข้อมูลลงบนหน้าจอ
    donorName.textContent = currentDonation.name;
    donorAmount.textContent = currentDonation.amount;
    donorMessage.textContent = currentDonation.message;

    // แสดง Animation
    alertContainer.classList.add('show');

    // เตรียมเล่นเสียง
    const audio = new Audio(currentDonation.audioUrl);

    audio.onended = () => {
        // เมื่อเสียงจบ รอแป๊บนึงค่อยปิด popup
        setTimeout(() => {
            alertContainer.classList.remove('show');
            
            // รอให้ animation ปิดจบ แล้วค่อยดึงคิวถัดไปมาเล่น
            setTimeout(() => {
                isPlaying = false;
                processQueue();
            }, 600); // 600ms คือเวลาที่เผื่อให้ CSS transition ทำงานเสร็จ
            
        }, 2000); // แสดงข้อความค้างไว้ 2 วินาทีหลังจากอ่านจบ
    };

    audio.onerror = (e) => {
        console.error("Audio playback error", e);
        // ถึงจะ error ก็ต้องข้ามคิวไป ไม่ให้คิวค้าง
        setTimeout(() => {
            alertContainer.classList.remove('show');
            setTimeout(() => {
                isPlaying = false;
                processQueue();
            }, 600);
        }, 3000); // โชว์ 3 วิถ้าไม่มีเสียง
    };

    // เล่นเสียง
    audio.play().catch(err => {
        console.error("Autoplay prevented or error:", err);
        // จัดการกรณีที่ Browser บล็อก Autoplay 
        // สำหรับ OBS มักจะไม่ติดปัญหานี้ แต่ใส่เผื่อไว้
        audio.onerror();
    });
}
